const { db } = require("../config/db");

/**
 * SLT Tracker — Executive Dashboard + Weekly SLT Review.
 *
 * Backs the Dashboard and Weekly Review sub-tabs of the Action Tracker
 * Executive Board. getDashboard() computes the KPIs the source sheet's
 * "Board Summary" / "Executive Dashboard" tabs showed, live from the
 * current rows in slt_actions / slt_decision_queue / slt_decision_register
 * / slt_commitments (rather than the sheet's cached snapshot, which per the
 * project doc "SLT Tracker - Workbook Inventory and Reconciliation.md" was
 * stale — dated Jul 22, 2026 — so a live recompute is strictly better).
 *
 * getWeeklyReview() is a documented SUBSTITUTE for the source sheet's
 * Weekly Review tab, not a port: that sheet's FILTER formula referenced a
 * deleted column and never actually worked (§3 of the project doc). The
 * substitute rule (§9), applied identically here:
 *   An item from Actions / Decision Queue / Decision Register /
 *   Commitments appears when it's still open AND any of:
 *     - flagged for executive attention (escalation_required on an action,
 *       ceo_cfo_attention on a decision, extension_flagged on a commitment)
 *     - already overdue
 *     - due within the next 7 days
 *   A calendar event appears when it's due within the next 7 days or has
 *   prep_after_event_flag set.
 */

const CLOSED_ACTION_STATUSES = ["completed", "cancelled", "canceled", "deferred"];
const CLOSED_DECISION_STATUSES = ["decided", "closed", "completed", "cancelled", "canceled"];
const CLOSED_COMMITMENT_STATUSES = ["closed", "completed", "delivered", "cancelled", "canceled"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

function isTruthyFlag(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "no" && s !== "false" && s !== "n/a" && s !== "none" && s !== "0";
}

function isClosed(status, closedList) {
  return closedList.includes(String(status || "").trim().toLowerCase());
}

async function getDashboard() {
  const today = todayIso();

  const actions = (await db.prepare("SELECT * FROM slt_actions WHERE archived = 0").all()) || [];
  const queue = (await db.prepare("SELECT * FROM slt_decision_queue WHERE archived = 0").all()) || [];
  const register = (await db.prepare("SELECT * FROM slt_decision_register WHERE archived = 0").all()) || [];
  const commitments = (await db.prepare("SELECT * FROM slt_commitments WHERE archived = 0").all()) || [];
  const calendar = (await db.prepare("SELECT * FROM slt_calendar WHERE archived = 0").all()) || [];

  const openActions = actions.filter((a) => !isClosed(a.status, CLOSED_ACTION_STATUSES));
  const overdueActions = openActions.filter((a) => a.due_date && a.due_date < today);
  const flaggedActions = openActions.filter((a) => ["critical", "high"].includes(String(a.priority || "").toLowerCase()));

  const byOwner = {};
  for (const a of openActions) {
    const owner = a.owner || "Unassigned";
    byOwner[owner] = byOwner[owner] || { owner, open: 0, overdue: 0 };
    byOwner[owner].open += 1;
    if (a.due_date && a.due_date < today) byOwner[owner].overdue += 1;
  }
  const byStrategicObjective = {};
  for (const a of openActions) {
    const key = a.strategic_objective || "Unassigned";
    byStrategicObjective[key] = (byStrategicObjective[key] || 0) + 1;
  }

  const openQueue = queue.filter((q) => !isClosed(q.status, CLOSED_DECISION_STATUSES));
  const overdueQueue = openQueue.filter((q) => q.decision_deadline && q.decision_deadline < today);
  const execAttentionQueue = openQueue.filter((q) => isTruthyFlag(q.ceo_cfo_attention));

  const openCommitments = commitments.filter((c) => !isClosed(c.status2, CLOSED_COMMITMENT_STATUSES));
  const overdueCommitments = openCommitments.filter((c) => c.current_due && c.current_due < today);
  const extensionFlaggedCommitments = openCommitments.filter((c) => !!c.extension_flagged);

  const upcomingCalendar = calendar
    .filter((e) => e.start_date && e.start_date >= today)
    .sort((a, b) => (a.start_date > b.start_date ? 1 : -1))
    .slice(0, 10)
    .map((e) => ({ id: e.id, event_title: e.event_title, start_date: e.start_date, category: e.category, owner_lead: e.owner_lead }));

  // Per-person accountability roster, combining Action Register + 90-Day
  // Commitments ownership (the two areas that assign work to a single
  // named owner) — mirrors the source workbook's performance-roster intent
  // without re-deriving it from a broken formula.
  const roster = {};
  for (const a of openActions) {
    const owner = a.owner || "Unassigned";
    roster[owner] = roster[owner] || { owner, open_actions: 0, overdue_actions: 0, open_commitments: 0, overdue_commitments: 0 };
    roster[owner].open_actions += 1;
    if (a.due_date && a.due_date < today) roster[owner].overdue_actions += 1;
  }
  for (const c of openCommitments) {
    const owner = c.owner || "Unassigned";
    roster[owner] = roster[owner] || { owner, open_actions: 0, overdue_actions: 0, open_commitments: 0, overdue_commitments: 0 };
    roster[owner].open_commitments += 1;
    if (c.current_due && c.current_due < today) roster[owner].overdue_commitments += 1;
  }

  return {
    as_of: today,
    actions: {
      total: actions.length,
      open: openActions.length,
      overdue: overdueActions.length,
      flagged_critical_high: flaggedActions.length,
      by_owner: Object.values(byOwner).sort((a, b) => b.open - a.open),
      by_strategic_objective: Object.entries(byStrategicObjective)
        .map(([strategic_objective, count]) => ({ strategic_objective, count }))
        .sort((a, b) => b.count - a.count),
    },
    decisions: {
      queue_total: queue.length,
      queue_open: openQueue.length,
      queue_overdue: overdueQueue.length,
      queue_needs_exec_attention: execAttentionQueue.length,
      register_total: register.length,
    },
    commitments: {
      total: commitments.length,
      open: openCommitments.length,
      overdue: overdueCommitments.length,
      extension_flagged: extensionFlaggedCommitments.length,
    },
    calendar: {
      total: calendar.length,
      upcoming: upcomingCalendar,
    },
    performance_roster: Object.values(roster).sort((a, b) => b.overdue_actions + b.overdue_commitments - (a.overdue_actions + a.overdue_commitments)),
  };
}

async function getWeeklyReview() {
  const today = todayIso();
  const in7 = new Date(today + "T00:00:00Z");
  in7.setUTCDate(in7.getUTCDate() + 7);
  const in7Iso = in7.toISOString().slice(0, 10);

  const actions = (await db.prepare("SELECT * FROM slt_actions WHERE archived = 0").all()) || [];
  const queue = (await db.prepare("SELECT * FROM slt_decision_queue WHERE archived = 0").all()) || [];
  const register = (await db.prepare("SELECT * FROM slt_decision_register WHERE archived = 0").all()) || [];
  const commitments = (await db.prepare("SELECT * FROM slt_commitments WHERE archived = 0").all()) || [];
  const calendar = (await db.prepare("SELECT * FROM slt_calendar WHERE archived = 0").all()) || [];

  const actionItems = actions
    .filter((a) => !isClosed(a.status, CLOSED_ACTION_STATUSES))
    .filter((a) => {
      const overdue = !!(a.due_date && a.due_date < today);
      const dueSoon = !!(a.due_date && a.due_date >= today && a.due_date <= in7Iso);
      const flagged = isTruthyFlag(a.escalation_required);
      return overdue || dueSoon || flagged;
    })
    .map((a) => ({
      area: "action",
      id: a.id,
      title: a.item,
      owner: a.owner,
      due_date: a.due_date,
      is_overdue: !!(a.due_date && a.due_date < today),
      flagged: isTruthyFlag(a.escalation_required),
      status: a.status,
    }));

  const queueItems = queue
    .filter((q) => !isClosed(q.status, CLOSED_DECISION_STATUSES))
    .filter((q) => {
      const overdue = !!(q.decision_deadline && q.decision_deadline < today);
      const dueSoon = !!(q.decision_deadline && q.decision_deadline >= today && q.decision_deadline <= in7Iso);
      const flagged = isTruthyFlag(q.ceo_cfo_attention);
      return overdue || dueSoon || flagged;
    })
    .map((q) => ({
      area: "decision_queue",
      id: q.id,
      title: q.decision_required,
      owner: q.assigned_to || q.owned_by,
      due_date: q.decision_deadline,
      is_overdue: !!(q.decision_deadline && q.decision_deadline < today),
      flagged: isTruthyFlag(q.ceo_cfo_attention),
      status: q.status,
    }));

  const registerItems = register
    .filter((r) => !isClosed(r.status, CLOSED_DECISION_STATUSES))
    .filter((r) => {
      const overdue = !!(r.due_date && r.due_date < today);
      const dueSoon = !!(r.due_date && r.due_date >= today && r.due_date <= in7Iso);
      const flagged = isTruthyFlag(r.ceo_cfo_attention);
      return overdue || dueSoon || flagged;
    })
    .map((r) => ({
      area: "decision_register",
      id: r.id,
      title: r.decision_required,
      owner: r.assigned_to || r.owned_by,
      due_date: r.due_date,
      is_overdue: !!(r.due_date && r.due_date < today),
      flagged: isTruthyFlag(r.ceo_cfo_attention),
      status: r.status,
    }));

  const commitmentItems = commitments
    .filter((c) => !isClosed(c.status2, CLOSED_COMMITMENT_STATUSES))
    .filter((c) => {
      const overdue = !!(c.current_due && c.current_due < today);
      const dueSoon = !!(c.current_due && c.current_due >= today && c.current_due <= in7Iso);
      const flagged = !!c.extension_flagged;
      return overdue || dueSoon || flagged;
    })
    .map((c) => ({
      area: "commitment",
      id: c.id,
      title: c.commitment_deliverable,
      owner: c.owner,
      due_date: c.current_due,
      is_overdue: !!(c.current_due && c.current_due < today),
      flagged: !!c.extension_flagged,
      status: c.status2,
    }));

  const calendarItems = calendar
    .filter((e) => {
      const dueSoon = !!(e.start_date && e.start_date >= today && e.start_date <= in7Iso);
      const prepFlag = !!e.prep_after_event_flag;
      return dueSoon || prepFlag;
    })
    .map((e) => ({
      area: "calendar",
      id: e.id,
      title: e.event_title,
      owner: e.owner_lead,
      due_date: e.start_date,
      is_overdue: false,
      flagged: !!e.prep_after_event_flag,
      status: e.status,
    }));

  const items = [...actionItems, ...queueItems, ...registerItems, ...commitmentItems, ...calendarItems].sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    const ad = a.due_date || "9999-99-99";
    const bd = b.due_date || "9999-99-99";
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });

  return {
    as_of: today,
    window_end: in7Iso,
    note:
      "Substitute for the source sheet's Weekly Review tab, whose FILTER formula referenced a deleted column and never worked. Shows items from every area that are open and either overdue, due within 7 days, or flagged for executive attention — see the project doc for the exact rule.",
    items,
  };
}

module.exports = { getDashboard, getWeeklyReview };
