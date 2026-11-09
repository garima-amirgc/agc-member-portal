const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker → "90 Day Commitments" radio choice.
 *
 * Backs the "90 Day Commitments" board (see SltCommitmentBoard.jsx), using
 * the slt_commitment_register table (config/database/{sqlite,postgres}.js —
 * see the comment on that table's migration for why it's named
 * slt_commitment_register and not slt_commitments/slt_commitment_checkins).
 * Column set mirrors the uploaded source workbook's "90-Commitments" sheet
 * (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx) — its
 * "CommitmentsTable" Excel Table, header row 12, columns A:W — minus that
 * table's five computed columns (Original Due, 30-Day Due, 60-Day Due,
 * Current Due, Report Cue), which this service derives instead in
 * mapCommitment() below, exactly mirroring the sheet's own formulas: editing
 * Date Assigned (or Date Entered, Revised Due, Delivered On, Completion
 * Status) automatically recomputes every derived field, the same way the
 * workbook's live formulas did, rather than storing a due date that could
 * drift out of sync with the fields it's computed from.
 *
 * Same archive-only soft-delete convention as Action Register and
 * Decisions. Reuses the shared slt_audit_log infrastructure with
 * entityType "commitment" (added to ENTITY_TYPES in sltAudit.service.js).
 */

const MAX_TEXT = 4000;

function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

function notFound(message) {
  const e = new Error(message);
  e.statusCode = 404;
  return e;
}

function normalizeText(raw, { required = false, label = "This field", max = MAX_TEXT } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (required && !s) throw badRequest(`${label} is required.`);
  if (s.length > max) throw badRequest(`${label} is too long.`);
  return s || null;
}

function normalizeDate(raw, { label = "This field" } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`${label} must be a valid date (YYYY-MM-DD).`);
  return s;
}

// RAG Status / Completion Status / Extension Approved By all drive the
// open/overdue/report-cue logic below (and in sltCommitmentAnalytics.js) by
// exact string match, same reasoning as Action Register's/Decisions' fixed-
// list fields — kept in sync with frontend/src/constants/
// sltCommitmentLists.js, extracted from the same workbook's "Lists &
// Controls" sheet (the x14 data-validation ranges feeding
// 90-Commitments!E and !O). RAG Status text is the sheet's own three
// options with the leading emoji stripped (the UI renders its own colored
// badge from the plain text instead). Extension Approved By is kept as a
// closed list — matching the sheet's own enforced "Not Authorized
// Approver" validation error — rather than free text like Owner.
const RAG_STATUS_OPTIONS = ["Not Started / At Risk", "In Progress / Carried Forward", "Met / On Track"];
const COMPLETION_STATUS_OPTIONS = ["Open", "Closed"];
const EXTENSION_APPROVER_OPTIONS = ["Tony", "Sherry", "Adam", "Tom"];

function normalizeFixedChoice(raw, options, { label, fallback }) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return fallback;
  const match = options.find((o) => o.toLowerCase() === s.toLowerCase());
  if (!match) throw badRequest(`${label} must be one of: ${options.join(", ")}.`);
  return match;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(fromIso, days) {
  if (!fromIso) return null;
  const d = new Date(`${fromIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Display ID — same reasoning as Action Register's/Decisions' displayId():
// a simpler, always-consistent stand-in for the source sheet's own
// "C90-####"-style computed ID column.
function displayId(id) {
  return `C90-${String(id).padStart(4, "0")}`;
}

// mapCommitment() derives every field the source sheet computed with a
// formula, from the same inputs the sheet's own formulas used:
//   Original Due   = (Date Assigned, falling back to Date Entered) + 90 days
//   30-Day Due     = same start date + 30 days
//   60-Day Due     = same start date + 60 days
//   Current Due    = Revised Due if set, else Original Due
//   open           = Completion Status !== "Closed"
//   overdue        = open && Current Due is in the past
//   report_cue     = overdue, or open and Current Due falls within 14 days
//                    (mirrors the sheet's "flag it for the SLT report" intent
//                    — confirmed against the uploaded file's Report Cue
//                    header; no real row had this populated yet to compare
//                    against, since all 19 are still in their first cycle)
function mapCommitment(row) {
  if (!row) return row;
  const today = todayIso();
  const startDate = row.date_assigned || row.date_entered;
  const original_due = addDaysIso(startDate, 90);
  const checkin_30_due = addDaysIso(startDate, 30);
  const checkin_60_due = addDaysIso(startDate, 60);
  const current_due = row.revised_due || original_due;
  const open = row.completion_status !== "Closed";
  const overdue = open && !!current_due && current_due < today;
  const daysUntilDue = daysBetween(today, current_due);
  const report_cue = open && (overdue || (daysUntilDue != null && daysUntilDue >= 0 && daysUntilDue <= 14));

  return {
    id: Number(row.id),
    display_id: displayId(row.id),
    commitment: row.commitment,
    success_measure: row.success_measure,
    owner: row.owner,
    rag_status: row.rag_status,
    status_note: row.status_note,
    date_entered: row.date_entered,
    date_assigned: row.date_assigned,
    original_due,
    checkin_30_due,
    checkin_30_notes: row.checkin_30_notes,
    checkin_60_due,
    checkin_60_notes: row.checkin_60_notes,
    checkin_90_update_dates: row.checkin_90_update_dates,
    extension_approved_by: row.extension_approved_by,
    ext_approval_date: row.ext_approval_date,
    revised_due: row.revised_due,
    delivered_on: row.delivered_on,
    current_due,
    completion_status: row.completion_status,
    open,
    overdue,
    days_until_due: daysUntilDue,
    report_cue,
    change_risk_next_step: row.change_risk_next_step,
    archived: !!row.archived,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT c.*, u.name AS created_by_name
  FROM slt_commitment_register c
  LEFT JOIN users u ON u.id = c.created_by
`;

async function listCommitments(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `${SELECT_SQL}
       WHERE c.archived = ?
       ORDER BY c.id ASC`
    )
    .all(archived);
  return (rows || []).map(mapCommitment);
}

async function getCommitmentById(id) {
  const commitmentId = Number(id);
  if (!Number.isFinite(commitmentId) || commitmentId < 1) throw badRequest("Invalid commitment id.");
  const row = await db.prepare(`${SELECT_SQL} WHERE c.id = ?`).get(commitmentId);
  if (!row) throw notFound("Commitment not found.");
  return mapCommitment(row);
}

// `existing` is null on create (every field must come from `body`, with
// "Commitment" the only required one) and the current row on update (any
// field `body` leaves `undefined` keeps its current value — a PATCH, not a
// PUT). Same shape as Action Register's/Decisions' readFields(). Date
// Entered defaults to today on create, same as the sheet's own "entered
// today" convention — never auto-set on update.
function readFields(body, existing) {
  const val = (key) => (body[key] !== undefined ? body[key] : existing?.[key]);
  return {
    commitment: normalizeText(val("commitment"), { required: true, label: "Commitment", max: 1000 }),
    success_measure: normalizeText(val("success_measure"), { label: "Success Measure" }),
    owner: normalizeText(val("owner"), { label: "Owner", max: 120 }),
    rag_status: normalizeFixedChoice(body.rag_status !== undefined ? body.rag_status : existing?.rag_status, RAG_STATUS_OPTIONS, {
      label: "RAG Status",
      fallback: "Not Started / At Risk",
    }),
    status_note: normalizeText(val("status_note"), { label: "Status Note" }),
    date_entered:
      body.date_entered !== undefined
        ? normalizeDate(body.date_entered, { label: "Date Entered" })
        : existing
          ? existing.date_entered
          : todayIso(),
    date_assigned:
      body.date_assigned !== undefined ? normalizeDate(body.date_assigned, { label: "Date Assigned" }) : existing?.date_assigned ?? null,
    checkin_30_notes: normalizeText(val("checkin_30_notes"), { label: "30-Day Check-in Notes" }),
    checkin_60_notes: normalizeText(val("checkin_60_notes"), { label: "60-Day Check-in Notes" }),
    checkin_90_update_dates: normalizeText(val("checkin_90_update_dates"), { label: "90-Day Update Dates", max: 500 }),
    extension_approved_by: normalizeFixedChoice(
      body.extension_approved_by !== undefined ? body.extension_approved_by : existing?.extension_approved_by,
      EXTENSION_APPROVER_OPTIONS,
      { label: "Extension Approved By", fallback: null }
    ),
    ext_approval_date:
      body.ext_approval_date !== undefined
        ? normalizeDate(body.ext_approval_date, { label: "Extension Approval Date" })
        : existing?.ext_approval_date ?? null,
    revised_due: body.revised_due !== undefined ? normalizeDate(body.revised_due, { label: "Revised Due" }) : existing?.revised_due ?? null,
    delivered_on:
      body.delivered_on !== undefined ? normalizeDate(body.delivered_on, { label: "Delivered On" }) : existing?.delivered_on ?? null,
    completion_status: normalizeFixedChoice(
      body.completion_status !== undefined ? body.completion_status : existing?.completion_status,
      COMPLETION_STATUS_OPTIONS,
      { label: "Completion Status", fallback: "Open" }
    ),
    change_risk_next_step: normalizeText(val("change_risk_next_step"), { label: "Change / Risk / Next Step" }),
  };
}

async function createCommitment(userId, body) {
  const fields = readFields(body || {}, null);
  const immutableKey = crypto.randomBytes(8).toString("hex");

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_commitment_register (${cols.join(", ")}, immutable_key, created_by) VALUES (${placeholders}, ?, ?)`)
    .run(...cols.map((c) => fields[c]), immutableKey, userId);

  void audit.logAudit({ entityType: "commitment", entityId: result.lastInsertRowid, action: "create", userId });

  const row = await db.prepare(`${SELECT_SQL} WHERE c.id = ?`).get(result.lastInsertRowid);
  return mapCommitment(row);
}

async function updateCommitment(userId, id, body) {
  const commitmentId = Number(id);
  if (!Number.isFinite(commitmentId) || commitmentId < 1) throw badRequest("Invalid commitment id.");
  const existing = await db.prepare("SELECT * FROM slt_commitment_register WHERE id = ?").get(commitmentId);
  if (!existing) throw notFound("Commitment not found.");

  const fields = readFields(body || {}, existing);

  await db
    .prepare(
      `UPDATE slt_commitment_register SET
        commitment = ?, success_measure = ?, owner = ?, rag_status = ?, status_note = ?,
        date_entered = ?, date_assigned = ?, checkin_30_notes = ?, checkin_60_notes = ?,
        checkin_90_update_dates = ?, extension_approved_by = ?, ext_approval_date = ?,
        revised_due = ?, delivered_on = ?, completion_status = ?, change_risk_next_step = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      fields.commitment,
      fields.success_measure,
      fields.owner,
      fields.rag_status,
      fields.status_note,
      fields.date_entered,
      fields.date_assigned,
      fields.checkin_30_notes,
      fields.checkin_60_notes,
      fields.checkin_90_update_dates,
      fields.extension_approved_by,
      fields.ext_approval_date,
      fields.revised_due,
      fields.delivered_on,
      fields.completion_status,
      fields.change_risk_next_step,
      commitmentId
    );

  await audit.logFieldChanges({
    entityType: "commitment",
    entityId: commitmentId,
    before: existing,
    after: fields,
    fields: [
      "commitment", "success_measure", "owner", "rag_status", "status_note",
      "date_entered", "date_assigned", "checkin_30_notes", "checkin_60_notes",
      "checkin_90_update_dates", "extension_approved_by", "ext_approval_date",
      "revised_due", "delivered_on", "completion_status", "change_risk_next_step",
    ],
    userId,
  });

  const row = await db.prepare(`${SELECT_SQL} WHERE c.id = ?`).get(commitmentId);
  return mapCommitment(row);
}

// Archive-only soft delete — see the module-level comment above.
async function archiveCommitment(userId, id) {
  const commitmentId = Number(id);
  if (!Number.isFinite(commitmentId) || commitmentId < 1) throw badRequest("Invalid commitment id.");
  const existing = await db.prepare("SELECT id FROM slt_commitment_register WHERE id = ?").get(commitmentId);
  if (!existing) throw notFound("Commitment not found.");
  await db.prepare("UPDATE slt_commitment_register SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(commitmentId);
  void audit.logAudit({ entityType: "commitment", entityId: commitmentId, action: "archive", userId });
  return getCommitmentById(commitmentId);
}

async function restoreCommitment(userId, id) {
  const commitmentId = Number(id);
  if (!Number.isFinite(commitmentId) || commitmentId < 1) throw badRequest("Invalid commitment id.");
  const existing = await db.prepare("SELECT id FROM slt_commitment_register WHERE id = ?").get(commitmentId);
  if (!existing) throw notFound("Commitment not found.");
  await db.prepare("UPDATE slt_commitment_register SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(commitmentId);
  void audit.logAudit({ entityType: "commitment", entityId: commitmentId, action: "restore", userId });
  return getCommitmentById(commitmentId);
}

module.exports = {
  RAG_STATUS_OPTIONS,
  COMPLETION_STATUS_OPTIONS,
  EXTENSION_APPROVER_OPTIONS,
  listCommitments,
  getCommitmentById,
  createCommitment,
  updateCommitment,
  archiveCommitment,
  restoreCommitment,
};
