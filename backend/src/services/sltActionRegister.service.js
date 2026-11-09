const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker — Action Register.
 *
 * Backs the "Action Register" radio-choice view inside the new SLT Tracker
 * board (SltActionTrackerBoard.jsx), using the slt_action_register table
 * (config/database/{sqlite,postgres}.js). Column set mirrors the data-entry
 * columns of the uploaded source workbook's "Action Register" sheet
 * (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx) — Item,
 * Category, Owner, Next Action, Due Date, Status, Priority, Risk Impact,
 * Strategic Objective, Escalation Required, Financial Impact, ASP Readiness
 * Stream, Blocker / Waiting On, Notes. The sheet's three *computed* columns
 * (SLT Item ID, Flag, Active Record) are never stored — mapActionItem()
 * below derives them every time instead, from id/priority/status/due_date,
 * so they can never drift out of sync with the row they describe.
 *
 * "Board Summary" and "Executive Dashboard" (the other two radio-choices
 * under the same SLT Tracker view) are NOT separate tables or endpoints —
 * they're both just different ways of slicing the same listActionItems()
 * rows, computed client-side in frontend/src/utils/sltActionAnalytics.js
 * (mirroring the source sheet's LET/FILTER/SORTBY and COUNTIFS formulas).
 *
 * Uses the archive-only soft-delete convention ("Action Register, Decisions,
 * 90-Day Commitments" — see the comment on slt_calendar's old DROP TABLE
 * migration in postgres.js) rather than slt_calendar's true delete: nothing
 * here is ever actually removed from the database, only flagged archived.
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

// Status/Priority/Risk Impact/Escalation Required all drive the Flag,
// Active Record, overdue, and board-filtering logic below (and in
// sltActionAnalytics.js) by exact string match, the same way the source
// workbook's formulas keyed off exact dropdown text — so, unlike
// Category/Owner/Strategic Objective/Financial Impact/ASP Readiness Stream
// (free text with suggestions on the form, never validated server-side,
// same as sltCalendar.service.js's category/executives), these four are
// validated against a fixed list here. Keep in sync with the dropdown
// option lists in frontend/src/constants/sltActionRegisterLists.js, which
// were extracted from the same workbook's "Lists & Controls" sheet.
const STATUS_OPTIONS = [
  "Not Started", "Assigned", "In Progress", "Waiting on Assignee", "Waiting on Information",
  "At Risk", "Stuck", "Deferred", "Completed", "Cancelled", "Visibility Only",
  "Gathering Info", "Waiting on Decision",
];
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const RISK_IMPACT_OPTIONS = ["High", "Medium", "Low"];
const ESCALATION_OPTIONS = ["Yes", "No"];

// Statuses that take an item off the active board — matches the source
// sheet's Active Record formula: =IF(OR(Status="Completed","Cancelled",
// "Deferred"),"INACTIVE","ACTIVE").
const INACTIVE_STATUSES = new Set(["Completed", "Cancelled", "Deferred"]);

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

// Display ID — a simpler, always-consistent stand-in for the source
// workbook's "SLT Item ID" column (which re-derived a 4-digit number out of
// a separately-stored "SLT Immutable Key" string via a TEXT/RIGHT formula).
// Since this table's own `id` is already a stable, never-reused identity,
// there's nothing to derive it FROM except itself — "SLT-0007" straight
// from the row's id, zero-padded to 4 digits (same width the sheet used).
function displayId(id) {
  return `SLT-${String(id).padStart(4, "0")}`;
}

function mapActionItem(row) {
  if (!row) return row;
  const today = todayIso();
  const active = !INACTIVE_STATUSES.has(row.status);
  const overdue = active && !!row.due_date && row.due_date < today;
  return {
    id: Number(row.id),
    display_id: displayId(row.id),
    item: row.item,
    category: row.category,
    owner: row.owner,
    next_action: row.next_action,
    due_date: row.due_date,
    status: row.status,
    priority: row.priority,
    flag: row.priority === "Critical" || row.priority === "High",
    risk_impact: row.risk_impact,
    strategic_objective: row.strategic_objective,
    escalation_required: row.escalation_required,
    financial_impact: row.financial_impact,
    asp_readiness_stream: row.asp_readiness_stream,
    blocker: row.blocker,
    notes: row.notes,
    active,
    overdue,
    days_until_due: daysBetween(today, row.due_date),
    archived: !!row.archived,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT a.*, u.name AS created_by_name
  FROM slt_action_register a
  LEFT JOIN users u ON u.id = a.created_by
`;

async function listActionItems(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `${SELECT_SQL}
       WHERE a.archived = ?
       ORDER BY (a.due_date IS NULL), a.due_date ASC, a.id ASC`
    )
    .all(archived);
  return (rows || []).map(mapActionItem);
}

async function getActionItemById(id) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id.");
  const row = await db.prepare(`${SELECT_SQL} WHERE a.id = ?`).get(itemId);
  if (!row) throw notFound("Action item not found.");
  return mapActionItem(row);
}

// `existing` is null on create (every field must come from `body`, with
// "Item" the only required one) and the current row on update (any field
// `body` leaves `undefined` keeps its current value — a PATCH, not a PUT).
function readFields(body, existing) {
  const val = (key) => (body[key] !== undefined ? body[key] : existing?.[key]);
  return {
    item: normalizeText(val("item"), { required: true, label: "Item", max: 500 }),
    category: normalizeText(val("category"), { label: "Category", max: 120 }),
    owner: normalizeText(val("owner"), { label: "Owner", max: 120 }),
    next_action: normalizeText(val("next_action"), { label: "Next Action" }),
    due_date: body.due_date !== undefined ? normalizeDate(body.due_date, { label: "Due Date" }) : existing?.due_date ?? null,
    status: normalizeFixedChoice(body.status !== undefined ? body.status : existing?.status, STATUS_OPTIONS, {
      label: "Status",
      fallback: "Not Started",
    }),
    priority: normalizeFixedChoice(body.priority !== undefined ? body.priority : existing?.priority, PRIORITY_OPTIONS, {
      label: "Priority",
      fallback: "Medium",
    }),
    risk_impact: normalizeFixedChoice(body.risk_impact !== undefined ? body.risk_impact : existing?.risk_impact, RISK_IMPACT_OPTIONS, {
      label: "Risk Impact",
      fallback: null,
    }),
    strategic_objective: normalizeText(
      body.strategic_objective !== undefined ? body.strategic_objective : existing?.strategic_objective,
      { label: "Strategic Objective", max: 120 }
    ),
    escalation_required: normalizeFixedChoice(
      body.escalation_required !== undefined ? body.escalation_required : existing?.escalation_required,
      ESCALATION_OPTIONS,
      { label: "Escalation Required", fallback: "No" }
    ),
    financial_impact: normalizeText(
      body.financial_impact !== undefined ? body.financial_impact : existing?.financial_impact,
      { label: "Financial Impact", max: 120 }
    ),
    asp_readiness_stream: normalizeText(
      body.asp_readiness_stream !== undefined ? body.asp_readiness_stream : existing?.asp_readiness_stream,
      { label: "ASP Readiness Stream", max: 120 }
    ),
    blocker: normalizeText(body.blocker !== undefined ? body.blocker : existing?.blocker, { label: "Blocker / Waiting On" }),
    notes: normalizeText(body.notes !== undefined ? body.notes : existing?.notes, { label: "Notes" }),
  };
}

async function createActionItem(userId, body) {
  const fields = readFields(body || {}, null);
  const immutableKey = crypto.randomBytes(8).toString("hex");

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_action_register (${cols.join(", ")}, immutable_key, created_by) VALUES (${placeholders}, ?, ?)`)
    .run(...cols.map((c) => fields[c]), immutableKey, userId);

  void audit.logAudit({ entityType: "action", entityId: result.lastInsertRowid, action: "create", userId });

  const row = await db.prepare(`${SELECT_SQL} WHERE a.id = ?`).get(result.lastInsertRowid);
  return mapActionItem(row);
}

async function updateActionItem(userId, id, body) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id.");
  const existing = await db.prepare("SELECT * FROM slt_action_register WHERE id = ?").get(itemId);
  if (!existing) throw notFound("Action item not found.");

  const fields = readFields(body || {}, existing);

  await db
    .prepare(
      `UPDATE slt_action_register SET
        item = ?, category = ?, owner = ?, next_action = ?, due_date = ?, status = ?, priority = ?,
        risk_impact = ?, strategic_objective = ?, escalation_required = ?, financial_impact = ?,
        asp_readiness_stream = ?, blocker = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      fields.item,
      fields.category,
      fields.owner,
      fields.next_action,
      fields.due_date,
      fields.status,
      fields.priority,
      fields.risk_impact,
      fields.strategic_objective,
      fields.escalation_required,
      fields.financial_impact,
      fields.asp_readiness_stream,
      fields.blocker,
      fields.notes,
      itemId
    );

  await audit.logFieldChanges({
    entityType: "action",
    entityId: itemId,
    before: existing,
    after: fields,
    fields: [
      "item", "category", "owner", "next_action", "due_date", "status", "priority",
      "risk_impact", "strategic_objective", "escalation_required", "financial_impact",
      "asp_readiness_stream", "blocker", "notes",
    ],
    userId,
  });

  const row = await db.prepare(`${SELECT_SQL} WHERE a.id = ?`).get(itemId);
  return mapActionItem(row);
}

// Archive-only soft delete — see the module-level comment above. The row
// stays in slt_action_register forever; archived just hides it from the
// default (archived=false) list and the live boards.
async function archiveActionItem(userId, id) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id.");
  const existing = await db.prepare("SELECT id FROM slt_action_register WHERE id = ?").get(itemId);
  if (!existing) throw notFound("Action item not found.");
  await db.prepare("UPDATE slt_action_register SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(itemId);
  void audit.logAudit({ entityType: "action", entityId: itemId, action: "archive", userId });
  return getActionItemById(itemId);
}

async function restoreActionItem(userId, id) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id.");
  const existing = await db.prepare("SELECT id FROM slt_action_register WHERE id = ?").get(itemId);
  if (!existing) throw notFound("Action item not found.");
  await db.prepare("UPDATE slt_action_register SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(itemId);
  void audit.logAudit({ entityType: "action", entityId: itemId, action: "restore", userId });
  return getActionItemById(itemId);
}

module.exports = {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  RISK_IMPACT_OPTIONS,
  ESCALATION_OPTIONS,
  listActionItems,
  getActionItemById,
  createActionItem,
  updateActionItem,
  archiveActionItem,
  restoreActionItem,
};
