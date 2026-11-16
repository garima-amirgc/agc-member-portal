const { db } = require("../config/db");
const npdWorkflow = require("./npdWorkflow.service");
const email = require("./email.service");

const { httpError, canOverride, logActivity, listSltUsers } = npdWorkflow;

// ─── Gate 2 — Action Tracker (rebuilt 2026-11-15, same day as the first
// Gate 2 build) ──────────────────────────────────────────────────────────
// Garima's first Gate 2 build (an 8-item fixed readiness checklist, sourced
// from the "Launch Gate" section of the Scoring Guide tab) was replaced the
// same day once she supplied a dedicated, real Gate 2 workbook:
// Second_Gate_Action_Tracker.xlsx. That file is a genuine flexible task/
// action tracker — an arbitrary number of tasks per launch, each with an
// owner, a department, a status, a priority, start/end dates, a progress
// percentage, a dependency on other tasks, a milestone flag, and notes —
// plus a "Gantt View" tab visualizing one project's tasks on a calendar.
// This is a structurally different model from a fixed checklist, so this
// file is a full rewrite, not an edit.
//
// Design decisions, confirmed with Garima before building:
// - Fully REPLACES the 8-item checklist as Gate 2 (her choice, over
//   keeping both). The old npd_gate2_items table and its data are left in
//   the database, untouched and unused — not dropped — consistent with
//   this engagement's standing rule of never destroying data without an
//   explicit, separate "yes, delete it" from her. If she wants it cleaned
//   up later, that's a quick follow-up. npd_gate2_approvers IS reused
//   as-is for this version's sign-off — its shape (who a request's Gate 2
//   round was sent to, and whether/when they decided) didn't need to
//   change at all.
// - Dependency: she said the manager running Gate 2 decides each task's
//   dependency once Gate 1 completes, "and flow should work accordingly"
//   — read as "yes, actually enforce it," not just show it for reference
//   like the spreadsheet does. So: a task cannot be moved to In Progress
//   or Completed while any task it depends on isn't itself Completed (see
//   assertDependenciesSatisfied). Dependencies are a real edge table
//   (npd_gate2_task_dependencies), not a parsed comma-separated string
//   like the sheet's "T-002,T-003, T-004" — this lets the enforcement
//   query be exact and lets setTaskDependencies guard against a cycle.
// - Starting tasks (she didn't answer — assumption stated back to her):
//   a new Gate 2 project seeds with a standard ~8-task default template
//   drawn from the sample project in the workbook (define process, confirm
//   plant capacity, cost analysis, customer spec collection, spec sheet,
//   produce/approve sample, sales order, customer approval), with the same
//   shape of dependencies the sample shows. The template is just a
//   starting point — any task can be edited, reassigned, or deleted, and
//   new tasks can be added freely; this is NOT a fixed checklist like the
//   old Gate 2. See DEFAULT_GATE2_TASK_TEMPLATE below.
// - Final sign-off (she didn't answer — assumption stated back to her):
//   kept, for consistency with Gate 1 and the first Gate 2 build. Once
//   every active task on a request is Completed, it can be submitted to
//   chosen leadership for the same Approve/Conditional Approval/Rework/
//   Hold/Reject decision as before — reusing npd_gate2_approvers and the
//   gate2_* columns on npd_requests exactly as they already existed.
// - Owner/Department are free text (matching the workbook — neither
//   column had a dropdown in the source sheet), not tied to a system user.
//   Because of that, this version does NOT carry over the old Gate 2's
//   per-item "only the assigned owner can change its status" rule — there
//   is no reliable way to match free text against a logged-in user.
//   Anyone with general NPD module access can create, edit, or change the
//   status of any task, the same way Gate 1 itself already works. If
//   Garima wants real per-task ownership permissions later, that needs an
//   actual "assign to a system user" field in addition to (or instead of)
//   the free-text Owner field — a separate, additive change.
// - Gate 2 still only unlocks once a request's Gate 1 review_status is
//   'approved' — unchanged from the first build.

const GATE2_TASK_STATUSES = ["not_started", "in_progress", "on_hold", "blocked", "completed"];
const GATE2_TASK_STATUS_LABELS = Object.freeze({
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  blocked: "Blocked",
  completed: "Completed",
});
const GATE2_TASK_PRIORITIES = ["low", "medium", "high", "critical"];
const GATE2_FORWARD_STATUSES = new Set(["in_progress", "completed"]); // statuses that require dependencies to be clear

const GATE2_DECISIONS = ["approved", "conditional_approval", "rework", "hold", "rejected"];
const GATE2_DECISION_LABELS = Object.freeze({
  approved: "Approved",
  conditional_approval: "Conditional Approval",
  rework: "Needs Rework",
  hold: "Hold",
  rejected: "Rejected",
});

// The sample project in Second_Gate_Action_Tracker.xlsx ("Rob's 5oz IQF
// Breast", 9 rows, 2 of which were the same plant-capacity step duplicated
// across 2 plants). Trimmed to one generic plant-capacity step here since a
// template has to be plant-agnostic; teams can duplicate a task per plant
// if a launch actually needs that. dependsOn is a list of 0-based indexes
// into this same array, resolved into real task ids after each is created.
const DEFAULT_GATE2_TASK_TEMPLATE = Object.freeze([
  { title: "Define and document the end-to-end project process", department: "Planning", priority: "medium", isMilestone: false, dependsOn: [] },
  { title: "Confirm the assigned plant has the equipment, labour, and systems to meet the required volume and quality", department: "Production", priority: "medium", isMilestone: false, dependsOn: [0] },
  { title: "Complete the full cost analysis (raw materials, packaging, labour, overhead, yield loss) and calculate cost per unit and expected margin", department: "Finance", priority: "critical", isMilestone: false, dependsOn: [] },
  { title: "Collect spec requirements from the customer (formulation, packaging, allergen) and send to FSQA for review and confirmation", department: "Sales", priority: "critical", isMilestone: false, dependsOn: [] },
  { title: "Create the product spec sheet (ingredients, formulation, nutritional/allergen info, physical/micro limits, packaging, labelling, shelf life)", department: "FSQA", priority: "high", isMilestone: true, dependsOn: [3] },
  { title: "Produce the product sample per the approved process and spec sheet, record formulation/process parameters, and send for review", department: "Production", priority: "critical", isMilestone: false, dependsOn: [1, 2, 4] },
  { title: "Create the sales order for the sample (customer details, quantity, ship-to address, carrier, requested ship date)", department: "Sales", priority: "high", isMilestone: false, dependsOn: [] },
  { title: "Obtain formal sample approval from the customer or internal team against the spec sheet, and document feedback or required changes", department: "Sales", priority: "critical", isMilestone: true, dependsOn: [5] },
]);

function isGate1Approved(request) {
  return !!request && request.review_status === "approved";
}

function nextTaskCode(existingCodes) {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^T-(\d+)$/.exec(String(code || "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T-${String(max + 1).padStart(3, "0")}`;
}

function clampProgress(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function isValidDateString(s) {
  if (!s) return true; // null/blank is allowed
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s));
}

function durationDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end - start) / 86400000) + 1;
}

// Idempotent and safe to call on every Gate 2 touch — each task and each
// dependency edge is only ever inserted if it doesn't already exist for
// this request, so re-running it never overwrites or duplicates anything a
// human has since added, edited, or deleted.
async function ensureGate2TasksInitialized(request, user) {
  const existing = await db.prepare("SELECT id, task_code, deleted_at FROM npd_gate2_tasks WHERE request_id = ?").all(request.id);
  const haveCodes = new Set(existing.map((r) => r.task_code));
  const codeToId = new Map(existing.map((r) => [r.task_code, r.id]));
  // A template task someone has since DELETED must stay deleted, and must
  // never have a dependency edge silently re-created pointing at it — this
  // set is checked before every (re-)insert below, both for the task row
  // itself and for any edge naming it.
  const deletedCodes = new Set(existing.filter((r) => r.deleted_at).map((r) => r.task_code));
  const now = new Date().toISOString();
  const actorId = user && user.id ? user.id : null;

  const indexToCode = DEFAULT_GATE2_TASK_TEMPLATE.map((_, i) => `T-${String(i + 1).padStart(3, "0")}`);

  for (let i = 0; i < DEFAULT_GATE2_TASK_TEMPLATE.length; i++) {
    const code = indexToCode[i];
    if (haveCodes.has(code)) continue;
    const def = DEFAULT_GATE2_TASK_TEMPLATE[i];
    try {
      const result = await db
        .prepare(
          `INSERT INTO npd_gate2_tasks
             (request_id, task_code, title, department, status, priority, progress_percent, is_milestone, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'not_started', ?, 0, ?, ?, ?, ?, ?)`
        )
        .run(request.id, code, def.title, def.department, def.priority, def.isMilestone ? 1 : 0, actorId, actorId, now, now);
      codeToId.set(code, result.lastInsertRowid);
      haveCodes.add(code);
    } catch {
      // Two people opening the tab for the first time at the same moment —
      // the UNIQUE(request_id, task_code) constraint rejects the loser; the
      // row already exists either way, just re-read it below if needed.
    }
  }

  // Re-read in case a concurrent caller created some of these first.
  if (codeToId.size < DEFAULT_GATE2_TASK_TEMPLATE.length) {
    const rows = await db.prepare("SELECT id, task_code, deleted_at FROM npd_gate2_tasks WHERE request_id = ?").all(request.id);
    for (const r of rows) {
      codeToId.set(r.task_code, r.id);
      if (r.deleted_at) deletedCodes.add(r.task_code);
    }
  }

  const allTaskIds = [...codeToId.values()];
  let existingDeps = [];
  if (allTaskIds.length > 0) {
    const placeholders = allTaskIds.map(() => "?").join(",");
    existingDeps = await db
      .prepare(`SELECT task_id, depends_on_task_id FROM npd_gate2_task_dependencies WHERE task_id IN (${placeholders})`)
      .all(...allTaskIds);
  }
  const haveDepPairs = new Set(existingDeps.map((d) => `${d.task_id}:${d.depends_on_task_id}`));

  for (let i = 0; i < DEFAULT_GATE2_TASK_TEMPLATE.length; i++) {
    const def = DEFAULT_GATE2_TASK_TEMPLATE[i];
    const code = indexToCode[i];
    const taskId = codeToId.get(code);
    if (!taskId || deletedCodes.has(code) || !def.dependsOn || def.dependsOn.length === 0) continue;
    for (const depIndex of def.dependsOn) {
      const depCode = indexToCode[depIndex];
      if (deletedCodes.has(depCode)) continue; // the task it would depend on was deleted — don't resurrect this edge
      const dependsOnId = codeToId.get(depCode);
      if (!dependsOnId) continue;
      const pairKey = `${taskId}:${dependsOnId}`;
      if (haveDepPairs.has(pairKey)) continue;
      try {
        await db
          .prepare("INSERT INTO npd_gate2_task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)")
          .run(taskId, dependsOnId, now);
        haveDepPairs.add(pairKey);
      } catch {
        // Already there (race or re-run) — fine either way.
      }
    }
  }
}

async function fetchRequestOrThrow(requestId) {
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ? AND deleted_at IS NULL").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  return request;
}

async function loadTasksWithDependencies(requestId) {
  const tasks = await db
    .prepare("SELECT * FROM npd_gate2_tasks WHERE request_id = ? AND deleted_at IS NULL ORDER BY id ASC")
    .all(requestId);
  if (tasks.length === 0) return [];

  const ids = tasks.map((t) => t.id);
  const placeholders = ids.map(() => "?").join(",");
  const depRows = await db
    .prepare(
      `SELECT d.task_id, t.id AS dep_id, t.task_code AS dep_code, t.title AS dep_title, t.status AS dep_status
       FROM npd_gate2_task_dependencies d
       JOIN npd_gate2_tasks t ON t.id = d.depends_on_task_id
       WHERE d.task_id IN (${placeholders})`
    )
    .all(...ids);

  const depsByTask = new Map();
  for (const row of depRows) {
    if (!depsByTask.has(row.task_id)) depsByTask.set(row.task_id, []);
    depsByTask.get(row.task_id).push({ id: row.dep_id, task_code: row.dep_code, title: row.dep_title, status: row.dep_status });
  }

  return tasks.map((t) => {
    const depends_on = depsByTask.get(t.id) || [];
    return {
      ...t,
      is_milestone: !!t.is_milestone,
      duration_days: durationDays(t.start_date, t.end_date),
      depends_on,
      blocked_by_dependency: depends_on.some((d) => d.status !== "completed"),
    };
  });
}

async function getGate2Status(requestId, user) {
  const request = await fetchRequestOrThrow(requestId);

  if (!isGate1Approved(request)) {
    return {
      locked: true,
      tasks: [],
      summary: { totalTasks: 0, completedCount: 0, averageProgress: 0 },
      allCompleted: false,
      gate2_status: null,
      approvers: [],
    };
  }

  await ensureGate2TasksInitialized(request, user);
  const tasks = await loadTasksWithDependencies(requestId);

  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const averageProgress = totalTasks === 0 ? 0 : Math.round(tasks.reduce((sum, t) => sum + (Number(t.progress_percent) || 0), 0) / totalTasks);
  const allCompleted = totalTasks > 0 && completedCount === totalTasks;

  const approvers = await db
    .prepare(
      `SELECT a.user_id, u.name, u.email, a.assigned_at, a.decided_at
       FROM npd_gate2_approvers a JOIN users u ON u.id = a.user_id
       WHERE a.request_id = ? ORDER BY a.assigned_at ASC`
    )
    .all(requestId);

  return {
    locked: false,
    tasks,
    summary: { totalTasks, completedCount, averageProgress },
    allCompleted,
    gate2_status: request.gate2_status,
    gate2_submitted_for_review_at: request.gate2_submitted_for_review_at,
    gate2_submitted_by: request.gate2_submitted_by,
    gate2_decision_by: request.gate2_decision_by,
    gate2_decision_at: request.gate2_decision_at,
    approvers,
  };
}

// Throws if any of the given dependency task ids isn't itself Completed —
// used whenever a task is being moved to In Progress or Completed.
async function assertDependenciesSatisfied(requestId, taskId) {
  const rows = await db
    .prepare(
      `SELECT t.task_code, t.status FROM npd_gate2_task_dependencies d
       JOIN npd_gate2_tasks t ON t.id = d.depends_on_task_id
       WHERE d.task_id = ?`
    )
    .all(taskId);
  const blocking = rows.filter((r) => r.status !== "completed");
  if (blocking.length > 0) {
    const codes = blocking.map((r) => r.task_code).join(", ");
    throw httpError(400, `This task depends on ${codes}, which ${blocking.length > 1 ? "aren't" : "isn't"} Completed yet.`);
  }
}

function applyCommonTaskFields(fields, body) {
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = String(body.title || "").trim();
    if (!title) throw httpError(400, "Task description is required.");
    fields.title = title.slice(0, 1000);
  }
  if (Object.prototype.hasOwnProperty.call(body, "owner_name")) {
    fields.owner_name = body.owner_name ? String(body.owner_name).trim().slice(0, 200) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "department")) {
    fields.department = body.department ? String(body.department).trim().slice(0, 150) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    const p = String(body.priority || "");
    if (!GATE2_TASK_PRIORITIES.includes(p)) throw httpError(400, "Invalid priority.");
    fields.priority = p;
  }
  if (Object.prototype.hasOwnProperty.call(body, "start_date")) {
    if (!isValidDateString(body.start_date)) throw httpError(400, "Invalid start date.");
    fields.start_date = body.start_date || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "end_date")) {
    if (!isValidDateString(body.end_date)) throw httpError(400, "Invalid end date.");
    fields.end_date = body.end_date || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "progress_percent")) {
    fields.progress_percent = clampProgress(body.progress_percent);
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_milestone")) {
    fields.is_milestone = body.is_milestone ? 1 : 0;
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    fields.notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;
  }
}

async function createGate2Task({ requestId, user, body }) {
  const request = await fetchRequestOrThrow(requestId);
  if (!isGate1Approved(request)) throw httpError(400, "Gate 2 unlocks once this request's Gate 1 review is Approved.");
  await ensureGate2TasksInitialized(request, user);

  const body_ = body || {};
  const fields = { title: "", owner_name: null, department: null, priority: "medium", start_date: null, end_date: null, progress_percent: 0, is_milestone: 0, notes: null };
  applyCommonTaskFields(fields, body_);
  if (!fields.title) throw httpError(400, "Task description is required.");

  let status = "not_started";
  if (Object.prototype.hasOwnProperty.call(body_, "status")) {
    status = String(body_.status || "not_started");
    if (!GATE2_TASK_STATUSES.includes(status)) throw httpError(400, "Invalid status.");
  }

  const existingCodes = (await db.prepare("SELECT task_code FROM npd_gate2_tasks WHERE request_id = ?").all(requestId)).map((r) => r.task_code);
  const taskCode = nextTaskCode(existingCodes);
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO npd_gate2_tasks
         (request_id, task_code, title, owner_name, department, status, priority, start_date, end_date, progress_percent, is_milestone, notes, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      requestId,
      taskCode,
      fields.title,
      fields.owner_name,
      fields.department,
      status,
      fields.priority,
      fields.start_date,
      fields.end_date,
      fields.progress_percent,
      fields.is_milestone,
      fields.notes,
      user.id,
      user.id,
      now,
      now
    );

  if (GATE2_FORWARD_STATUSES.has(status)) {
    // A brand-new task has no dependency rows yet unless depends_on_task_ids
    // was also passed — check those explicitly rather than the (empty) DB
    // state, since we haven't inserted them yet.
    const ids = Array.isArray(body_.depends_on_task_ids) ? body_.depends_on_task_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length > 0) {
      const rows = await db.prepare(`SELECT id, task_code, status FROM npd_gate2_tasks WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
      const blocking = rows.filter((r) => r.status !== "completed");
      if (blocking.length > 0) {
        throw httpError(400, `This task depends on ${blocking.map((r) => r.task_code).join(", ")}, which ${blocking.length > 1 ? "aren't" : "isn't"} Completed yet.`);
      }
    }
  }

  const newTaskId = result.lastInsertRowid;
  if (Array.isArray(body_.depends_on_task_ids) && body_.depends_on_task_ids.length > 0) {
    await setTaskDependencies({ requestId, taskId: newTaskId, user, dependsOnTaskIds: body_.depends_on_task_ids, skipStatusRecheck: true });
  }

  return getGate2Status(requestId, user);
}

async function updateGate2Task({ requestId, taskId, user, body }) {
  const request = await fetchRequestOrThrow(requestId);
  if (!isGate1Approved(request)) throw httpError(400, "Gate 2 unlocks once this request's Gate 1 review is Approved.");

  const task = await db.prepare("SELECT * FROM npd_gate2_tasks WHERE id = ? AND request_id = ? AND deleted_at IS NULL").get(taskId, requestId);
  if (!task) throw httpError(404, "Task not found.");

  const body_ = body || {};
  const fields = {};
  applyCommonTaskFields(fields, body_);

  if (Object.prototype.hasOwnProperty.call(body_, "status")) {
    const status = String(body_.status || "");
    if (!GATE2_TASK_STATUSES.includes(status)) throw httpError(400, "Invalid status.");
    if (GATE2_FORWARD_STATUSES.has(status)) {
      await assertDependenciesSatisfied(requestId, taskId);
    }
    fields.status = status;
  }

  if (Object.keys(fields).length === 0) return getGate2Status(requestId, user);

  const setCols = Object.keys(fields);
  const setSql = setCols.map((c) => `${c} = ?`).join(", ");
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE npd_gate2_tasks SET ${setSql}, updated_by = ?, updated_at = ? WHERE id = ? AND request_id = ?`)
    .run(...setCols.map((c) => fields[c]), user.id, now, taskId, requestId);

  return getGate2Status(requestId, user);
}

async function deleteGate2Task({ requestId, taskId, user }) {
  await fetchRequestOrThrow(requestId);
  const task = await db.prepare("SELECT * FROM npd_gate2_tasks WHERE id = ? AND request_id = ? AND deleted_at IS NULL").get(taskId, requestId);
  if (!task) throw httpError(404, "Task not found.");

  const now = new Date().toISOString();
  await db.prepare("UPDATE npd_gate2_tasks SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, user.id, now, taskId);
  // Clean up any dependency edges touching this task in either direction so
  // no other task is ever permanently stuck waiting on one that's gone.
  await db.prepare("DELETE FROM npd_gate2_task_dependencies WHERE task_id = ? OR depends_on_task_id = ?").run(taskId, taskId);

  return getGate2Status(requestId, user);
}

// Replaces the full dependency set for one task. Validates every id is a
// real, non-deleted task on the SAME request, rejects self-dependency, and
// rejects anything that would create a cycle (A depends on B which,
// directly or transitively, already depends on A) by walking the existing
// graph for this request before writing the new edges.
async function setTaskDependencies({ requestId, taskId, user, dependsOnTaskIds, skipStatusRecheck }) {
  await fetchRequestOrThrow(requestId);
  const task = await db.prepare("SELECT * FROM npd_gate2_tasks WHERE id = ? AND request_id = ? AND deleted_at IS NULL").get(taskId, requestId);
  if (!task) throw httpError(404, "Task not found.");

  const ids = Array.isArray(dependsOnTaskIds) ? [...new Set(dependsOnTaskIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (ids.includes(Number(taskId))) throw httpError(400, "A task can't depend on itself.");

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await db.prepare(`SELECT id FROM npd_gate2_tasks WHERE request_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`).all(requestId, ...ids);
    if (rows.length !== ids.length) throw httpError(400, "One of the selected dependencies isn't a task on this request.");

    // Build the existing dependency graph for this request (excluding this
    // task's own current edges, since we're about to replace them), then
    // make sure none of the proposed new edges creates a cycle back to
    // this task.
    const allTasks = await db.prepare("SELECT id FROM npd_gate2_tasks WHERE request_id = ? AND deleted_at IS NULL").all(requestId);
    const allIds = allTasks.map((t) => t.id);
    const edgeRows = await db
      .prepare(`SELECT task_id, depends_on_task_id FROM npd_gate2_task_dependencies WHERE task_id IN (${allIds.map(() => "?").join(",") || "NULL"}) AND task_id <> ?`)
      .all(...allIds, taskId);
    const adjacency = new Map();
    for (const row of edgeRows) {
      if (!adjacency.has(row.task_id)) adjacency.set(row.task_id, []);
      adjacency.get(row.task_id).push(row.depends_on_task_id);
    }

    for (const candidateId of ids) {
      // If candidateId can already reach taskId by following "depends on"
      // edges, adding taskId -> candidateId would close a cycle.
      const seen = new Set([candidateId]);
      const stack = [candidateId];
      let cycles = false;
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === Number(taskId)) {
          cycles = true;
          break;
        }
        for (const next of adjacency.get(current) || []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      if (cycles) {
        const codeRow = await db.prepare("SELECT task_code FROM npd_gate2_tasks WHERE id = ?").get(candidateId);
        throw httpError(400, `That would create a dependency cycle through ${codeRow ? codeRow.task_code : "another task"}.`);
      }
    }
  }

  await db.prepare("DELETE FROM npd_gate2_task_dependencies WHERE task_id = ?").run(taskId);
  const now = new Date().toISOString();
  for (const dependsOnId of ids) {
    try {
      await db.prepare("INSERT INTO npd_gate2_task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)").run(taskId, dependsOnId, now);
    } catch {
      // Duplicate in the input list — ids was already de-duplicated above,
      // so this is just extra safety.
    }
  }

  // If this task is currently sitting In Progress/Completed and the new
  // dependency set is no longer satisfied, that's left alone deliberately
  // (no silent auto-revert — see the design note at the top of this file).
  // skipStatusRecheck is only used right after creation, where the status/
  // dependency check already happened together in createGate2Task.
  void skipStatusRecheck;

  return getGate2Status(requestId, user);
}

async function submitForGate2Review({ requestId, user, approverUserIds }) {
  const request = await fetchRequestOrThrow(requestId);
  if (!isGate1Approved(request)) throw httpError(400, "Gate 2 unlocks once this request's Gate 1 review is Approved.");

  await ensureGate2TasksInitialized(request, user);
  const tasks = await db.prepare("SELECT * FROM npd_gate2_tasks WHERE request_id = ? AND deleted_at IS NULL").all(requestId);
  if (tasks.length === 0) throw httpError(400, "Add at least one task before submitting for Gate 2 review.");

  const notCompleted = tasks.filter((t) => t.status !== "completed");
  if (notCompleted.length > 0) {
    throw httpError(400, `All tasks must be Completed before submitting (${notCompleted.length} not there yet).`);
  }

  const ids = Array.isArray(approverUserIds)
    ? [...new Set(approverUserIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) throw httpError(400, "Pick at least one person to send this to.");

  const rosterRows = await db.prepare("SELECT user_id FROM npd_slt_users").all();
  const rosterIds = new Set(rosterRows.map((r) => r.user_id));
  for (const id of ids) {
    if (!rosterIds.has(id)) throw httpError(400, "One of the selected approvers is not on the SLT roster.");
  }

  const now = new Date().toISOString();
  await db.prepare("DELETE FROM npd_gate2_approvers WHERE request_id = ?").run(requestId);
  for (const uid of ids) {
    await db.prepare("INSERT INTO npd_gate2_approvers (request_id, user_id, assigned_at) VALUES (?, ?, ?)").run(requestId, uid, now);
  }

  await db
    .prepare(
      `UPDATE npd_requests SET gate2_status = 'pending_review', gate2_submitted_for_review_at = ?, gate2_submitted_by = ?,
         gate2_decision_by = NULL, gate2_decision_at = NULL, updated_at = ? WHERE id = ?`
    )
    .run(now, user.id, now, requestId);

  await logActivity({
    requestId,
    user,
    action: "gate2_submitted_for_review",
    description: `${user.name} submitted ${request.request_number} for Gate 2 sign-off.`,
  });

  // Fire-and-forget, one per approver — same pattern as Gate 1's
  // submitForReview in npdWorkflow.service.js (sendSltReviewRequestedEmail).
  const roster = await listSltUsers();
  const chosenApprovers = roster.filter((r) => ids.includes(Number(r.user_id)));
  for (const approver of chosenApprovers) {
    void email
      .sendGate2ReviewRequestedEmail({
        to: approver.email,
        recipientName: approver.name,
        requesterName: user?.name,
        requestNumber: request.request_number,
        customerName: request.customer_name,
        productName: request.product_name,
        requestId,
      })
      .catch((err) => {
        console.error(`[npd] Gate 2 review-requested email to ${approver.email} failed:`, err?.message || err);
      });
  }

  return getGate2Status(requestId, user);
}

async function recordGate2Decision({ requestId, user, decision }) {
  if (!GATE2_DECISIONS.includes(decision)) throw httpError(400, "Invalid decision.");
  const request = await fetchRequestOrThrow(requestId);
  if (request.gate2_status !== "pending_review") throw httpError(400, "This request isn't currently pending Gate 2 review.");

  if (!canOverride(user)) {
    const assignment = await db
      .prepare("SELECT * FROM npd_gate2_approvers WHERE request_id = ? AND user_id = ? AND decided_at IS NULL")
      .get(requestId, user.id);
    if (!assignment) throw httpError(403, "This request wasn't sent to you for Gate 2 review.");
  }

  const now = new Date().toISOString();
  await db
    .prepare("UPDATE npd_requests SET gate2_status = ?, gate2_decision_by = ?, gate2_decision_at = ?, updated_at = ? WHERE id = ?")
    .run(decision, user.id, now, now, requestId);
  await db.prepare("UPDATE npd_gate2_approvers SET decided_at = ? WHERE request_id = ? AND user_id = ?").run(now, requestId, user.id);

  await logActivity({
    requestId,
    user,
    action: "gate2_decision_recorded",
    description: `${user.name} recorded "${GATE2_DECISION_LABELS[decision]}" for ${request.request_number}'s Gate 2 review.`,
  });

  // Let the requester know their Gate 2 submission got a decision —
  // fire-and-forget, same pattern as Gate 1's recordDecision in
  // npdWorkflow.service.js (sendSltDecisionEmail).
  const requester = request.created_by ? await db.prepare("SELECT name, email FROM users WHERE id = ?").get(request.created_by) : null;
  if (requester?.email) {
    void email
      .sendGate2DecisionEmail({
        to: requester.email,
        recipientName: requester.name,
        decidedByName: user?.name,
        requestNumber: request.request_number,
        customerName: request.customer_name,
        productName: request.product_name,
        decisionLabel: GATE2_DECISION_LABELS[decision],
        requestId,
      })
      .catch((err) => {
        console.error(`[npd] Gate 2 decision email to ${requester.email} failed:`, err?.message || err);
      });
  }

  return getGate2Status(requestId, user);
}

async function listMyPendingGate2Decisions(user) {
  if (!user) return [];
  return db
    .prepare(
      `SELECT r.id, r.request_number, r.product_name, r.customer_name, r.created_by, u.name AS created_by_name
       FROM npd_gate2_approvers a
       JOIN npd_requests r ON r.id = a.request_id AND r.deleted_at IS NULL
       LEFT JOIN users u ON u.id = r.created_by
       WHERE a.user_id = ? AND a.decided_at IS NULL AND r.gate2_status = 'pending_review'
       ORDER BY a.assigned_at ASC`
    )
    .all(user.id);
}

module.exports = {
  GATE2_TASK_STATUSES,
  GATE2_TASK_STATUS_LABELS,
  GATE2_TASK_PRIORITIES,
  GATE2_DECISIONS,
  GATE2_DECISION_LABELS,
  getGate2Status,
  createGate2Task,
  updateGate2Task,
  deleteGate2Task,
  setTaskDependencies,
  submitForGate2Review,
  recordGate2Decision,
  listMyPendingGate2Decisions,
};
