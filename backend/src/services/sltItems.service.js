const { db } = require("../config/db");

/**
 * Native, in-portal SLT Report — replaces the two SharePoint Excel
 * workbooks (Action Tracker, Calendar) the SLT Tracker tab used to read
 * from. Three record types, each its own table: action items, calendar
 * events, decisions. getSltReport() assembles all three plus a per-person
 * "performance" roster into the same { headers, rows } shape the frontend
 * already renders (ActionItemCards / CalendarEventCards / DecisionCards /
 * SltPerformanceDashboard in CfoReportsPage.jsx) — only the headers are
 * matched by those components (e.g. "Owner", "Due Date"), so producing rows
 * with those exact header names means the display components didn't need
 * to change, only where the data comes from.
 *
 * This mirrors cfoIncidents.service.js's shape (normalize helpers, mapRow,
 * list/create/update/delete) and cfoReports.service.js's buildSltPerformance
 * logic (now reading live DB rows instead of parsed Excel records).
 */

const ACTION_STATUSES = ["NOT STARTED", "ASSIGNED", "IN PROGRESS", "COMPLETED"];
const DECISION_STATUSES = ["Not Started", "In Progress", "Pending", "Deferred", "Completed"];
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

// Dates are kept as plain yyyy-mm-dd strings (or whatever the client sent)
// rather than parsed/reformatted — same approach as cfoIncidents.service.js's
// normalizeDate, minus the "required" case since most SLT dates are optional.
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

function normalizeActionStatus(raw) {
  const s = String(raw || "NOT STARTED").trim().toUpperCase();
  if (!ACTION_STATUSES.includes(s)) {
    throw badRequest(`Invalid status. Choose one of: ${ACTION_STATUSES.join(", ")}.`);
  }
  return s;
}

function normalizeDecisionStatus(raw) {
  const s = String(raw || "Not Started").trim();
  const match = DECISION_STATUSES.find((opt) => opt.toLowerCase() === s.toLowerCase());
  if (!match) {
    throw badRequest(`Invalid status. Choose one of: ${DECISION_STATUSES.join(", ")}.`);
  }
  return match;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Action items ───────────────────────────────────────────────────────

function mapActionItem(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    item: row.item,
    owner: row.owner,
    due_date: row.due_date || null,
    status: row.status,
    priority: row.priority || null,
    category: row.category || null,
    next_action: row.next_action || null,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listActionItems() {
  const rows = await db
    .prepare("SELECT * FROM slt_action_items ORDER BY datetime(due_date) ASC, id DESC")
    .all();
  return (rows || []).map(mapActionItem);
}

async function createActionItem(userId, body) {
  const item = normalizeText(body?.item, { required: true, label: "Item" });
  const owner = normalizeText(body?.owner, { required: true, label: "Owner" });
  const dueDate = normalizeDate(body?.due_date, { label: "Due date" });
  const status = normalizeActionStatus(body?.status);
  const priority = normalizeText(body?.priority, { label: "Priority" });
  const category = normalizeText(body?.category, { label: "Category" });
  const nextAction = normalizeText(body?.next_action, { label: "Next action" });
  const notes = normalizeText(body?.notes, { label: "Notes" });

  const result = await db
    .prepare(
      `INSERT INTO slt_action_items
        (item, owner, due_date, status, priority, category, next_action, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(item, owner, dueDate, status, priority, category, nextAction, notes, userId);

  const row = await db.prepare("SELECT * FROM slt_action_items WHERE id = ?").get(result.lastInsertRowid);
  return mapActionItem(row);
}

async function updateActionItem(id, body) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id");
  const existing = await db.prepare("SELECT * FROM slt_action_items WHERE id = ?").get(itemId);
  if (!existing) throw notFound("Action item not found");

  const item = body?.item !== undefined ? normalizeText(body.item, { required: true, label: "Item" }) : existing.item;
  const owner = body?.owner !== undefined ? normalizeText(body.owner, { required: true, label: "Owner" }) : existing.owner;
  const dueDate = body?.due_date !== undefined ? normalizeDate(body.due_date, { label: "Due date" }) : existing.due_date;
  const status = body?.status !== undefined ? normalizeActionStatus(body.status) : existing.status;
  const priority = body?.priority !== undefined ? normalizeText(body.priority, { label: "Priority" }) : existing.priority;
  const category = body?.category !== undefined ? normalizeText(body.category, { label: "Category" }) : existing.category;
  const nextAction =
    body?.next_action !== undefined ? normalizeText(body.next_action, { label: "Next action" }) : existing.next_action;
  const notes = body?.notes !== undefined ? normalizeText(body.notes, { label: "Notes" }) : existing.notes;

  await db
    .prepare(
      `UPDATE slt_action_items SET
        item = ?, owner = ?, due_date = ?, status = ?, priority = ?, category = ?,
        next_action = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(item, owner, dueDate, status, priority, category, nextAction, notes, itemId);

  const row = await db.prepare("SELECT * FROM slt_action_items WHERE id = ?").get(itemId);
  return mapActionItem(row);
}

async function deleteActionItem(id) {
  const itemId = Number(id);
  if (!Number.isFinite(itemId) || itemId < 1) throw badRequest("Invalid action item id");
  const existing = await db.prepare("SELECT id FROM slt_action_items WHERE id = ?").get(itemId);
  if (!existing) throw notFound("Action item not found");
  await db.prepare("DELETE FROM slt_action_items WHERE id = ?").run(itemId);
  return { deleted: itemId };
}

// ─── Calendar events ────────────────────────────────────────────────────

function mapCalendarEvent(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    title: row.title,
    event_date: row.event_date,
    owner: row.owner,
    category: row.category || null,
    prep_deadline: row.prep_deadline || null,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listCalendarEvents() {
  const rows = await db.prepare("SELECT * FROM slt_calendar_events ORDER BY datetime(event_date) ASC, id DESC").all();
  return (rows || []).map(mapCalendarEvent);
}

async function createCalendarEvent(userId, body) {
  const title = normalizeText(body?.title, { required: true, label: "Event / Deadline" });
  const eventDate = normalizeDate(body?.event_date, { required: true, label: "Event date" });
  const owner = normalizeText(body?.owner, { required: true, label: "Owner / Lead" });
  const category = normalizeText(body?.category, { label: "Category" });
  const prepDeadline = normalizeDate(body?.prep_deadline, { label: "Prep deadline" });
  const notes = normalizeText(body?.notes, { label: "Notes" });

  const result = await db
    .prepare(
      `INSERT INTO slt_calendar_events
        (title, event_date, owner, category, prep_deadline, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(title, eventDate, owner, category, prepDeadline, notes, userId);

  const row = await db.prepare("SELECT * FROM slt_calendar_events WHERE id = ?").get(result.lastInsertRowid);
  return mapCalendarEvent(row);
}

async function updateCalendarEvent(id, body) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || eventId < 1) throw badRequest("Invalid calendar event id");
  const existing = await db.prepare("SELECT * FROM slt_calendar_events WHERE id = ?").get(eventId);
  if (!existing) throw notFound("Calendar event not found");

  const title =
    body?.title !== undefined ? normalizeText(body.title, { required: true, label: "Event / Deadline" }) : existing.title;
  const eventDate =
    body?.event_date !== undefined
      ? normalizeDate(body.event_date, { required: true, label: "Event date" })
      : existing.event_date;
  const owner =
    body?.owner !== undefined ? normalizeText(body.owner, { required: true, label: "Owner / Lead" }) : existing.owner;
  const category = body?.category !== undefined ? normalizeText(body.category, { label: "Category" }) : existing.category;
  const prepDeadline =
    body?.prep_deadline !== undefined ? normalizeDate(body.prep_deadline, { label: "Prep deadline" }) : existing.prep_deadline;
  const notes = body?.notes !== undefined ? normalizeText(body.notes, { label: "Notes" }) : existing.notes;

  await db
    .prepare(
      `UPDATE slt_calendar_events SET
        title = ?, event_date = ?, owner = ?, category = ?, prep_deadline = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(title, eventDate, owner, category, prepDeadline, notes, eventId);

  const row = await db.prepare("SELECT * FROM slt_calendar_events WHERE id = ?").get(eventId);
  return mapCalendarEvent(row);
}

async function deleteCalendarEvent(id) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || eventId < 1) throw badRequest("Invalid calendar event id");
  const existing = await db.prepare("SELECT id FROM slt_calendar_events WHERE id = ?").get(eventId);
  if (!existing) throw notFound("Calendar event not found");
  await db.prepare("DELETE FROM slt_calendar_events WHERE id = ?").run(eventId);
  return { deleted: eventId };
}

// ─── Decisions ──────────────────────────────────────────────────────────

function mapDecision(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    decision: row.decision,
    assigned_to: row.assigned_to,
    deadline: row.deadline || null,
    status: row.status,
    workstream: row.workstream || null,
    decision_type: row.decision_type || null,
    recommendation: row.recommendation || null,
    source: row.source || null,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listDecisions() {
  const rows = await db.prepare("SELECT * FROM slt_decisions ORDER BY datetime(deadline) ASC, id DESC").all();
  return (rows || []).map(mapDecision);
}

async function createDecision(userId, body) {
  const decision = normalizeText(body?.decision, { required: true, label: "Decision required" });
  const assignedTo = normalizeText(body?.assigned_to, { required: true, label: "Assigned to" });
  const deadline = normalizeDate(body?.deadline, { label: "Decision deadline" });
  const status = normalizeDecisionStatus(body?.status);
  const workstream = normalizeText(body?.workstream, { label: "Workstream" });
  const decisionType = normalizeText(body?.decision_type, { label: "Decision type" });
  const recommendation = normalizeText(body?.recommendation, { label: "Recommendation" });
  const source = normalizeText(body?.source, { label: "Source" });
  const notes = normalizeText(body?.notes, { label: "Notes" });

  const result = await db
    .prepare(
      `INSERT INTO slt_decisions
        (decision, assigned_to, deadline, status, workstream, decision_type, recommendation, source, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(decision, assignedTo, deadline, status, workstream, decisionType, recommendation, source, notes, userId);

  const row = await db.prepare("SELECT * FROM slt_decisions WHERE id = ?").get(result.lastInsertRowid);
  return mapDecision(row);
}

async function updateDecision(id, body) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id");
  const existing = await db.prepare("SELECT * FROM slt_decisions WHERE id = ?").get(decisionId);
  if (!existing) throw notFound("Decision not found");

  const decision =
    body?.decision !== undefined
      ? normalizeText(body.decision, { required: true, label: "Decision required" })
      : existing.decision;
  const assignedTo =
    body?.assigned_to !== undefined
      ? normalizeText(body.assigned_to, { required: true, label: "Assigned to" })
      : existing.assigned_to;
  const deadline = body?.deadline !== undefined ? normalizeDate(body.deadline, { label: "Decision deadline" }) : existing.deadline;
  const status = body?.status !== undefined ? normalizeDecisionStatus(body.status) : existing.status;
  const workstream = body?.workstream !== undefined ? normalizeText(body.workstream, { label: "Workstream" }) : existing.workstream;
  const decisionType =
    body?.decision_type !== undefined ? normalizeText(body.decision_type, { label: "Decision type" }) : existing.decision_type;
  const recommendation =
    body?.recommendation !== undefined
      ? normalizeText(body.recommendation, { label: "Recommendation" })
      : existing.recommendation;
  const source = body?.source !== undefined ? normalizeText(body.source, { label: "Source" }) : existing.source;
  const notes = body?.notes !== undefined ? normalizeText(body.notes, { label: "Notes" }) : existing.notes;

  await db
    .prepare(
      `UPDATE slt_decisions SET
        decision = ?, assigned_to = ?, deadline = ?, status = ?, workstream = ?,
        decision_type = ?, recommendation = ?, source = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(decision, assignedTo, deadline, status, workstream, decisionType, recommendation, source, notes, decisionId);

  const row = await db.prepare("SELECT * FROM slt_decisions WHERE id = ?").get(decisionId);
  return mapDecision(row);
}

async function deleteDecision(id) {
  const decisionId = Number(id);
  if (!Number.isFinite(decisionId) || decisionId < 1) throw badRequest("Invalid decision id");
  const existing = await db.prepare("SELECT id FROM slt_decisions WHERE id = ?").get(decisionId);
  if (!existing) throw notFound("Decision not found");
  await db.prepare("DELETE FROM slt_decisions WHERE id = ?").run(decisionId);
  return { deleted: decisionId };
}

// ─── Per-person performance roster ──────────────────────────────────────
// Ported from cfoReports.service.js's buildSltPerformance(), which read the
// same stats from parsed Excel records — the matching rules are unchanged,
// only the field names (native columns instead of Excel header lookups).
//
// The Action Items' Owner column is a clean single name per row, so that's
// the roster. Calendar Events' Owner / Lead field is messier (sometimes
// several names, sometimes a name plus a title/team), so each roster name
// is checked against it as a whole word rather than parsed. A calendar
// owner that never matches anyone on the roster is reported separately
// rather than silently dropped. Decisions' Assigned To is a clean single
// name again, so that matches by exact name like Action Items' Owner does.
function buildSltPerformance(actionItems, calendarEvents, decisions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const roster = [];
  const rosterSet = new Set();
  for (const a of actionItems) {
    const owner = String(a.owner || "").trim();
    if (owner && !rosterSet.has(owner)) {
      rosterSet.add(owner);
      roster.push(owner);
    }
  }

  const statsByName = new Map(
    roster.map((name) => [
      name,
      {
        name,
        actionsTotal: 0,
        actionsCompleted: 0,
        actionsOpen: 0,
        actionsOverdue: 0,
        eventsOwned: 0,
        eventsUpcoming: 0,
        eventsPrepAtRisk: 0,
        decisionsTotal: 0,
        decisionsCompleted: 0,
        decisionsOpen: 0,
        decisionsOverdue: 0,
      },
    ])
  );

  for (const a of actionItems) {
    const owner = String(a.owner || "").trim();
    const s = statsByName.get(owner);
    if (!s) continue;
    const status = String(a.status || "").trim().toUpperCase();
    const dueDate = toDate(a.due_date);
    s.actionsTotal += 1;
    if (status === "COMPLETED") {
      s.actionsCompleted += 1;
    } else {
      s.actionsOpen += 1;
      if (dueDate && dueDate < today) s.actionsOverdue += 1;
    }
  }

  const rosterRegexes = roster.map((name) => ({ name, re: new RegExp(`\\b${escapeRegExp(name)}\\b`, "i") }));
  const unmatchedCalendarOwners = new Set();

  for (const c of calendarEvents) {
    const raw = String(c.owner || "").trim();
    if (!raw) continue;
    const eventDate = toDate(c.event_date);
    const prepDeadline = toDate(c.prep_deadline);
    const isUpcoming = eventDate ? eventDate >= today : false;
    const isPrepAtRisk = Boolean(prepDeadline && prepDeadline < today && isUpcoming);

    let matchedAny = false;
    for (const { name, re } of rosterRegexes) {
      if (re.test(raw)) {
        matchedAny = true;
        const s = statsByName.get(name);
        s.eventsOwned += 1;
        if (isUpcoming) s.eventsUpcoming += 1;
        if (isPrepAtRisk) s.eventsPrepAtRisk += 1;
      }
    }
    if (!matchedAny) unmatchedCalendarOwners.add(raw);
  }

  const unmatchedDecisionAssignees = new Set();
  for (const d of decisions) {
    const assignee = String(d.assigned_to || "").trim();
    if (!assignee) continue;
    const s = statsByName.get(assignee);
    if (!s) {
      unmatchedDecisionAssignees.add(assignee);
      continue;
    }
    const status = String(d.status || "").trim().toUpperCase();
    const dueDate = toDate(d.deadline);
    s.decisionsTotal += 1;
    if (status === "COMPLETED") {
      s.decisionsCompleted += 1;
    } else {
      s.decisionsOpen += 1;
      if (dueDate && dueDate < today) s.decisionsOverdue += 1;
    }
  }

  return {
    roster: roster.map((name) => statsByName.get(name)),
    unmatchedCalendarOwners: [...unmatchedCalendarOwners],
    unmatchedDecisionAssignees: [...unmatchedDecisionAssignees],
  };
}

// ─── Combined report ────────────────────────────────────────────────────
// Row shape the frontend already knows how to render as cards/tables —
// matches the {headers, rows} shape the old SharePoint-Excel SLT report
// produced. "ids" is new (the old Excel-backed version had nothing to edit
// or delete) — a parallel array of row ids so the frontend can wire up
// edit/delete on each card.

const ACTION_COLUMNS = [
  ["item", "Item"],
  ["owner", "Owner"],
  ["due_date", "Due Date"],
  ["status", "Status"],
  ["priority", "Priority"],
  ["category", "Category"],
  ["next_action", "Next Action"],
  ["notes", "Notes"],
];
const CALENDAR_COLUMNS = [
  ["title", "Event / Deadline"],
  ["event_date", "Event Date"],
  ["owner", "Owner / Lead"],
  ["category", "Category"],
  ["prep_deadline", "Prep Deadline"],
  ["notes", "Notes"],
];
const DECISION_COLUMNS = [
  ["decision", "Decision Required"],
  ["assigned_to", "Assigned To"],
  ["deadline", "Decision Deadline"],
  ["status", "Status"],
  ["workstream", "Workstream"],
  ["decision_type", "Decision Type"],
  ["recommendation", "Recommendation"],
  ["source", "Source"],
  ["notes", "Notes"],
];

function toSheet(items, columns) {
  const headers = columns.map(([, label]) => label);
  const rows = items.map((it) => columns.map(([key]) => it[key] ?? ""));
  const ids = items.map((it) => it.id);
  return { headers, rows, ids };
}

async function getSltReport() {
  const [actionItems, calendarEvents, decisions] = await Promise.all([
    listActionItems(),
    listCalendarEvents(),
    listDecisions(),
  ]);

  const performance = buildSltPerformance(actionItems, calendarEvents, decisions);

  return {
    key: "slt",
    label: "SLT Tracker",
    performance,
    actionItems: toSheet(actionItems, ACTION_COLUMNS),
    calendarEvents: toSheet(calendarEvents, CALENDAR_COLUMNS),
    decisionItems: toSheet(decisions, DECISION_COLUMNS),
    fetchedAt: Date.now(),
  };
}

module.exports = {
  ACTION_STATUSES,
  DECISION_STATUSES,
  listActionItems,
  createActionItem,
  updateActionItem,
  deleteActionItem,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listDecisions,
  createDecision,
  updateDecision,
  deleteDecision,
  getSltReport,
};
