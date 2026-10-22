const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");

/**
 * SLT Tracker — Decisions (Decision Queue + Decision Register).
 *
 * Backs the Decisions sub-tab of the Action Tracker Executive Board.
 * Decision Queue (slt_decision_queue) holds decisions still awaiting a
 * call; Decision Register (slt_decision_register) holds the permanent log
 * of decisions once made. Column sets mirror the two source sheets exactly
 * (see scripts/importSltWorkbooks.js's importDecisionQueue()/
 * importDecisionRegister() and the project doc
 * "SLT Tracker - Workbook Inventory and Reconciliation.md").
 *
 * Two documented data-quality issues from the source workbook are
 * surfaced, never silently fixed:
 *  - Decision Register row 10 ("ASP Strategy Items") has a broken Active
 *    Record formula (#REF! — a deleted column reference in the source
 *    sheet). mapRegister() passes through whatever was imported into
 *    active_record verbatim and flags it via data_issue when it starts
 *    with "#", instead of recomputing a value that was never reliable.
 *  - Decision Register rows 5-6 have a known off-by-one misalignment
 *    between their "ask" (decision_required) and "log" (decision_summary /
 *    source_decision_id) columns, inherited from a bad backup-sheet merge.
 *    This service never re-links by title match — Decision Register only
 *    links to Decision Queue via an explicit parent_decision_id (set either
 *    by the importer matching immutable keys, or by recordDecision() below)
 *    — so link_status surfaces 'unresolved' / 'historical_no_parent' for
 *    manual review rather than guessing a parent.
 *
 * Status/decision-type/etc. are free text with <datalist> suggestions on
 * the frontend, same house pattern as the rest of SLT Tracker v2.
 */

const MAX_TEXT = 4000;
const CLOSED_STATUSES = ["decided", "closed", "completed", "cancelled", "canceled"];

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

// Mirrors the source sheets' "Active Record" formula: INACTIVE once a
// status marks the decision as made/closed, ACTIVE while still pending.
// NOT used to overwrite a value that was imported verbatim from a broken
// formula (see mapRegister()) — only for freshly computed rows.
function computeActiveRecord(status) {
  const s = String(status || "").trim().toLowerCase();
  return CLOSED_STATUSES.includes(s) ? "INACTIVE" : "ACTIVE";
}

// ── Decision Queue ──────────────────────────────────────────────────────

const QUEUE_EDITABLE_FIELDS = [
  "decision_required",
  "workstream",
  "assigned_to",
  "decision_deadline",
  "recommendation",
  "status",
  "decision_type",
  "ceo_cfo_attention",
  "financial_impact",
  "risk_impact",
  "strategic_objective",
  "decision_date",
  "further_action_required",
  "context_input_required",
  "owned_by",
  "requested_by",
  "date_raised",
  "delay_impact_risk",
  "blocker_waiting_on",
  "notes",
];

function mapQueue(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    legacy_decision_id: row.legacy_decision_id,
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
    blocker_waiting_on: row.blocker_waiting_on,
    notes: row.notes,
    queue_immutable_key: row.queue_immutable_key,
    active_record: row.active_record,
    data_issue: typeof row.active_record === "string" && row.active_record.startsWith("#") ? row.active_record : null,
    archived: !!row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listDecisionQueue(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `SELECT * FROM slt_decision_queue
       WHERE archived = ?
       ORDER BY (decision_deadline IS NULL), decision_deadline ASC, id ASC`
    )
    .all(archived);
  return (rows || []).map(mapQueue);
}

async function getDecisionQueueById(id) {
  const qid = Number(id);
  if (!Number.isFinite(qid) || qid < 1) throw badRequest("Invalid decision queue id.");
  const row = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  if (!row) throw notFound("Decision queue item not found.");
  return mapQueue(row);
}

async function createDecisionQueueItem(userId, body) {
  const decisionRequired = normalizeText(body?.decision_required, { required: true, label: "Decision required" });
  const workstream = normalizeText(body?.workstream, { label: "Workstream", max: 200 });
  const assignedTo = normalizeText(body?.assigned_to, { label: "Assigned to", max: 200 });
  const decisionDeadline = normalizeDate(body?.decision_deadline, { label: "Decision deadline" });
  const recommendation = normalizeText(body?.recommendation, { label: "Recommendation" });
  const status = normalizeText(body?.status, { label: "Status", max: 60 }) || "Open";
  const decisionType = normalizeText(body?.decision_type, { label: "Decision type", max: 120 });
  const ceoCfoAttention = normalizeText(body?.ceo_cfo_attention, { label: "CEO/CFO attention", max: 60 });
  const financialImpact = normalizeText(body?.financial_impact, { label: "Financial impact" });
  const riskImpact = normalizeText(body?.risk_impact, { label: "Risk/Impact" });
  const strategicObjective = normalizeText(body?.strategic_objective, { label: "Strategic objective", max: 200 });
  const decisionDate = normalizeDate(body?.decision_date, { label: "Decision date" });
  const furtherActionRequired = normalizeText(body?.further_action_required, { label: "Further action required" });
  const contextInputRequired = normalizeText(body?.context_input_required, { label: "Context / input required" });
  const ownedBy = normalizeText(body?.owned_by, { label: "Owned by", max: 200 });
  const requestedBy = normalizeText(body?.requested_by, { label: "Requested by", max: 200 });
  const dateRaised = normalizeDate(body?.date_raised, { label: "Date raised" }) || todayIso();
  const delayImpactRisk = normalizeText(body?.delay_impact_risk, { label: "Delay impact / risk" });
  const blockerWaitingOn = normalizeText(body?.blocker_waiting_on, { label: "Blocker / waiting on" });
  const notes = normalizeText(body?.notes, { label: "Notes" });

  const legacyDecisionId = `DEC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const queueImmutableKey = crypto.randomBytes(8).toString("hex");

  const fields = {
    legacy_decision_id: legacyDecisionId,
    decision_required: decisionRequired,
    workstream,
    assigned_to: assignedTo,
    decision_deadline: decisionDeadline,
    recommendation,
    status,
    decision_type: decisionType,
    ceo_cfo_attention: ceoCfoAttention,
    financial_impact: financialImpact,
    risk_impact: riskImpact,
    strategic_objective: strategicObjective,
    decision_date: decisionDate,
    further_action_required: furtherActionRequired,
    context_input_required: contextInputRequired,
    owned_by: ownedBy,
    requested_by: requestedBy,
    date_raised: dateRaised,
    delay_impact_risk: delayImpactRisk,
    blocker_waiting_on: blockerWaitingOn,
    notes,
    queue_immutable_key: queueImmutableKey,
    active_record: computeActiveRecord(status),
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_decision_queue (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  const row = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(result.lastInsertRowid);
  await audit.logAudit({ entityType: "decision_queue", entityId: row.id, action: "create", userId });
  return mapQueue(row);
}

async function updateDecisionQueueItem(userId, id, body) {
  const qid = Number(id);
  if (!Number.isFinite(qid) || qid < 1) throw badRequest("Invalid decision queue id.");
  const existing = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  if (!existing) throw notFound("Decision queue item not found.");

  const next = { ...existing };
  if (body?.decision_required !== undefined)
    next.decision_required = normalizeText(body.decision_required, { required: true, label: "Decision required" });
  if (body?.workstream !== undefined) next.workstream = normalizeText(body.workstream, { label: "Workstream", max: 200 });
  if (body?.assigned_to !== undefined) next.assigned_to = normalizeText(body.assigned_to, { label: "Assigned to", max: 200 });
  if (body?.decision_deadline !== undefined) next.decision_deadline = normalizeDate(body.decision_deadline, { label: "Decision deadline" });
  if (body?.recommendation !== undefined) next.recommendation = normalizeText(body.recommendation, { label: "Recommendation" });
  if (body?.status !== undefined) next.status = normalizeText(body.status, { label: "Status", max: 60 }) || "Open";
  if (body?.decision_type !== undefined) next.decision_type = normalizeText(body.decision_type, { label: "Decision type", max: 120 });
  if (body?.ceo_cfo_attention !== undefined)
    next.ceo_cfo_attention = normalizeText(body.ceo_cfo_attention, { label: "CEO/CFO attention", max: 60 });
  if (body?.financial_impact !== undefined) next.financial_impact = normalizeText(body.financial_impact, { label: "Financial impact" });
  if (body?.risk_impact !== undefined) next.risk_impact = normalizeText(body.risk_impact, { label: "Risk/Impact" });
  if (body?.strategic_objective !== undefined)
    next.strategic_objective = normalizeText(body.strategic_objective, { label: "Strategic objective", max: 200 });
  if (body?.decision_date !== undefined) next.decision_date = normalizeDate(body.decision_date, { label: "Decision date" });
  if (body?.further_action_required !== undefined)
    next.further_action_required = normalizeText(body.further_action_required, { label: "Further action required" });
  if (body?.context_input_required !== undefined)
    next.context_input_required = normalizeText(body.context_input_required, { label: "Context / input required" });
  if (body?.owned_by !== undefined) next.owned_by = normalizeText(body.owned_by, { label: "Owned by", max: 200 });
  if (body?.requested_by !== undefined) next.requested_by = normalizeText(body.requested_by, { label: "Requested by", max: 200 });
  if (body?.date_raised !== undefined) next.date_raised = normalizeDate(body.date_raised, { label: "Date raised" });
  if (body?.delay_impact_risk !== undefined) next.delay_impact_risk = normalizeText(body.delay_impact_risk, { label: "Delay impact / risk" });
  if (body?.blocker_waiting_on !== undefined)
    next.blocker_waiting_on = normalizeText(body.blocker_waiting_on, { label: "Blocker / waiting on" });
  if (body?.notes !== undefined) next.notes = normalizeText(body.notes, { label: "Notes" });

  // Only recompute active_record when the imported value wasn't already
  // flagged as broken (starts with "#") — once a human fixes the status on
  // a broken row, it stops being broken and this starts tracking it live.
  next.active_record =
    typeof existing.active_record === "string" && existing.active_record.startsWith("#") && body?.status === undefined
      ? existing.active_record
      : computeActiveRecord(next.status);

  await db
    .prepare(
      `UPDATE slt_decision_queue SET
        decision_required = ?, workstream = ?, assigned_to = ?, decision_deadline = ?, recommendation = ?,
        status = ?, decision_type = ?, ceo_cfo_attention = ?, financial_impact = ?, risk_impact = ?,
        strategic_objective = ?, decision_date = ?, further_action_required = ?, context_input_required = ?,
        owned_by = ?, requested_by = ?, date_raised = ?, delay_impact_risk = ?, blocker_waiting_on = ?,
        notes = ?, active_record = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      next.decision_required,
      next.workstream,
      next.assigned_to,
      next.decision_deadline,
      next.recommendation,
      next.status,
      next.decision_type,
      next.ceo_cfo_attention,
      next.financial_impact,
      next.risk_impact,
      next.strategic_objective,
      next.decision_date,
      next.further_action_required,
      next.context_input_required,
      next.owned_by,
      next.requested_by,
      next.date_raised,
      next.delay_impact_risk,
      next.blocker_waiting_on,
      next.notes,
      next.active_record,
      qid
    );

  await audit.logFieldChanges({ entityType: "decision_queue", entityId: qid, before: existing, after: next, fields: QUEUE_EDITABLE_FIELDS, userId });
  const row = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  return mapQueue(row);
}

async function setDecisionQueueArchived(userId, id, archived) {
  const qid = Number(id);
  if (!Number.isFinite(qid) || qid < 1) throw badRequest("Invalid decision queue id.");
  const existing = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  if (!existing) throw notFound("Decision queue item not found.");
  await db.prepare("UPDATE slt_decision_queue SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, qid);
  await audit.logAudit({ entityType: "decision_queue", entityId: qid, action: archived ? "archive" : "restore", userId });
  const row = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  return mapQueue(row);
}

// ── Decision Register ───────────────────────────────────────────────────

const REGISTER_EDITABLE_FIELDS = [
  "decision_required",
  "decision_summary",
  "workstream",
  "assigned_to",
  "decision_deadline",
  "recommendation",
  "status",
  "decision_type",
  "ceo_cfo_attention",
  "financial_impact",
  "risk_impact",
  "strategic_objective",
  "decision_date",
  "decision_maker",
  "further_action_required",
  "context_input_required",
  "owned_by",
  "requested_by",
  "requester",
  "date_raised",
  "logged_date",
  "delay_impact_risk",
  "blocker_waiting_on",
  "next_action",
  "original_issue",
  "rationale",
  "follow_up_status",
  "due_date",
  "notes",
];

function mapRegister(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    legacy_decision_log_id: row.legacy_decision_log_id,
    legacy_decision_id: row.legacy_decision_id,
    source_decision_id: row.source_decision_id,
    parent_decision_id: row.parent_decision_id,
    link_status: row.link_status,
    decision_required: row.decision_required,
    decision_summary: row.decision_summary,
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
    decision_maker: row.decision_maker,
    further_action_required: row.further_action_required,
    context_input_required: row.context_input_required,
    owned_by: row.owned_by,
    requested_by: row.requested_by,
    requester: row.requester,
    date_raised: row.date_raised,
    logged_date: row.logged_date,
    delay_impact_risk: row.delay_impact_risk,
    blocker_waiting_on: row.blocker_waiting_on,
    next_action: row.next_action,
    original_issue: row.original_issue,
    rationale: row.rationale,
    follow_up_status: row.follow_up_status,
    due_date: row.due_date,
    notes: row.notes,
    queue_immutable_key: row.queue_immutable_key,
    decision_log_immutable_key: row.decision_log_immutable_key,
    queue_source_key: row.queue_source_key,
    consistency_check: row.consistency_check,
    id_origin: row.id_origin,
    id_check: row.id_check,
    active_record: row.active_record,
    // Row 10's broken #REF! Active Record formula (see module header) is
    // passed through as-is above; flagged here rather than recomputed.
    data_issue: typeof row.active_record === "string" && row.active_record.startsWith("#") ? row.active_record : null,
    archived: !!row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listDecisionRegister(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `SELECT * FROM slt_decision_register
       WHERE archived = ?
       ORDER BY (decision_date IS NULL), decision_date DESC, id ASC`
    )
    .all(archived);
  return (rows || []).map(mapRegister);
}

async function getDecisionRegisterById(id) {
  const rid = Number(id);
  if (!Number.isFinite(rid) || rid < 1) throw badRequest("Invalid decision register id.");
  const row = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(rid);
  if (!row) throw notFound("Decision register entry not found.");
  return mapRegister(row);
}

async function createDecisionRegisterEntry(userId, body) {
  const decisionRequired = normalizeText(body?.decision_required, { required: true, label: "Decision required" });
  const decisionSummary = normalizeText(body?.decision_summary, { label: "Decision summary" });
  const fields = {
    legacy_decision_log_id: `HIST-${new Date().getFullYear()}-MAN-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    legacy_decision_id: null,
    source_decision_id: null,
    parent_decision_id: null,
    link_status: "historical_no_parent",
    decision_required: decisionRequired,
    decision_summary: decisionSummary,
    workstream: normalizeText(body?.workstream, { label: "Workstream", max: 200 }),
    assigned_to: normalizeText(body?.assigned_to, { label: "Assigned to", max: 200 }),
    decision_deadline: normalizeDate(body?.decision_deadline, { label: "Decision deadline" }),
    recommendation: normalizeText(body?.recommendation, { label: "Recommendation" }),
    status: normalizeText(body?.status, { label: "Status", max: 60 }) || "Decided",
    decision_type: normalizeText(body?.decision_type, { label: "Decision type", max: 120 }),
    ceo_cfo_attention: normalizeText(body?.ceo_cfo_attention, { label: "CEO/CFO attention", max: 60 }),
    financial_impact: normalizeText(body?.financial_impact, { label: "Financial impact" }),
    risk_impact: normalizeText(body?.risk_impact, { label: "Risk/Impact" }),
    strategic_objective: normalizeText(body?.strategic_objective, { label: "Strategic objective", max: 200 }),
    decision_date: normalizeDate(body?.decision_date, { label: "Decision date" }) || todayIso(),
    decision_maker: normalizeText(body?.decision_maker, { label: "Decision maker", max: 200 }),
    further_action_required: normalizeText(body?.further_action_required, { label: "Further action required" }),
    context_input_required: normalizeText(body?.context_input_required, { label: "Context / input required" }),
    owned_by: normalizeText(body?.owned_by, { label: "Owned by", max: 200 }),
    requested_by: normalizeText(body?.requested_by, { label: "Requested by", max: 200 }),
    requester: normalizeText(body?.requester, { label: "Requester", max: 200 }),
    date_raised: normalizeDate(body?.date_raised, { label: "Date raised" }),
    logged_date: todayIso(),
    delay_impact_risk: normalizeText(body?.delay_impact_risk, { label: "Delay impact / risk" }),
    blocker_waiting_on: normalizeText(body?.blocker_waiting_on, { label: "Blocker / waiting on" }),
    next_action: normalizeText(body?.next_action, { label: "Next action" }),
    original_issue: normalizeText(body?.original_issue, { label: "Original issue" }),
    rationale: normalizeText(body?.rationale, { label: "Rationale" }),
    follow_up_status: normalizeText(body?.follow_up_status, { label: "Follow-up status", max: 120 }),
    due_date: normalizeDate(body?.due_date, { label: "Due date" }),
    notes: normalizeText(body?.notes, { label: "Notes" }),
    queue_immutable_key: null,
    decision_log_immutable_key: crypto.randomBytes(8).toString("hex"),
    queue_source_key: null,
    consistency_check: null,
    id_origin: "manual",
    id_check: null,
    active_record: "ACTIVE",
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_decision_register (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  const row = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(result.lastInsertRowid);
  await audit.logAudit({ entityType: "decision_register", entityId: row.id, action: "create", userId });
  return mapRegister(row);
}

async function updateDecisionRegisterEntry(userId, id, body) {
  const rid = Number(id);
  if (!Number.isFinite(rid) || rid < 1) throw badRequest("Invalid decision register id.");
  const existing = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(rid);
  if (!existing) throw notFound("Decision register entry not found.");

  const next = { ...existing };
  const textFields = {
    decision_required: { required: true, label: "Decision required" },
    decision_summary: { label: "Decision summary" },
    workstream: { label: "Workstream", max: 200 },
    assigned_to: { label: "Assigned to", max: 200 },
    recommendation: { label: "Recommendation" },
    status: { label: "Status", max: 60 },
    decision_type: { label: "Decision type", max: 120 },
    ceo_cfo_attention: { label: "CEO/CFO attention", max: 60 },
    financial_impact: { label: "Financial impact" },
    risk_impact: { label: "Risk/Impact" },
    strategic_objective: { label: "Strategic objective", max: 200 },
    decision_maker: { label: "Decision maker", max: 200 },
    further_action_required: { label: "Further action required" },
    context_input_required: { label: "Context / input required" },
    owned_by: { label: "Owned by", max: 200 },
    requested_by: { label: "Requested by", max: 200 },
    requester: { label: "Requester", max: 200 },
    delay_impact_risk: { label: "Delay impact / risk" },
    blocker_waiting_on: { label: "Blocker / waiting on" },
    next_action: { label: "Next action" },
    original_issue: { label: "Original issue" },
    rationale: { label: "Rationale" },
    follow_up_status: { label: "Follow-up status", max: 120 },
    notes: { label: "Notes" },
  };
  for (const [key, opts] of Object.entries(textFields)) {
    if (body?.[key] !== undefined) next[key] = normalizeText(body[key], opts);
  }
  const dateFields = ["decision_deadline", "decision_date", "date_raised", "logged_date", "due_date"];
  for (const key of dateFields) {
    if (body?.[key] !== undefined) next[key] = normalizeDate(body[key], { label: key.replace(/_/g, " ") });
  }

  await db
    .prepare(
      `UPDATE slt_decision_register SET
        decision_required = ?, decision_summary = ?, workstream = ?, assigned_to = ?, decision_deadline = ?,
        recommendation = ?, status = ?, decision_type = ?, ceo_cfo_attention = ?, financial_impact = ?,
        risk_impact = ?, strategic_objective = ?, decision_date = ?, decision_maker = ?,
        further_action_required = ?, context_input_required = ?, owned_by = ?, requested_by = ?, requester = ?,
        date_raised = ?, logged_date = ?, delay_impact_risk = ?, blocker_waiting_on = ?, next_action = ?,
        original_issue = ?, rationale = ?, follow_up_status = ?, due_date = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      next.decision_required,
      next.decision_summary,
      next.workstream,
      next.assigned_to,
      next.decision_deadline,
      next.recommendation,
      next.status,
      next.decision_type,
      next.ceo_cfo_attention,
      next.financial_impact,
      next.risk_impact,
      next.strategic_objective,
      next.decision_date,
      next.decision_maker,
      next.further_action_required,
      next.context_input_required,
      next.owned_by,
      next.requested_by,
      next.requester,
      next.date_raised,
      next.logged_date,
      next.delay_impact_risk,
      next.blocker_waiting_on,
      next.next_action,
      next.original_issue,
      next.rationale,
      next.follow_up_status,
      next.due_date,
      next.notes,
      rid
    );

  await audit.logFieldChanges({
    entityType: "decision_register",
    entityId: rid,
    before: existing,
    after: next,
    fields: REGISTER_EDITABLE_FIELDS,
    userId,
  });
  const row = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(rid);
  return mapRegister(row);
}

async function setDecisionRegisterArchived(userId, id, archived) {
  const rid = Number(id);
  if (!Number.isFinite(rid) || rid < 1) throw badRequest("Invalid decision register id.");
  const existing = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(rid);
  if (!existing) throw notFound("Decision register entry not found.");
  await db.prepare("UPDATE slt_decision_register SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, rid);
  await audit.logAudit({ entityType: "decision_register", entityId: rid, action: archived ? "archive" : "restore", userId });
  const row = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(rid);
  return mapRegister(row);
}

// ── Record Decision workflow ────────────────────────────────────────────
// Moves a Decision Queue item into the permanent Decision Register,
// linking the two records via the queue item's own id (parent_decision_id)
// — never by matching titles, per the project doc's explicit rule. The
// queue item itself is marked Decided/INACTIVE but left in place (archived
// separately if desired) so its history stays visible.

async function recordDecision(userId, queueId, body = {}) {
  const qid = Number(queueId);
  if (!Number.isFinite(qid) || qid < 1) throw badRequest("Invalid decision queue id.");
  const queue = await db.prepare("SELECT * FROM slt_decision_queue WHERE id = ?").get(qid);
  if (!queue) throw notFound("Decision queue item not found.");

  const decisionSummary = normalizeText(body?.decision_summary, { label: "Decision summary" });
  const decisionMaker = normalizeText(body?.decision_maker, { label: "Decision maker", max: 200 });
  const status = normalizeText(body?.status, { label: "Status", max: 60 }) || "Decided";
  const decisionDate = normalizeDate(body?.decision_date, { label: "Decision date" }) || todayIso();
  const nextAction = normalizeText(body?.next_action, { label: "Next action" });
  const rationale = normalizeText(body?.rationale, { label: "Rationale" });
  const followUpStatus = normalizeText(body?.follow_up_status, { label: "Follow-up status", max: 120 });
  const dueDate = normalizeDate(body?.due_date, { label: "Due date" });
  const notes = normalizeText(body?.notes, { label: "Notes" }) || queue.notes;

  const year = new Date(decisionDate + "T00:00:00Z").getFullYear();
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM slt_decision_register WHERE legacy_decision_log_id LIKE ?`)
    .get(`HIST-${year}-%`);
  const seq = (Number(countRow?.n) || 0) + 1;
  const legacyDecisionLogId = `HIST-${year}-${String(seq).padStart(3, "0")}`;

  const fields = {
    legacy_decision_log_id: legacyDecisionLogId,
    legacy_decision_id: queue.legacy_decision_id,
    source_decision_id: queue.legacy_decision_id,
    parent_decision_id: qid,
    link_status: "linked",
    decision_required: queue.decision_required,
    decision_summary: decisionSummary,
    workstream: queue.workstream,
    assigned_to: queue.assigned_to,
    decision_deadline: queue.decision_deadline,
    recommendation: queue.recommendation,
    status,
    decision_type: queue.decision_type,
    ceo_cfo_attention: queue.ceo_cfo_attention,
    financial_impact: queue.financial_impact,
    risk_impact: queue.risk_impact,
    strategic_objective: queue.strategic_objective,
    decision_date: decisionDate,
    decision_maker: decisionMaker,
    further_action_required: queue.further_action_required,
    context_input_required: queue.context_input_required,
    owned_by: queue.owned_by,
    requested_by: queue.requested_by,
    requester: queue.requested_by,
    date_raised: queue.date_raised,
    logged_date: todayIso(),
    delay_impact_risk: queue.delay_impact_risk,
    blocker_waiting_on: queue.blocker_waiting_on,
    next_action: nextAction,
    original_issue: queue.decision_required,
    rationale,
    follow_up_status: followUpStatus,
    due_date: dueDate,
    notes,
    queue_immutable_key: queue.queue_immutable_key,
    decision_log_immutable_key: crypto.randomBytes(8).toString("hex"),
    queue_source_key: queue.legacy_decision_id,
    consistency_check: "ok",
    id_origin: "recorded_from_queue",
    id_check: "ok",
    active_record: computeActiveRecord(status),
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_decision_register (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  await db
    .prepare("UPDATE slt_decision_queue SET status = ?, decision_date = ?, active_record = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, decisionDate, computeActiveRecord(status), qid);

  await audit.logAudit({ entityType: "decision_queue", entityId: qid, action: "decision_recorded", newValue: legacyDecisionLogId, userId });
  await audit.logAudit({ entityType: "decision_register", entityId: result.lastInsertRowid, action: "create", userId });

  const row = await db.prepare("SELECT * FROM slt_decision_register WHERE id = ?").get(result.lastInsertRowid);
  return mapRegister(row);
}

module.exports = {
  listDecisionQueue,
  getDecisionQueueById,
  createDecisionQueueItem,
  updateDecisionQueueItem,
  setDecisionQueueArchived,
  listDecisionRegister,
  getDecisionRegisterById,
  createDecisionRegisterEntry,
  updateDecisionRegisterEntry,
  setDecisionRegisterArchived,
  recordDecision,
};
