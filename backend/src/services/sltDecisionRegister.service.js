const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker — Decisions (Decision Queue / Decision Register).
 *
 * Backs the "Decisions" tab inside the SLT Tracker board
 * (SltActionTrackerBoard.jsx's top-level tabs; see SltDecisionBoard.jsx for
 * the UI itself), using the slt_decision_register table
 * (config/database/{sqlite,postgres}.js). Column set mirrors the data-entry
 * columns the source workbook's "Decision Queue" and "Decision Register"
 * sheets have in common (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_
 * Master_1.xlsx, columns A:U on both) — Decision Required, Workstream,
 * Assigned To, Decision Deadline, Recommendation, Status, Decision Type,
 * CEO/CFO Attention, Financial Impact, Risk Impact, Strategic Objective,
 * Decision Date, Further Action Required, Context / Input Required, Owned
 * By, Requested By, Date Raised, Delay Impact / Risk, Blocker / Waiting On,
 * Notes. (Columns V:AN on those sheets are a leftover, never-cleaned-up
 * "Decision Log" sub-schema from an earlier iteration of the workbook —
 * mostly blank/inconsistent in the real data and not part of the "Decision
 * Queue Viewer"/"Decision Record Viewer" board-ready field list either, so
 * intentionally not carried over here, same reasoning as leaving out Action
 * Register's three computed columns.)
 *
 * IMPORTANT DESIGN DEVIATION FROM THE WORKBOOK: in the source file, Decision
 * Queue and Decision Register are two SEPARATE sheets with identical
 * columns — a decision lives in Decision Queue while pending, and once
 * Status becomes "Completed" or "Cancelled" someone manually copies the row
 * into Decision Register and clears the Queue row (see the workbook's own
 * instructions in Decision Queue!A3). That's a two-table, copy-paste
 * design. Here there is only ONE table: listDecisions() below splits it
 * into "queue" (active) vs "register" (decided) by computing the exact same
 * condition the sheet's own Active Record formula used —
 * =IF(OR(Status="Completed",Status="Cancelled"),"INACTIVE","ACTIVE") — so a
 * decision just moves tabs automatically the instant its Status changes,
 * with nothing to copy or clear by hand. Note this INACTIVE set is
 * Completed/Cancelled ONLY, unlike slt_action_register's (which also
 * includes "Deferred") — a Deferred decision hasn't been decided yet, so it
 * correctly stays in the Queue, matching the workbook's own formula exactly
 * (confirmed against the real data: the uploaded sheet's DEC-0002 row has
 * Status="Deferred" and lives in Decision Queue, not Decision Register).
 *
 * Uses the same archive-only soft-delete convention as Action Register
 * ("Action Register, Decisions, 90-Day Commitments" — see the comment on
 * slt_calendar's old DROP TABLE migration in postgres.js) for a separate
 * "hide without deciding it" case, independent of the queue/register split
 * above — archived is never implied by Status.
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

// Status/Decision Type/CEO-CFO Attention/Financial Impact/Risk Impact/
// Further Action Required all drive the active/overdue/board-filtering
// logic below (and in sltDecisionAnalytics.js) by exact string match, same
// reasoning as Action Register's fixed-list fields — kept in sync with
// frontend/src/constants/sltDecisionLists.js, extracted from the same
// workbook's "Lists & Controls" sheet (the x14 data-validation ranges
// feeding Decision Queue!H:N and Decision Register!H:N).
const STATUS_OPTIONS = [
  "Not Started", "Assigned", "In Progress", "Waiting on Assignee", "Waiting on Information",
  "At Risk", "Stuck", "Deferred", "Completed", "Cancelled", "Visibility Only",
  "Gathering Info", "Waiting on Decision",
];
const DECISION_TYPE_OPTIONS = [
  "Information Only", "Recommendation Required", "Approval Required",
  "Capital Approval", "Policy Approval", "Strategic Decision", "Governance Decision",
];
const CEO_CFO_ATTENTION_OPTIONS = ["CEO", "CFO", "CEO & CFO", "SLT", "No", "President", "VP OPS"];
const FINANCIAL_IMPACT_OPTIONS = ["<$10K", "$10K-$50K", "$50K-$250K", ">$250K", "Unknown / TBD"];
const RISK_IMPACT_OPTIONS = ["High", "Medium", "Low"];
const FURTHER_ACTION_OPTIONS = ["Yes", "No"];

// Statuses that move a decision from Queue to Register — matches the
// source sheet's Active Record formula exactly (Completed/Cancelled only;
// see the module comment above for why Deferred is NOT included here,
// unlike Action Register's INACTIVE_STATUSES).
const INACTIVE_STATUSES = new Set(["Completed", "Cancelled"]);

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

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Display ID — same reasoning as Action Register's displayId(): a simpler,
// always-consistent stand-in for the source workbook's two parallel ID
// schemes ("DEC-####" for queue-issued decisions, "HIST-2026-###" for
// decisions entered directly into the Register). This table's own `id` is
// already a stable, never-reused identity, so every decision just gets
// "DEC-0007" straight from its row id, regardless of how it was entered.
function displayId(id) {
  return `DEC-${String(id).padStart(4, "0")}`;
}

function mapDecision(row) {
  if (!row) return row;
  const today = todayIso();
  const active = !INACTIVE_STATUSES.has(row.status);
  const overdue = active && !!row.decision_deadline && row.decision_deadline < today;
  return {
    id: Number(row.id),
    display_id: displayId(row.id),
    decision_required: row.decision_required,
    workstream: row.workstream,
    assigned_to: row.assigned_to,
    decision_deadline: row.decision_deadline,
    recommendation: row.recommendation,
    status: row.status,
    decision_type: row.decision_type,
    ceo_cfo_attention: row.ceo_cfo_attention,
    financial_impact: row.financial_impact,
    risk_impact: row.risk_impact,
    strategic_objective: row.strategic_objective,
    decision_date: row.decision_date,
    further_action_required: row.further_action_required,
    context_input_required: row.context_input_required,
    owned_by: row.owned_by,
    requested_by: row.requested_by,
    date_raised: row.date_raised,
    delay_impact_risk: row.delay_impact_risk,
    blocker: row.blocker,
    notes: row.notes,
    active,
    decided: !active,
    overdue,
    days_until_deadline: daysBetween(today, row.decision_deadline),
    archived: !!row.archived,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT d.*, u.name AS created_by_name
  FROM slt_decision_register d
  LEFT JOIN users u ON u.id = d.created_by
`;

// Single list, same as Action Register's listActionItems() — the
// Queue/Register split (and Board-Summary-style slicing, if ever added) is
// done client-side from this one list, same pattern as
// sltActionAnalytics.js does for the Action Tracker tab. Sorted by deadline
// (soonest/oldest-missing-deadline first) then id, which reads sensibly for
// both the still-pending Queue rows and the already-decided Register rows.
async function listDecisions(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `${SELECT_SQL}
       WHERE d.archived = ?
       ORDER BY (d.decision_deadline IS NULL), d.decision_deadline ASC, d.id ASC`
    )
    .all(archived);
  return (rows || []).map(mapDecision);
}

async function getDecisionById(id) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id.");
  const row = await db.prepare(`${SELECT_SQL} WHERE d.id = ?`).get(decisionId);
  if (!row) throw notFound("Decision not found.");
  return mapDecision(row);
}

// `existing` is null on create (every field must come from `body`, with
// "Decision Required" the only required one) and the current row on update
// (any field `body` leaves `undefined` keeps its current value — a PATCH,
// not a PUT). Same shape as Action Register's readFields().
function readFields(body, existing) {
  const val = (key) => (body[key] !== undefined ? body[key] : existing?.[key]);
  return {
    decision_required: normalizeText(val("decision_required"), { required: true, label: "Decision Required", max: 1000 }),
    workstream: normalizeText(val("workstream"), { label: "Workstream", max: 120 }),
    assigned_to: normalizeText(val("assigned_to"), { label: "Assigned To", max: 120 }),
    decision_deadline:
      body.decision_deadline !== undefined
        ? normalizeDate(body.decision_deadline, { label: "Decision Deadline" })
        : existing?.decision_deadline ?? null,
    recommendation: normalizeText(val("recommendation"), { label: "Recommendation" }),
    status: normalizeFixedChoice(body.status !== undefined ? body.status : existing?.status, STATUS_OPTIONS, {
      label: "Status",
      fallback: "Not Started",
    }),
    decision_type: normalizeFixedChoice(
      body.decision_type !== undefined ? body.decision_type : existing?.decision_type,
      DECISION_TYPE_OPTIONS,
      { label: "Decision Type", fallback: null }
    ),
    ceo_cfo_attention: normalizeFixedChoice(
      body.ceo_cfo_attention !== undefined ? body.ceo_cfo_attention : existing?.ceo_cfo_attention,
      CEO_CFO_ATTENTION_OPTIONS,
      { label: "CEO/CFO Attention", fallback: null }
    ),
    financial_impact: normalizeFixedChoice(
      body.financial_impact !== undefined ? body.financial_impact : existing?.financial_impact,
      FINANCIAL_IMPACT_OPTIONS,
      { label: "Financial Impact", fallback: null }
    ),
    risk_impact: normalizeFixedChoice(
      body.risk_impact !== undefined ? body.risk_impact : existing?.risk_impact,
      RISK_IMPACT_OPTIONS,
      { label: "Risk Impact", fallback: null }
    ),
    strategic_objective: normalizeText(val("strategic_objective"), { label: "Strategic Objective", max: 120 }),
    decision_date:
      body.decision_date !== undefined ? normalizeDate(body.decision_date, { label: "Decision Date" }) : existing?.decision_date ?? null,
    further_action_required: normalizeFixedChoice(
      body.further_action_required !== undefined ? body.further_action_required : existing?.further_action_required,
      FURTHER_ACTION_OPTIONS,
      { label: "Further Action Required", fallback: "No" }
    ),
    context_input_required: normalizeText(val("context_input_required"), { label: "Context / Input Required" }),
    owned_by: normalizeText(val("owned_by"), { label: "Owned By", max: 120 }),
    requested_by: normalizeText(val("requested_by"), { label: "Requested By", max: 120 }),
    date_raised: body.date_raised !== undefined ? normalizeDate(body.date_raised, { label: "Date Raised" }) : existing?.date_raised ?? null,
    delay_impact_risk: normalizeText(val("delay_impact_risk"), { label: "Delay Impact / Risk" }),
    blocker: normalizeText(val("blocker"), { label: "Blocker / Waiting On" }),
    notes: normalizeText(val("notes"), { label: "Notes" }),
  };
}

async function createDecision(userId, body) {
  const fields = readFields(body || {}, null);
  const immutableKey = crypto.randomBytes(8).toString("hex");

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_decision_register (${cols.join(", ")}, immutable_key, created_by) VALUES (${placeholders}, ?, ?)`)
    .run(...cols.map((c) => fields[c]), immutableKey, userId);

  void audit.logAudit({ entityType: "decision", entityId: result.lastInsertRowid, action: "create", userId });

  const row = await db.prepare(`${SELECT_SQL} WHERE d.id = ?`).get(result.lastInsertRowid);
  return mapDecision(row);
}

async function updateDecision(userId, id, body) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id.");
  const existing = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(decisionId);
  if (!existing) throw notFound("Decision not found.");

  const fields = readFields(body || {}, existing);

  await db
    .prepare(
      `UPDATE slt_decision_register SET
        decision_required = ?, workstream = ?, assigned_to = ?, decision_deadline = ?, recommendation = ?,
        status = ?, decision_type = ?, ceo_cfo_attention = ?, financial_impact = ?, risk_impact = ?,
        strategic_objective = ?, decision_date = ?, further_action_required = ?, context_input_required = ?,
        owned_by = ?, requested_by = ?, date_raised = ?, delay_impact_risk = ?, blocker = ?, notes = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      fields.decision_required,
      fields.workstream,
      fields.assigned_to,
      fields.decision_deadline,
      fields.recommendation,
      fields.status,
      fields.decision_type,
      fields.ceo_cfo_attention,
      fields.financial_impact,
      fields.risk_impact,
      fields.strategic_objective,
      fields.decision_date,
      fields.further_action_required,
      fields.context_input_required,
      fields.owned_by,
      fields.requested_by,
      fields.date_raised,
      fields.delay_impact_risk,
      fields.blocker,
      fields.notes,
      decisionId
    );

  await audit.logFieldChanges({
    entityType: "decision",
    entityId: decisionId,
    before: existing,
    after: fields,
    fields: [
      "decision_required", "workstream", "assigned_to", "decision_deadline", "recommendation",
      "status", "decision_type", "ceo_cfo_attention", "financial_impact", "risk_impact",
      "strategic_objective", "decision_date", "further_action_required", "context_input_required",
      "owned_by", "requested_by", "date_raised", "delay_impact_risk", "blocker", "notes",
    ],
    userId,
  });

  const row = await db.prepare(`${SELECT_SQL} WHERE d.id = ?`).get(decisionId);
  return mapDecision(row);
}

// Archive-only soft delete — see the module-level comment above. The row
// stays in slt_decision_register forever; archived just hides it from the
// default (archived=false) list and both the Queue and Register tabs. This
// is independent of Status — archiving a decision never changes whether it
// would otherwise be ACTIVE or INACTIVE.
async function archiveDecision(userId, id) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id.");
  const existing = await db.prepare("SELECT id FROM slt_decision_register WHERE id = ?").get(decisionId);
  if (!existing) throw notFound("Decision not found.");
  await db.prepare("UPDATE slt_decision_register SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(decisionId);
  void audit.logAudit({ entityType: "decision", entityId: decisionId, action: "archive", userId });
  return getDecisionById(decisionId);
}

async function restoreDecision(userId, id) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id.");
  const existing = await db.prepare("SELECT id FROM slt_decision_register WHERE id = ?").get(decisionId);
  if (!existing) throw notFound("Decision not found.");
  await db.prepare("UPDATE slt_decision_register SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(decisionId);
  void audit.logAudit({ entityType: "decision", entityId: decisionId, action: "restore", userId });
  return getDecisionById(decisionId);
}

module.exports = {
  STATUS_OPTIONS,
  DECISION_TYPE_OPTIONS,
  CEO_CFO_ATTENTION_OPTIONS,
  FINANCIAL_IMPACT_OPTIONS,
  RISK_IMPACT_OPTIONS,
  FURTHER_ACTION_OPTIONS,
  listDecisions,
  getDecisionById,
  createDecision,
  updateDecision,
  archiveDecision,
  restoreDecision,
};
