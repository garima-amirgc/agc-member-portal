const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker — 90-Day Commitments.
 *
 * Backs the 90-Day Commitments sub-tab of the Action Tracker Executive
 * Board, using slt_commitments + slt_commitment_checkins. The source
 * sheet's due-date formulas are self-referencing / circular (they only
 * ever resolved via Excel's calc-chain quirks — see the project doc
 * "SLT Tracker - Workbook Inventory and Reconciliation.md" §3) and aren't
 * portable, so computeDueDates() below is a documented substitute, not a
 * port, matching what scripts/importSltWorkbooks.js already computes on
 * import:
 *   base            = date_assigned || date_record_entered
 *   original_due    = base + 90 days   (kept as stored if already set)
 *   checkin_30_due  = base + 30 days
 *   checkin_60_due  = base + 60 days
 *   current_due     = revised_due || original_due
 *   extension_flagged = Boolean(revised_due) && !extension_approved_by
 *
 * report_cue (the sheet's "Report cue" column) is likewise recomputed live
 * from current_due/status2 rather than ported, since its source formula
 * depended on the same broken calc chain.
 */

const MAX_TEXT = 4000;
const CLOSED_STATUSES = ["closed", "completed", "delivered", "cancelled", "canceled"];

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

function normalizeDate(raw, { required = false, label = "Date" } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`Invalid ${label.toLowerCase()}.`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

function addDays(iso, n) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Documented substitute for the source sheet's circular due-date formulas
// (see module header). Only fills in dates that aren't already set, so a
// manually-entered original_due (e.g. from the import) is never clobbered.
function computeDueDates(input) {
  const base = input.date_assigned || input.date_record_entered || null;
  const originalDue = input.original_due || (base ? addDays(base, 90) : null);
  const checkin30Due = input.checkin_30_due || (base ? addDays(base, 30) : null);
  const checkin60Due = input.checkin_60_due || (base ? addDays(base, 60) : null);
  const currentDue = input.revised_due || originalDue;
  const extensionFlagged = Boolean(input.revised_due) && !input.extension_approved_by;
  return {
    original_due: originalDue,
    checkin_30_due: checkin30Due,
    checkin_60_due: checkin60Due,
    current_due: currentDue,
    extension_flagged: extensionFlagged ? 1 : 0,
  };
}

function computeReportCue(status2, currentDue) {
  const s = String(status2 || "").trim().toLowerCase();
  if (CLOSED_STATUSES.includes(s)) return "Closed";
  if (!currentDue) return "On track";
  const today = todayIso();
  if (currentDue < today) return "Overdue";
  const d = daysBetween(today, currentDue);
  if (d !== null && d <= 7) return "Due this week";
  return "On track";
}

const EDITABLE_FIELDS = [
  "commitment_deliverable",
  "success_measure",
  "owner",
  "rag_status",
  "status1_raw",
  "date_record_entered",
  "date_assigned",
  "original_due",
  "checkin_30_due",
  "checkin_30_notes",
  "checkin_60_due",
  "checkin_60_notes",
  "checkin_90_notes",
  "extension_approved_by",
  "ext_approval_date",
  "revised_due",
  "delivered_on",
  "current_due",
  "status2",
  "change_risk_next_step",
];

function mapCommitment(row) {
  if (!row) return row;
  const today = todayIso();
  return {
    id: Number(row.id),
    legacy_id: row.legacy_id,
    commitment_deliverable: row.commitment_deliverable,
    success_measure: row.success_measure,
    owner: row.owner,
    rag_status: row.rag_status,
    status1_raw: row.status1_raw,
    date_record_entered: row.date_record_entered,
    date_assigned: row.date_assigned,
    original_due: row.original_due,
    checkin_30_due: row.checkin_30_due,
    checkin_30_notes: row.checkin_30_notes,
    checkin_60_due: row.checkin_60_due,
    checkin_60_notes: row.checkin_60_notes,
    checkin_90_notes: row.checkin_90_notes,
    extension_approved_by: row.extension_approved_by,
    ext_approval_date: row.ext_approval_date,
    revised_due: row.revised_due,
    delivered_on: row.delivered_on,
    current_due: row.current_due,
    status2: row.status2,
    report_cue: computeReportCue(row.status2, row.current_due),
    report_cue_raw: row.report_cue_raw,
    change_risk_next_step: row.change_risk_next_step,
    extension_flagged: !!row.extension_flagged,
    days_until_due: daysBetween(today, row.current_due),
    is_overdue: !!(row.current_due && row.current_due < today && !CLOSED_STATUSES.includes(String(row.status2 || "").toLowerCase())),
    immutable_key: row.immutable_key,
    archived: !!row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listCommitments(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `SELECT * FROM slt_commitments
       WHERE archived = ?
       ORDER BY (current_due IS NULL), current_due ASC, id ASC`
    )
    .all(archived);
  return (rows || []).map(mapCommitment);
}

async function getCommitmentById(id) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid < 1) throw badRequest("Invalid commitment id.");
  const row = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(cid);
  if (!row) throw notFound("Commitment not found.");
  return mapCommitment(row);
}

async function listCheckins(commitmentId) {
  const cid = Number(commitmentId);
  if (!Number.isFinite(cid) || cid < 1) throw badRequest("Invalid commitment id.");
  const rows = await db
    .prepare(`SELECT * FROM slt_commitment_checkins WHERE commitment_id = ? ORDER BY checkin_type ASC, id ASC`)
    .all(cid);
  return rows || [];
}

async function seedCheckins(userId, commitmentId, dueDates) {
  const types = [
    { type: "30", due: dueDates.checkin_30_due },
    { type: "60", due: dueDates.checkin_60_due },
    { type: "90", due: dueDates.current_due },
  ];
  for (const t of types) {
    await db
      .prepare(`INSERT INTO slt_commitment_checkins (commitment_id, checkin_type, due_date, created_by) VALUES (?, ?, ?, ?)`)
      .run(commitmentId, t.type, t.due, userId);
  }
}

async function createCommitment(userId, body) {
  const commitmentDeliverable = normalizeText(body?.commitment_deliverable, { required: true, label: "Commitment / deliverable" });
  const successMeasure = normalizeText(body?.success_measure, { label: "Success measure" });
  const owner = normalizeText(body?.owner, { required: true, label: "Owner" });
  const ragStatus = normalizeText(body?.rag_status, { label: "RAG status", max: 60 });
  const status1Raw = normalizeText(body?.status1_raw, { label: "Status", max: 60 });
  const dateRecordEntered = normalizeDate(body?.date_record_entered, { label: "Date record entered" }) || todayIso();
  const dateAssigned = normalizeDate(body?.date_assigned, { label: "Date assigned" });
  const extensionApprovedBy = normalizeText(body?.extension_approved_by, { label: "Extension approved by", max: 200 });
  const extApprovalDate = normalizeDate(body?.ext_approval_date, { label: "Extension approval date" });
  const revisedDue = normalizeDate(body?.revised_due, { label: "Revised due date" });
  const deliveredOn = normalizeDate(body?.delivered_on, { label: "Delivered on" });
  const status2 = normalizeText(body?.status2, { label: "Status", max: 60 }) || "Open";
  const changeRiskNextStep = normalizeText(body?.change_risk_next_step, { label: "Change risk / next step" });
  const originalDueInput = normalizeDate(body?.original_due, { label: "Original due date" });
  const checkin30DueInput = normalizeDate(body?.checkin_30_due, { label: "30-day check-in due" });
  const checkin60DueInput = normalizeDate(body?.checkin_60_due, { label: "60-day check-in due" });

  const dueDates = computeDueDates({
    date_assigned: dateAssigned,
    date_record_entered: dateRecordEntered,
    original_due: originalDueInput,
    checkin_30_due: checkin30DueInput,
    checkin_60_due: checkin60DueInput,
    revised_due: revisedDue,
    extension_approved_by: extensionApprovedBy,
  });

  const fields = {
    legacy_id: `C90-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    commitment_deliverable: commitmentDeliverable,
    success_measure: successMeasure,
    owner,
    rag_status: ragStatus,
    status1_raw: status1Raw,
    date_record_entered: dateRecordEntered,
    date_assigned: dateAssigned,
    original_due: dueDates.original_due,
    checkin_30_due: dueDates.checkin_30_due,
    checkin_30_notes: normalizeText(body?.checkin_30_notes, { label: "30-day check-in notes" }),
    checkin_60_due: dueDates.checkin_60_due,
    checkin_60_notes: normalizeText(body?.checkin_60_notes, { label: "60-day check-in notes" }),
    checkin_90_notes: normalizeText(body?.checkin_90_notes, { label: "90-day check-in notes" }),
    extension_approved_by: extensionApprovedBy,
    ext_approval_date: extApprovalDate,
    revised_due: revisedDue,
    delivered_on: deliveredOn,
    current_due: dueDates.current_due,
    status2,
    report_cue_raw: null,
    change_risk_next_step: changeRiskNextStep,
    extension_flagged: dueDates.extension_flagged,
    immutable_key: crypto.randomBytes(8).toString("hex"),
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_commitments (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  await seedCheckins(userId, result.lastInsertRowid, dueDates);
  const row = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(result.lastInsertRowid);
  await audit.logAudit({ entityType: "commitment", entityId: row.id, action: "create", userId });
  return mapCommitment(row);
}

async function updateCommitment(userId, id, body) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid < 1) throw badRequest("Invalid commitment id.");
  const existing = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(cid);
  if (!existing) throw notFound("Commitment not found.");

  const next = { ...existing };
  if (body?.commitment_deliverable !== undefined)
    next.commitment_deliverable = normalizeText(body.commitment_deliverable, { required: true, label: "Commitment / deliverable" });
  if (body?.success_measure !== undefined) next.success_measure = normalizeText(body.success_measure, { label: "Success measure" });
  if (body?.owner !== undefined) next.owner = normalizeText(body.owner, { required: true, label: "Owner" });
  if (body?.rag_status !== undefined) next.rag_status = normalizeText(body.rag_status, { label: "RAG status", max: 60 });
  if (body?.status1_raw !== undefined) next.status1_raw = normalizeText(body.status1_raw, { label: "Status", max: 60 });
  if (body?.date_record_entered !== undefined) next.date_record_entered = normalizeDate(body.date_record_entered, { label: "Date record entered" });
  if (body?.date_assigned !== undefined) next.date_assigned = normalizeDate(body.date_assigned, { label: "Date assigned" });
  if (body?.original_due !== undefined) next.original_due = normalizeDate(body.original_due, { label: "Original due date" });
  if (body?.checkin_30_due !== undefined) next.checkin_30_due = normalizeDate(body.checkin_30_due, { label: "30-day check-in due" });
  if (body?.checkin_30_notes !== undefined) next.checkin_30_notes = normalizeText(body.checkin_30_notes, { label: "30-day check-in notes" });
  if (body?.checkin_60_due !== undefined) next.checkin_60_due = normalizeDate(body.checkin_60_due, { label: "60-day check-in due" });
  if (body?.checkin_60_notes !== undefined) next.checkin_60_notes = normalizeText(body.checkin_60_notes, { label: "60-day check-in notes" });
  if (body?.checkin_90_notes !== undefined) next.checkin_90_notes = normalizeText(body.checkin_90_notes, { label: "90-day check-in notes" });
  if (body?.extension_approved_by !== undefined)
    next.extension_approved_by = normalizeText(body.extension_approved_by, { label: "Extension approved by", max: 200 });
  if (body?.ext_approval_date !== undefined) next.ext_approval_date = normalizeDate(body.ext_approval_date, { label: "Extension approval date" });
  if (body?.revised_due !== undefined) next.revised_due = normalizeDate(body.revised_due, { label: "Revised due date" });
  if (body?.delivered_on !== undefined) next.delivered_on = normalizeDate(body.delivered_on, { label: "Delivered on" });
  if (body?.status2 !== undefined) next.status2 = normalizeText(body.status2, { label: "Status", max: 60 }) || "Open";
  if (body?.change_risk_next_step !== undefined)
    next.change_risk_next_step = normalizeText(body.change_risk_next_step, { label: "Change risk / next step" });

  // Recompute whichever due-date fields the caller didn't explicitly set
  // themselves, same substitute formula used on create/import.
  const recomputed = computeDueDates({
    date_assigned: next.date_assigned,
    date_record_entered: next.date_record_entered,
    original_due: body?.original_due !== undefined ? next.original_due : existing.original_due,
    checkin_30_due: body?.checkin_30_due !== undefined ? next.checkin_30_due : existing.checkin_30_due,
    checkin_60_due: body?.checkin_60_due !== undefined ? next.checkin_60_due : existing.checkin_60_due,
    revised_due: next.revised_due,
    extension_approved_by: next.extension_approved_by,
  });
  next.original_due = recomputed.original_due;
  next.checkin_30_due = recomputed.checkin_30_due;
  next.checkin_60_due = recomputed.checkin_60_due;
  next.current_due = recomputed.current_due;
  next.extension_flagged = recomputed.extension_flagged;

  await db
    .prepare(
      `UPDATE slt_commitments SET
        commitment_deliverable = ?, success_measure = ?, owner = ?, rag_status = ?, status1_raw = ?,
        date_record_entered = ?, date_assigned = ?, original_due = ?, checkin_30_due = ?, checkin_30_notes = ?,
        checkin_60_due = ?, checkin_60_notes = ?, checkin_90_notes = ?, extension_approved_by = ?,
        ext_approval_date = ?, revised_due = ?, delivered_on = ?, current_due = ?, status2 = ?,
        change_risk_next_step = ?, extension_flagged = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      next.commitment_deliverable,
      next.success_measure,
      next.owner,
      next.rag_status,
      next.status1_raw,
      next.date_record_entered,
      next.date_assigned,
      next.original_due,
      next.checkin_30_due,
      next.checkin_30_notes,
      next.checkin_60_due,
      next.checkin_60_notes,
      next.checkin_90_notes,
      next.extension_approved_by,
      next.ext_approval_date,
      next.revised_due,
      next.delivered_on,
      next.current_due,
      next.status2,
      next.change_risk_next_step,
      next.extension_flagged,
      cid
    );

  await audit.logFieldChanges({ entityType: "commitment", entityId: cid, before: existing, after: next, fields: EDITABLE_FIELDS, userId });
  const row = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(cid);
  return mapCommitment(row);
}

async function setCommitmentArchived(userId, id, archived) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid < 1) throw badRequest("Invalid commitment id.");
  const existing = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(cid);
  if (!existing) throw notFound("Commitment not found.");
  await db.prepare("UPDATE slt_commitments SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, cid);
  await audit.logAudit({ entityType: "commitment", entityId: cid, action: archived ? "archive" : "restore", userId });
  const row = await db.prepare("SELECT * FROM slt_commitments WHERE id = ?").get(cid);
  return mapCommitment(row);
}

async function completeCheckin(userId, checkinId, notes) {
  const id = Number(checkinId);
  if (!Number.isFinite(id) || id < 1) throw badRequest("Invalid check-in id.");
  const existing = await db.prepare("SELECT * FROM slt_commitment_checkins WHERE id = ?").get(id);
  if (!existing) throw notFound("Check-in not found.");
  const cleanNotes = normalizeText(notes, { label: "Check-in notes" });
  await db
    .prepare("UPDATE slt_commitment_checkins SET completed_at = datetime('now'), notes = ? WHERE id = ?")
    .run(cleanNotes, id);
  await audit.logAudit({ entityType: "commitment", entityId: existing.commitment_id, action: `checkin_${existing.checkin_type}_completed`, userId });
  return db.prepare("SELECT * FROM slt_commitment_checkins WHERE id = ?").get(id);
}

module.exports = {
  listCommitments,
  getCommitmentById,
  listCheckins,
  createCommitment,
  updateCommitment,
  setCommitmentArchived,
  completeCheckin,
  computeDueDates,
  computeReportCue,
};
