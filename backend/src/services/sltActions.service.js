const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker — Action Register (the "Action Tracker Executive Board").
 *
 * Backs the Action Register sub-tab of the Action Tracker Executive Board in
 * SltTrackerV2.jsx, using the slt_actions table (already created in
 * config/database/{sqlite,postgres}.js and populated by
 * scripts/importSltWorkbooks.js's importActionRegister()). Field set and
 * column order mirror the source workbook's "Action Register" sheet:
 * SLT Item ID, Item, Category, Owner, Next Action, Due Date, Status,
 * Priority, Flag, Risk/Impact, Strategic Objective, Escalation Required,
 * Financial Impact, ASP Readiness Stream, Blocker/Waiting On, Notes, Date
 * Added, Last Updated, plus the two computed columns (Flag, Active Record —
 * see computeFlag()/computeActiveRecord() below, which mirror the sheet's
 * own formulas).
 *
 * Status/Priority/Category/etc. are kept as free text (no CHECK
 * constraint) with <datalist> suggestions on the frontend — same house
 * pattern as sltCalendar.service.js / ItTicketsMonitorTable — so manual
 * entries aren't forced into a vocabulary the source sheet didn't use.
 */

const MAX_TEXT = 4000;
const CLOSED_STATUSES = ["completed", "cancelled", "canceled", "deferred"];
const HIGH_PRIORITIES = ["critical", "high"];

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

// Mirrors the Action Register sheet's "Flag" formula: a visual flag (⚑) on
// Critical/High priority items, blank otherwise.
function computeFlag(priority) {
  const p = String(priority || "").trim().toLowerCase();
  return HIGH_PRIORITIES.includes(p) ? "⚑" : "";
}

// Mirrors the sheet's "Active Record" formula: INACTIVE once a status marks
// the item as no longer being worked, ACTIVE otherwise.
function computeActiveRecord(status) {
  const s = String(status || "").trim().toLowerCase();
  return CLOSED_STATUSES.includes(s) ? "INACTIVE" : "ACTIVE";
}

const EDITABLE_FIELDS = [
  "item",
  "category",
  "owner",
  "next_action",
  "due_date",
  "status",
  "priority",
  "risk_impact",
  "strategic_objective",
  "escalation_required",
  "financial_impact",
  "asp_readiness_stream",
  "blocker_waiting_on",
  "notes",
  "date_added",
  "attachments",
];

function mapAction(row) {
  if (!row) return row;
  const today = todayIso();
  const activeRecord = computeActiveRecord(row.status);
  return {
    id: Number(row.id),
    legacy_item_id: row.legacy_item_id,
    item: row.item,
    category: row.category,
    owner: row.owner,
    next_action: row.next_action,
    due_date: row.due_date,
    status: row.status,
    priority: row.priority,
    flag: computeFlag(row.priority),
    risk_impact: row.risk_impact,
    strategic_objective: row.strategic_objective,
    escalation_required: row.escalation_required,
    financial_impact: row.financial_impact,
    asp_readiness_stream: row.asp_readiness_stream,
    blocker_waiting_on: row.blocker_waiting_on,
    notes: row.notes,
    date_added: row.date_added,
    last_updated: row.last_updated,
    immutable_key: row.immutable_key,
    active_record: activeRecord,
    days_until_due: daysBetween(today, row.due_date),
    is_overdue: !!(row.due_date && row.due_date < today && activeRecord === "ACTIVE"),
    archived: !!row.archived,
    attachments: row.attachments,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listActions(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `SELECT * FROM slt_actions
       WHERE archived = ?
       ORDER BY (due_date IS NULL), due_date ASC, id ASC`
    )
    .all(archived);
  return (rows || []).map(mapAction);
}

async function getActionById(id) {
  const actionId = Number(id);
  if (!Number.isFinite(actionId) || actionId < 1) throw badRequest("Invalid action id.");
  const row = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(actionId);
  if (!row) throw notFound("Action item not found.");
  return mapAction(row);
}

async function getActionStatusHistory(id) {
  const actionId = Number(id);
  if (!Number.isFinite(actionId) || actionId < 1) throw badRequest("Invalid action id.");
  const rows = await db
    .prepare(
      `SELECT h.*, u.name AS changed_by_name
       FROM slt_action_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.action_id = ?
       ORDER BY h.changed_at DESC, h.id DESC`
    )
    .all(actionId);
  return rows || [];
}

async function createAction(userId, body) {
  const item = normalizeText(body?.item, { required: true, label: "Item" });
  const category = normalizeText(body?.category, { label: "Category", max: 120 });
  const owner = normalizeText(body?.owner, { required: true, label: "Owner" });
  const nextAction = normalizeText(body?.next_action, { label: "Next action" });
  const dueDate = normalizeDate(body?.due_date, { label: "Due date" });
  const status = normalizeText(body?.status, { label: "Status", max: 60 }) || "Assigned";
  const priority = normalizeText(body?.priority, { label: "Priority", max: 60 });
  const riskImpact = normalizeText(body?.risk_impact, { label: "Risk/Impact" });
  const strategicObjective = normalizeText(body?.strategic_objective, { label: "Strategic objective", max: 200 });
  const escalationRequired = normalizeText(body?.escalation_required, { label: "Escalation required", max: 60 });
  const financialImpact = normalizeText(body?.financial_impact, { label: "Financial impact" });
  const aspReadinessStream = normalizeText(body?.asp_readiness_stream, { label: "ASP readiness stream", max: 200 });
  const blockerWaitingOn = normalizeText(body?.blocker_waiting_on, { label: "Blocker / waiting on" });
  const notes = normalizeText(body?.notes, { label: "Notes" });
  const dateAdded = normalizeDate(body?.date_added, { label: "Date added" }) || todayIso();
  const attachments = normalizeText(body?.attachments, { label: "Attachments" });

  const immutableKey = crypto.randomBytes(8).toString("hex");
  const legacyItemId = `ACT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  const fields = {
    legacy_item_id: legacyItemId,
    item,
    category,
    owner,
    next_action: nextAction,
    due_date: dueDate,
    status,
    priority,
    flag: computeFlag(priority),
    risk_impact: riskImpact,
    strategic_objective: strategicObjective,
    escalation_required: escalationRequired,
    financial_impact: financialImpact,
    asp_readiness_stream: aspReadinessStream,
    blocker_waiting_on: blockerWaitingOn,
    notes,
    date_added: dateAdded,
    last_updated: todayIso(),
    immutable_key: immutableKey,
    active_record: computeActiveRecord(status),
    attachments,
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_actions (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  const row = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(result.lastInsertRowid);

  await audit.logAudit({ entityType: "action", entityId: row.id, action: "create", userId });
  await db
    .prepare(
      `INSERT INTO slt_action_status_history (action_id, old_status, new_status, old_due_date, new_due_date, changed_by)
       VALUES (?, NULL, ?, NULL, ?, ?)`
    )
    .run(row.id, status, dueDate, userId);

  return mapAction(row);
}

async function updateAction(userId, id, body) {
  const actionId = Number(id);
  if (!Number.isFinite(actionId) || actionId < 1) throw badRequest("Invalid action id.");
  const existing = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(actionId);
  if (!existing) throw notFound("Action item not found.");

  const next = { ...existing };
  if (body?.item !== undefined) next.item = normalizeText(body.item, { required: true, label: "Item" });
  if (body?.category !== undefined) next.category = normalizeText(body.category, { label: "Category", max: 120 });
  if (body?.owner !== undefined) next.owner = normalizeText(body.owner, { required: true, label: "Owner" });
  if (body?.next_action !== undefined) next.next_action = normalizeText(body.next_action, { label: "Next action" });
  if (body?.due_date !== undefined) next.due_date = normalizeDate(body.due_date, { label: "Due date" });
  if (body?.status !== undefined) next.status = normalizeText(body.status, { label: "Status", max: 60 }) || "Assigned";
  if (body?.priority !== undefined) next.priority = normalizeText(body.priority, { label: "Priority", max: 60 });
  if (body?.risk_impact !== undefined) next.risk_impact = normalizeText(body.risk_impact, { label: "Risk/Impact" });
  if (body?.strategic_objective !== undefined)
    next.strategic_objective = normalizeText(body.strategic_objective, { label: "Strategic objective", max: 200 });
  if (body?.escalation_required !== undefined)
    next.escalation_required = normalizeText(body.escalation_required, { label: "Escalation required", max: 60 });
  if (body?.financial_impact !== undefined) next.financial_impact = normalizeText(body.financial_impact, { label: "Financial impact" });
  if (body?.asp_readiness_stream !== undefined)
    next.asp_readiness_stream = normalizeText(body.asp_readiness_stream, { label: "ASP readiness stream", max: 200 });
  if (body?.blocker_waiting_on !== undefined)
    next.blocker_waiting_on = normalizeText(body.blocker_waiting_on, { label: "Blocker / waiting on" });
  if (body?.notes !== undefined) next.notes = normalizeText(body.notes, { label: "Notes" });
  if (body?.date_added !== undefined) next.date_added = normalizeDate(body.date_added, { label: "Date added" });
  if (body?.attachments !== undefined) next.attachments = normalizeText(body.attachments, { label: "Attachments" });

  next.flag = computeFlag(next.priority);
  next.active_record = computeActiveRecord(next.status);
  next.last_updated = todayIso();

  await db
    .prepare(
      `UPDATE slt_actions SET
        item = ?, category = ?, owner = ?, next_action = ?, due_date = ?, status = ?, priority = ?, flag = ?,
        risk_impact = ?, strategic_objective = ?, escalation_required = ?, financial_impact = ?,
        asp_readiness_stream = ?, blocker_waiting_on = ?, notes = ?, date_added = ?, last_updated = ?,
        active_record = ?, attachments = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      next.item,
      next.category,
      next.owner,
      next.next_action,
      next.due_date,
      next.status,
      next.priority,
      next.flag,
      next.risk_impact,
      next.strategic_objective,
      next.escalation_required,
      next.financial_impact,
      next.asp_readiness_stream,
      next.blocker_waiting_on,
      next.notes,
      next.date_added,
      next.last_updated,
      next.active_record,
      next.attachments,
      actionId
    );

  if (existing.status !== next.status || existing.due_date !== next.due_date) {
    await db
      .prepare(
        `INSERT INTO slt_action_status_history (action_id, old_status, new_status, old_due_date, new_due_date, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(actionId, existing.status, next.status, existing.due_date, next.due_date, userId);
  }
  await audit.logFieldChanges({ entityType: "action", entityId: actionId, before: existing, after: next, fields: EDITABLE_FIELDS, userId });

  const row = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(actionId);
  return mapAction(row);
}

async function setActionArchived(userId, id, archived) {
  const actionId = Number(id);
  if (!Number.isFinite(actionId) || actionId < 1) throw badRequest("Invalid action id.");
  const existing = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(actionId);
  if (!existing) throw notFound("Action item not found.");
  await db.prepare("UPDATE slt_actions SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, actionId);
  await audit.logAudit({
    entityType: "action",
    entityId: actionId,
    action: archived ? "archive" : "restore",
    userId,
  });
  const row = await db.prepare("SELECT * FROM slt_actions WHERE id = ?").get(actionId);
  return mapAction(row);
}

module.exports = {
  listActions,
  getActionById,
  getActionStatusHistory,
  createAction,
  updateAction,
  setActionArchived,
  computeFlag,
  computeActiveRecord,
};
