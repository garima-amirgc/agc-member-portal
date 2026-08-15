const { db } = require("../config/db");
const { ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");

// ─── New Product Development workflow engine ───────────────────────────────
// All state transitions live here so the rules are enforced once, on the
// server, regardless of which route (or future integration) calls in.
// Frontend buttons are a convenience only — every action re-checks
// permissions and step state against the database.

const STEP_DEFS = Object.freeze([
  { number: 1, key: "new_product_request", name: "Create New Product Request", department: "Sales", type: "submit" },
  { number: 2, key: "management_approval", name: "Management Approval", type: "approval", approvalType: "management_approval" },
  { number: 3, key: "plu_creation", name: "PLU Creation Form", department: "Sales", type: "submit" },
  { number: 4, key: "spec_sheet", name: "Complete Spec Sheet", department: "FSQA", type: "submit" },
  { number: 5, key: "sample_request", name: "Sample Request", department: ["Sales", "Production"], type: "submit" },
  { number: 6, key: "production_confirmation", name: "Production Confirmation", department: "Production", type: "submit" },
  { number: 7, key: "finance_costing", name: "Finance Costing", department: "Finance", type: "submit" },
  { number: 8, key: "finance_approval", name: "Finance Approval", type: "approval", approvalType: "finance_approval" },
  { number: 9, key: "customer_approval", name: "Customer Approval", department: "Sales", type: "submit" },
  { number: 10, key: "final_setup", name: "Final PLU / Routing / BOM Setup", department: "Sales", type: "submit" },
  // The source spec called for a fourth "BC Test" confirmation alongside
  // FSQA/Sales/Production. There's no "BC Test" department in this system
  // (see frontend/src/constants/departments.js), so a standalone
  // confirmation for it could never be satisfied by anyone. FSQA owns lab/
  // micro testing here, so that confirmation is folded into FSQA's sign-off
  // instead of left permanently unconfirmable.
  {
    number: 11,
    key: "final_verification",
    name: "Final Verification (FSQA / Production / Sales)",
    type: "multi_confirm",
    confirmations: ["FSQA", "Production", "Sales"],
  },
  { number: 12, key: "final_authorization", name: "Final Authorization", type: "approval", approvalType: "final_authorization" },
  { number: 13, key: "first_shipment", name: "First Shipment Confirmation", department: "Sales", type: "submit" },
]);

const CLOSED_REQUEST_STATUSES = ["completed", "cancelled", "customer_rejected"];

function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getStepDef(stepNumber) {
  return STEP_DEFS.find((s) => s.number === Number(stepNumber)) || null;
}

function getStepDefByKey(key) {
  return STEP_DEFS.find((s) => s.key === key) || null;
}

function userHasDepartment(user, dept) {
  if (!dept) return false;
  const depts = Array.isArray(user?.departments) ? user.departments : [];
  const list = Array.isArray(dept) ? dept : [dept];
  return list.some((d) => depts.includes(d));
}

// Full admins and anyone granted the NPD admin permission can act on any
// step, configure approvers/access, and reopen steps. This is the same
// full-admin-bypass convention used everywhere else in the app.
function canOverride(user) {
  return hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);
}

async function hasNpdAccess(user) {
  if (!user) return false;
  if (canOverride(user)) return true;
  const row = await db.prepare("SELECT 1 FROM npd_access_users WHERE user_id = ?").get(user.id);
  return !!row;
}

// Per-step access list. Access is ALWAYS assignment-based — a step with
// nobody assigned yet can only be acted on by an NPD admin, until someone
// explicitly assigns people to it on the "Manage access & approvers" page.
// There is deliberately no "fall back to the whole department" behavior:
// department membership alone never grants access to a submit step or a
// Final Verification confirmation slot.
async function getStepAssigneeIds(stepKey) {
  const rows = await db.prepare("SELECT user_id FROM npd_step_assignees WHERE step_key = ?").all(stepKey);
  return rows.map((r) => r.user_id);
}

async function canActOnStep(user, stepDef) {
  if (!user || !stepDef) return false;
  if (canOverride(user)) return true;
  if (stepDef.type === "approval" || stepDef.type === "multi_confirm") return false;
  const assignees = await getStepAssigneeIds(stepDef.key);
  return assignees.includes(user.id);
}

// Multi-confirm steps (currently just Final Verification) have one
// confirming slot per department. Each slot gets its own allowlist in
// npd_step_assignees, keyed by "<stepKey>:<department>" — same
// assignment-only rule as canActOnStep, just per-slot.
function multiConfirmAssigneeKey(stepKey, dept) {
  return `${stepKey}:${dept}`;
}

async function canConfirmVerification(user, stepDef, confirmationKey) {
  if (!user || !stepDef) return false;
  if (canOverride(user)) return true;
  const assignees = await getStepAssigneeIds(multiConfirmAssigneeKey(stepDef.key, confirmationKey));
  return assignees.includes(user.id);
}

// The first step creates the request itself (nothing to skip past — the
// request wouldn't exist yet), and PLU Creation Form (step 3) feeds data
// that later steps depend on, so neither can be skipped. Every other step
// can be skipped by whoever would normally act on it (or an NPD admin), so
// the rest of the workflow can keep moving while that person catches up.
const NON_SKIPPABLE_STEP_NUMBERS = new Set([1, 3]);

async function canSkipStep(user, stepDef) {
  if (!user || !stepDef) return false;
  if (canOverride(user)) return true;
  if (stepDef.type === "submit") return canActOnStep(user, stepDef);
  if (stepDef.type === "approval") return isConfiguredApprover(stepDef.approvalType, user.id);
  if (stepDef.type === "multi_confirm") {
    for (const dept of stepDef.confirmations) {
      if (await canConfirmVerification(user, stepDef, dept)) return true;
    }
    return false;
  }
  return false;
}

async function getStepAssignees(stepKey) {
  return db
    .prepare(
      `SELECT sa.user_id, u.name, u.email
       FROM npd_step_assignees sa JOIN users u ON u.id = sa.user_id
       WHERE sa.step_key = ? ORDER BY u.name ASC`
    )
    .all(stepKey);
}

// A "step key" here can be either a submit step's own key, or a multi-confirm
// slot's compound "<stepKey>:<department>" key — both live in the same
// npd_step_assignees table.
function isAssignableTargetKey(key) {
  for (const s of STEP_DEFS) {
    if (s.type === "submit" && s.key === key) return true;
    if (s.type === "multi_confirm") {
      for (const dept of s.confirmations) {
        if (multiConfirmAssigneeKey(s.key, dept) === key) return true;
      }
    }
  }
  return false;
}

async function setStepAssignees(stepKey, userIds) {
  if (!isAssignableTargetKey(stepKey)) throw httpError(400, "Unknown or non-assignable step.");
  await db.prepare("DELETE FROM npd_step_assignees WHERE step_key = ?").run(stepKey);
  for (const uid of userIds || []) {
    const n = Number(uid);
    if (!Number.isInteger(n) || n < 1) continue;
    await db.prepare("INSERT INTO npd_step_assignees (step_key, user_id) VALUES (?, ?)").run(stepKey, n);
  }
  return getStepAssignees(stepKey);
}

async function listAllStepAssignees() {
  const out = {};
  for (const s of STEP_DEFS) {
    if (s.type === "submit") {
      out[s.key] = await getStepAssignees(s.key);
    } else if (s.type === "multi_confirm") {
      for (const dept of s.confirmations) {
        out[multiConfirmAssigneeKey(s.key, dept)] = await getStepAssignees(multiConfirmAssigneeKey(s.key, dept));
      }
    }
  }
  return out;
}

function requestStatusForStep(stepDef) {
  if (stepDef.type === "approval") return "waiting_approval";
  return "in_progress";
}

async function generateRequestNumber() {
  const year = new Date().getFullYear();
  const prefix = `NPR-${year}-`;
  const row = await db
    .prepare("SELECT request_number FROM npd_requests WHERE request_number LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`${prefix}%`);
  let next = 1;
  if (row?.request_number) {
    const m = /NPR-\d{4}-(\d+)/.exec(row.request_number);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── Approver config ────────────────────────────────────────────────────────

async function getConfiguredApprovers(approvalType) {
  return db
    .prepare(
      `SELECT c.user_id AS user_id, u.name AS name, u.email AS email
       FROM npd_approver_config c JOIN users u ON u.id = c.user_id
       WHERE c.approval_type = ? ORDER BY c.sort_order ASC, u.name ASC`
    )
    .all(approvalType);
}

async function isConfiguredApprover(approvalType, userId) {
  const row = await db
    .prepare("SELECT 1 FROM npd_approver_config WHERE approval_type = ? AND user_id = ?")
    .get(approvalType, userId);
  return !!row;
}

async function setApprovers(approvalType, userIds) {
  const valid = STEP_DEFS.some((s) => s.approvalType === approvalType);
  if (!valid) throw httpError(400, "Unknown approval type.");
  await db.prepare("DELETE FROM npd_approver_config WHERE approval_type = ?").run(approvalType);
  let order = 0;
  for (const uid of userIds || []) {
    const n = Number(uid);
    if (!Number.isInteger(n) || n < 1) continue;
    await db
      .prepare("INSERT INTO npd_approver_config (approval_type, user_id, sort_order) VALUES (?, ?, ?)")
      .run(approvalType, n, order++);
  }
  return getConfiguredApprovers(approvalType);
}

async function listAllApproverConfig() {
  const approvalTypes = [...new Set(STEP_DEFS.filter((s) => s.type === "approval").map((s) => s.approvalType))];
  const out = {};
  for (const t of approvalTypes) {
    out[t] = await getConfiguredApprovers(t);
  }
  return out;
}

// ─── Access allowlist ───────────────────────────────────────────────────────

async function listAccessUsers() {
  return db
    .prepare(
      "SELECT au.user_id, u.name, u.email FROM npd_access_users au JOIN users u ON u.id = au.user_id ORDER BY u.name ASC"
    )
    .all();
}

async function grantAccess(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid user.");
  await db.prepare("INSERT OR IGNORE INTO npd_access_users (user_id) VALUES (?)").run(n);
  return listAccessUsers();
}

async function revokeAccess(userId) {
  await db.prepare("DELETE FROM npd_access_users WHERE user_id = ?").run(Number(userId));
  return listAccessUsers();
}

// ─── Delete access allowlist ────────────────────────────────────────────────
// Deleting a request is a separate, narrower permission from general NPD
// module access — full admins can always do it; anyone else needs to be
// explicitly listed here by an admin.

async function canDeleteRequest(user) {
  if (!user) return false;
  if (canOverride(user)) return true;
  const row = await db.prepare("SELECT 1 FROM npd_delete_access_users WHERE user_id = ?").get(user.id);
  return !!row;
}

async function listDeleteAccessUsers() {
  return db
    .prepare(
      "SELECT da.user_id, u.name, u.email FROM npd_delete_access_users da JOIN users u ON u.id = da.user_id ORDER BY u.name ASC"
    )
    .all();
}

async function grantDeleteAccess(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid user.");
  await db.prepare("INSERT OR IGNORE INTO npd_delete_access_users (user_id) VALUES (?)").run(n);
  return listDeleteAccessUsers();
}

async function revokeDeleteAccess(userId) {
  await db.prepare("DELETE FROM npd_delete_access_users WHERE user_id = ?").run(Number(userId));
  return listDeleteAccessUsers();
}

// ─── Activity log & notifications ──────────────────────────────────────────

async function logActivity({ requestId, stepId = null, user, action, oldStatus = null, newStatus = null, description }) {
  await db
    .prepare(
      `INSERT INTO npd_activity_log (request_id, step_id, user_id, user_name, action, old_status, new_status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(requestId, stepId, user?.id || null, user?.name || "System", action, oldStatus, newStatus, description);
}

async function notifyUser({ userId, requestId, stepId = null, kind, title, message }) {
  if (!userId) return;
  await db
    .prepare(
      `INSERT INTO npd_notifications (user_id, request_id, step_id, kind, title, message) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, requestId, stepId, kind, title, message || null);
}

async function notifyDepartment({ department, requestId, stepId, kind, title, message }) {
  const depts = (Array.isArray(department) ? department : [department]).filter(Boolean);
  if (!depts.length) return;
  const placeholders = depts.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT DISTINCT u.id FROM users u JOIN user_departments ud ON ud.user_id = u.id WHERE ud.department IN (${placeholders})`)
    .all(...depts);
  for (const r of rows) {
    await notifyUser({ userId: r.id, requestId, stepId, kind, title, message });
  }
}

async function notifyApprovers({ approvalType, requestId, stepId, kind, title, message }) {
  const approvers = await getConfiguredApprovers(approvalType);
  for (const a of approvers) {
    await notifyUser({ userId: a.user_id, requestId, stepId, kind, title, message });
  }
}

async function notifyStepAssignees({ requestId, stepId, stepDef }) {
  const request = await db
    .prepare("SELECT request_number, product_name, customer_name FROM npd_requests WHERE id = ?")
    .get(requestId);
  if (!request) return;
  const title = `Action needed: ${request.request_number}`;
  const message = `"${stepDef.name}" is ready for ${request.product_name} (${request.customer_name}).`;
  if (stepDef.type === "approval") {
    await notifyApprovers({ approvalType: stepDef.approvalType, requestId, stepId, kind: "approval_needed", title, message });
  } else if (stepDef.type === "multi_confirm") {
    for (const dept of stepDef.confirmations) {
      await notifyDepartment({ department: dept, requestId, stepId, kind: "approval_needed", title, message });
    }
  } else {
    await notifyDepartment({ department: stepDef.department, requestId, stepId, kind: "task_assigned", title, message });
  }
}

async function listNotifications(userId, { status = "active" } = {}) {
  return db
    .prepare("SELECT * FROM npd_notifications WHERE user_id = ? AND status = ? ORDER BY created_at DESC")
    .all(userId, status);
}

async function dismissNotification(id, userId) {
  await db
    .prepare("UPDATE npd_notifications SET status = 'dismissed', dismissed_at = ? WHERE id = ? AND user_id = ?")
    .run(new Date().toISOString(), Number(id), userId);
}

// ─── Request detail / listing ──────────────────────────────────────────────

async function getRequestDetail(requestId, viewerUser = null) {
  const request = await db
    .prepare(`SELECT r.*, u.name AS created_by_name FROM npd_requests r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`)
    .get(requestId);
  if (!request) return null;
  const rawSteps = await db
    .prepare(`SELECT s.*, u.name AS assigned_to_name FROM npd_steps s LEFT JOIN users u ON u.id = s.assigned_to WHERE s.request_id = ? ORDER BY s.step_number ASC`)
    .all(requestId);
  const approvals = await db.prepare(`SELECT * FROM npd_approvals WHERE request_id = ? ORDER BY action_at ASC, id ASC`).all(requestId);
  const attachments = await db
    .prepare(`SELECT a.*, u.name AS uploaded_by_name FROM npd_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.request_id = ? ORDER BY a.uploaded_at DESC`)
    .all(requestId);
  const comments = await db
    .prepare(`SELECT c.*, u.name AS created_by_name FROM npd_comments c LEFT JOIN users u ON u.id = c.created_by WHERE c.request_id = ? ORDER BY c.created_at ASC`)
    .all(requestId);
  const activity = await db.prepare(`SELECT * FROM npd_activity_log WHERE request_id = ? ORDER BY created_at ASC, id ASC`).all(requestId);

  // Lets the frontend show/hide the "submit" form correctly without
  // duplicating the department/assignee-list permission logic client-side.
  let viewerCanActCurrentStep = false;
  if (viewerUser) {
    const currentStepDef = getStepDef(request.current_step);
    if (currentStepDef && currentStepDef.type === "submit") {
      viewerCanActCurrentStep = await canActOnStep(viewerUser, currentStepDef);
    }
  }

  // A "skipped" step keeps its underlying status text (so every existing
  // status-based query keeps working) and is instead marked by skipped_at.
  // display_status is the one field the frontend should render — it folds
  // skipped_at in so nothing downstream has to re-derive it.
  //
  // Deliberately NOT keying off completed_at here: `status` is already set
  // to 'completed' by every code path that actually completes a step, so
  // status alone is authoritative. Checking completed_at first used to mean
  // a step that was completed once, then reopened for changes (status moved
  // on to 'changes_requested'), kept rendering as "Completed" forever
  // because completed_at was never cleared on some paths — the step looked
  // done and un-editable even though it genuinely needed to be redone.
  const steps = [];
  for (const s of rawSteps) {
    const isSkipped = !!s.skipped_at && !s.completed_at;
    const displayStatus = isSkipped ? "skipped" : s.status;
    const def = getStepDefByKey(s.step_key);
    let viewerCanAct = false;
    if (viewerUser && isSkipped && def && def.type === "submit") {
      viewerCanAct = await canActOnStep(viewerUser, def);
    }
    // Per-confirmation-area permission for multi-confirm steps, so the
    // frontend can show/hide each department's Confirm button without
    // duplicating the assignee-allowlist-vs-department logic client-side.
    let viewerConfirmable = null;
    if (viewerUser && def && def.type === "multi_confirm") {
      viewerConfirmable = {};
      for (const dept of def.confirmations) {
        viewerConfirmable[dept] = await canConfirmVerification(viewerUser, def, dept);
      }
    }
    steps.push({
      ...s,
      data: s.data_json ? safeJsonParse(s.data_json) : null,
      display_status: displayStatus,
      is_skipped: isSkipped,
      viewer_can_act: viewerCanAct,
      viewer_confirmable: viewerConfirmable,
    });
  }

  return {
    ...request,
    steps,
    approvals,
    attachments,
    comments,
    activity,
    viewer_can_act_current_step: viewerCanActCurrentStep,
  };
}

async function listRequests({ status } = {}) {
  let sql = `SELECT r.*, u.name AS created_by_name FROM npd_requests r LEFT JOIN users u ON u.id = r.created_by WHERE r.deleted_at IS NULL`;
  const params = [];
  if (status) {
    sql += " AND r.status = ?";
    params.push(status);
  }
  sql += " ORDER BY r.created_at DESC";
  return db.prepare(sql).all(...params);
}

// Soft delete — the request drops off the list immediately but the row (and
// its full activity log, approvals, attachments, comments) stays in the
// database rather than being destroyed, so nothing here is unrecoverable
// from the database side even though there's no "undo" button in the UI yet.
async function deleteRequest({ requestId, user }) {
  if (!(await canDeleteRequest(user))) throw httpError(403, "You do not have permission to delete NPD requests.");
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (request.deleted_at) throw httpError(400, "This request has already been deleted.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE npd_requests SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, user.id, now, requestId);
  await logActivity({
    requestId,
    user,
    action: "request_deleted",
    newStatus: "deleted",
    description: `${user.name} deleted request ${request.request_number}.`,
  });
  return { ok: true };
}

// ─── Workflow transitions ───────────────────────────────────────────────────

// A request only finalizes once every single step has actually been
// completed — a step that's merely skipped (not yet resolved) blocks final
// completion, even after step 13 is reached, so nothing gets forgotten.
async function finalizeIfAllStepsDone({ requestId, user }) {
  const steps = await db.prepare("SELECT status FROM npd_steps WHERE request_id = ?").all(requestId);
  const allCompleted = steps.length > 0 && steps.every((s) => s.status === "completed");
  if (!allCompleted) return false;
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE npd_requests SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?")
    .run(now, now, requestId);
  await logActivity({ requestId, user, action: "request_completed", newStatus: "completed", description: "All steps complete — request marked completed." });
  return true;
}

async function activateNextStep({ requestId, fromStepNumber, user }) {
  const nextNumber = Number(fromStepNumber) + 1;
  const nextDef = getStepDef(nextNumber);
  const now = new Date().toISOString();

  if (!nextDef) {
    const finalized = await finalizeIfAllStepsDone({ requestId, user });
    if (!finalized) {
      await db.prepare("UPDATE npd_requests SET status = 'in_progress', updated_at = ? WHERE id = ?").run(now, requestId);
      await logActivity({
        requestId,
        user,
        action: "request_awaiting_skipped_steps",
        newStatus: "in_progress",
        description: "Step 13 reached, but one or more earlier steps were skipped and still need to be completed before this request can close.",
      });
    }
    return;
  }

  const nextStep = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, nextNumber);
  await db.prepare("UPDATE npd_steps SET status = 'in_progress', started_at = ?, submitted_at = NULL, completed_at = NULL WHERE id = ?").run(now, nextStep.id);
  await db
    .prepare("UPDATE npd_requests SET current_step = ?, status = ?, updated_at = ? WHERE id = ?")
    .run(nextNumber, requestStatusForStep(nextDef), now, requestId);

  await logActivity({ requestId, stepId: nextStep.id, user, action: "step_activated", newStatus: "in_progress", description: `Step ${nextNumber} ("${nextDef.name}") is now active.` });
  await notifyStepAssignees({ requestId, stepId: nextStep.id, stepDef: nextDef });
}

async function createRequest({ user, body }) {
  const fields = {
    customer_name: String(body?.customer_name || "").trim(),
    customer_number: body?.customer_number ? String(body.customer_number).trim() : null,
    product_name: String(body?.product_name || "").trim(),
    product_description: body?.product_description ? String(body.product_description).trim() : null,
    plant: body?.plant ? String(body.plant).trim() : null,
    requested_launch_date: body?.requested_launch_date || null,
    estimated_volume: body?.estimated_volume ? String(body.estimated_volume).trim() : null,
    packaging_requirement: body?.packaging_requirement ? String(body.packaging_requirement).trim() : null,
    request_type: body?.request_type === "existing_product_modification" ? "existing_product_modification" : "new_product",
    customer_contact: body?.customer_contact ? String(body.customer_contact).trim() : null,
    general_comments: body?.general_comments ? String(body.general_comments).trim() : null,
  };
  if (!fields.customer_name) throw httpError(400, "Customer name is required.");
  if (!fields.product_name) throw httpError(400, "Product name is required.");

  const requestNumber = await generateRequestNumber();
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO npd_requests
        (request_number, customer_name, customer_number, product_name, product_description, sales_rep_id, plant,
         requested_launch_date, estimated_volume, packaging_requirement, request_type, customer_contact,
         general_comments, status, current_step, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 1, ?, ?, ?)`
    )
    .run(
      requestNumber,
      fields.customer_name,
      fields.customer_number,
      fields.product_name,
      fields.product_description,
      user.id,
      fields.plant,
      fields.requested_launch_date,
      fields.estimated_volume,
      fields.packaging_requirement,
      fields.request_type,
      fields.customer_contact,
      fields.general_comments,
      user.id,
      now,
      now
    );
  const requestId = result.lastInsertRowid;

  for (const def of STEP_DEFS) {
    const isFirst = def.number === 1;
    await db
      .prepare(
        `INSERT INTO npd_steps (request_id, step_number, step_key, step_name, responsible_department, status, data_json, started_at, submitted_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        requestId,
        def.number,
        def.key,
        def.name,
        Array.isArray(def.department) ? def.department.join(",") : def.department || null,
        isFirst ? "completed" : "locked",
        isFirst ? JSON.stringify(fields) : null,
        isFirst ? now : null,
        isFirst ? now : null,
        isFirst ? now : null
      );
  }

  const step1 = await db.prepare("SELECT id FROM npd_steps WHERE request_id = ? AND step_number = 1").get(requestId);
  await logActivity({
    requestId,
    stepId: step1.id,
    user,
    action: "request_created",
    newStatus: "completed",
    description: `${user.name} created request ${requestNumber} for ${fields.customer_name} — ${fields.product_name}.`,
  });

  await activateNextStep({ requestId, fromStepNumber: 1, user });
  return getRequestDetail(requestId, user);
}

async function submitStep({ requestId, stepNumber, user, data }) {
  const stepDef = getStepDef(stepNumber);
  if (!stepDef) throw httpError(400, "Invalid step.");
  if (stepDef.type !== "submit") throw httpError(400, "This step cannot be submitted directly.");

  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (CLOSED_REQUEST_STATUSES.includes(request.status)) throw httpError(400, "This request is closed.");

  const step = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, stepNumber);
  if (!step) throw httpError(404, "Step not found.");
  // A previously-skipped step can still be completed by its real owner even
  // though the workflow has already moved past it (current_step is ahead).
  const isSkippedResume = !!step.skipped_at && !step.completed_at;
  if (!isSkippedResume && Number(request.current_step) !== Number(stepNumber)) {
    throw httpError(400, "This step is not currently active.");
  }
  if (!["in_progress", "changes_requested", "rejected"].includes(step.status)) {
    throw httpError(400, "This step is not active.");
  }
  if (!(await canActOnStep(user, stepDef))) throw httpError(403, "You do not have permission to complete this step.");

  // Step 1 doubles as "edit the request" — its data_json IS the request's
  // core fields. Normally this only happens once, at creation (createRequest
  // writes npd_requests directly). But if it's later resubmitted — e.g. an
  // approver sent it back with "request changes" — this is the one place
  // that reactivates, so the edited fields need to land back on the actual
  // npd_requests row too, not just this step's data_json, or the rest of the
  // app (overview tab, dashboard list, page title) would keep showing the
  // stale original values. Validate before touching anything.
  let requestFieldsUpdate = null;
  if (stepDef.key === "new_product_request") {
    requestFieldsUpdate = {
      customer_name: String(data?.customer_name || "").trim(),
      customer_number: data?.customer_number ? String(data.customer_number).trim() : null,
      product_name: String(data?.product_name || "").trim(),
      product_description: data?.product_description ? String(data.product_description).trim() : null,
      plant: data?.plant ? String(data.plant).trim() : null,
      requested_launch_date: data?.requested_launch_date || null,
      estimated_volume: data?.estimated_volume ? String(data.estimated_volume).trim() : null,
      packaging_requirement: data?.packaging_requirement ? String(data.packaging_requirement).trim() : null,
      request_type: data?.request_type === "existing_product_modification" ? "existing_product_modification" : "new_product",
      customer_contact: data?.customer_contact ? String(data.customer_contact).trim() : null,
      general_comments: data?.general_comments ? String(data.general_comments).trim() : null,
    };
    if (!requestFieldsUpdate.customer_name) throw httpError(400, "Customer name is required.");
    if (!requestFieldsUpdate.product_name) throw httpError(400, "Product name is required.");
  }

  const now = new Date().toISOString();
  const isResubmit = step.status === "changes_requested" || step.status === "rejected";
  await db
    .prepare("UPDATE npd_steps SET status = 'completed', data_json = ?, assigned_to = ?, submitted_at = ?, completed_at = ? WHERE id = ?")
    .run(JSON.stringify(data || {}), user.id, now, now, step.id);

  if (requestFieldsUpdate) {
    await db
      .prepare(
        `UPDATE npd_requests SET customer_name = ?, customer_number = ?, product_name = ?, product_description = ?, plant = ?,
          requested_launch_date = ?, estimated_volume = ?, packaging_requirement = ?, request_type = ?, customer_contact = ?,
          general_comments = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        requestFieldsUpdate.customer_name,
        requestFieldsUpdate.customer_number,
        requestFieldsUpdate.product_name,
        requestFieldsUpdate.product_description,
        requestFieldsUpdate.plant,
        requestFieldsUpdate.requested_launch_date,
        requestFieldsUpdate.estimated_volume,
        requestFieldsUpdate.packaging_requirement,
        requestFieldsUpdate.request_type,
        requestFieldsUpdate.customer_contact,
        requestFieldsUpdate.general_comments,
        now,
        requestId
      );
  }

  await logActivity({
    requestId,
    stepId: step.id,
    user,
    action: isSkippedResume ? "step_completed_after_skip" : isResubmit ? "step_resubmitted" : "step_completed",
    oldStatus: step.status,
    newStatus: "completed",
    description: `${user.name} ${isSkippedResume ? "completed the previously-skipped" : isResubmit ? "resubmitted" : "completed"} "${stepDef.name}".`,
  });

  if (stepDef.key === "customer_approval" && data?.customer_decision === "rejected") {
    await db.prepare("UPDATE npd_requests SET status = 'customer_rejected', updated_at = ? WHERE id = ?").run(now, requestId);
    await logActivity({
      requestId,
      stepId: step.id,
      user,
      action: "customer_rejected",
      newStatus: "customer_rejected",
      description: `Customer did not approve. Workflow halted at "${stepDef.name}".`,
    });
    return getRequestDetail(requestId, user);
  }

  if (isSkippedResume) {
    await finalizeIfAllStepsDone({ requestId, user });
  } else {
    await activateNextStep({ requestId, fromStepNumber: stepNumber, user });
  }
  return getRequestDetail(requestId, user);
}

async function recordApproval({ requestId, stepNumber, user, action, comments }) {
  const stepDef = getStepDef(stepNumber);
  if (!stepDef || stepDef.type !== "approval") throw httpError(400, "This step is not an approval step.");
  if (!["approved", "rejected", "changes_requested"].includes(action)) throw httpError(400, "Invalid action.");

  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (CLOSED_REQUEST_STATUSES.includes(request.status)) throw httpError(400, "This request is closed.");

  const step = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, stepNumber);
  if (!step) throw httpError(404, "Step not found.");
  // A previously-skipped approval can still be voted on by its configured
  // approvers even though the workflow has already moved past it.
  const isSkippedResume = !!step.skipped_at && !step.completed_at;
  if (!isSkippedResume && Number(request.current_step) !== Number(stepNumber)) {
    throw httpError(400, "This step is not currently active.");
  }
  if (!["in_progress", "waiting_approval"].includes(step.status)) throw httpError(400, "This step is not active.");

  const isApprover = await isConfiguredApprover(stepDef.approvalType, user.id);
  if (!isApprover && !canOverride(user)) throw httpError(403, "You are not a configured approver for this step.");

  const already = await db
    .prepare(
      "SELECT id FROM npd_approvals WHERE step_id = ? AND approver_id = ? AND action_at >= ? AND action IN ('approved','rejected','changes_requested')"
    )
    .get(step.id, user.id, step.started_at);
  if (already) throw httpError(400, "You have already recorded a decision for this step.");

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO npd_approvals (request_id, step_id, approval_type, approver_id, approver_name, action, comments, action_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(requestId, step.id, stepDef.approvalType, user.id, user.name, action, comments || null, now);

  await logActivity({
    requestId,
    stepId: step.id,
    user,
    action: `approval_${action}`,
    description: `${user.name} recorded "${action}" on "${stepDef.name}".${comments ? ` Comment: ${comments}` : ""}`,
  });

  if (action === "rejected") {
    await db.prepare("UPDATE npd_requests SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, requestId);
    await db.prepare("UPDATE npd_steps SET status = 'rejected', skipped_at = NULL, skipped_by = NULL, skip_reason = NULL WHERE id = ?").run(step.id);
    await notifyUser({
      userId: request.created_by,
      requestId,
      stepId: step.id,
      kind: "request_rejected",
      title: `Rejected: ${request.request_number}`,
      message: `${user.name} rejected "${stepDef.name}".${comments ? ` ${comments}` : ""}`,
    });
    return getRequestDetail(requestId, user);
  }

  if (action === "changes_requested") {
    const targetStepNumber = Math.max(1, stepNumber - 1);
    const targetDef = getStepDef(targetStepNumber);
    await db.prepare("UPDATE npd_requests SET status = 'changes_requested', current_step = ?, updated_at = ? WHERE id = ?").run(targetStepNumber, now, requestId);
    await db.prepare("UPDATE npd_steps SET status = 'changes_requested', skipped_at = NULL, skipped_by = NULL, skip_reason = NULL WHERE id = ?").run(step.id);
    const targetStep = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, targetStepNumber);
    // Clear completed_at/submitted_at on the step being sent back — it was
    // already completed once (that's how the workflow got past it), so
    // without this its display_status would still read "completed" even
    // though it's actually waiting to be revised and resubmitted.
    await db
      .prepare("UPDATE npd_steps SET status = 'changes_requested', started_at = ?, submitted_at = NULL, completed_at = NULL WHERE id = ?")
      .run(now, targetStep.id);
    await logActivity({
      requestId,
      stepId: step.id,
      user,
      action: "changes_requested",
      newStatus: "changes_requested",
      description: `${user.name} requested changes on "${stepDef.name}"; sent back to "${targetDef.name}".${comments ? ` Comment: ${comments}` : ""}`,
    });
    await notifyStepAssignees({ requestId, stepId: targetStep.id, stepDef: targetDef });
    return getRequestDetail(requestId, user);
  }

  // action === "approved" — a single approval from any one configured approver advances the step.
  await db.prepare("UPDATE npd_steps SET status = 'completed', completed_at = ? WHERE id = ?").run(now, step.id);
  await logActivity({ requestId, stepId: step.id, user, action: "step_completed", newStatus: "completed", description: `${user.name} approved "${stepDef.name}".` });
  if (isSkippedResume) {
    await finalizeIfAllStepsDone({ requestId, user });
  } else {
    await activateNextStep({ requestId, fromStepNumber: stepNumber, user });
  }
  return getRequestDetail(requestId, user);
}

async function recordVerification({ requestId, stepNumber, user, confirmationKey, action, comments }) {
  const stepDef = getStepDef(stepNumber);
  if (!stepDef || stepDef.type !== "multi_confirm") throw httpError(400, "This step is not a multi-department verification step.");
  if (!stepDef.confirmations.includes(confirmationKey)) throw httpError(400, "Invalid confirmation area.");
  if (!["approved", "rejected"].includes(action)) throw httpError(400, "Invalid action.");

  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (CLOSED_REQUEST_STATUSES.includes(request.status)) throw httpError(400, "This request is closed.");
  if (!(await canConfirmVerification(user, stepDef, confirmationKey))) {
    throw httpError(403, `You are not allowed to confirm ${confirmationKey} for this step.`);
  }

  const step = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, stepNumber);
  if (!step) throw httpError(404, "Step not found.");
  // A previously-skipped verification can still be confirmed by its team
  // even though the workflow has already moved past it.
  const isSkippedResume = !!step.skipped_at && !step.completed_at;
  if (!isSkippedResume && Number(request.current_step) !== Number(stepNumber)) {
    throw httpError(400, "This step is not currently active.");
  }
  if (step.status !== "in_progress") throw httpError(400, "This step is not active.");

  const approvalType = `${stepDef.key}:${confirmationKey}`;
  const already = await db
    .prepare("SELECT id FROM npd_approvals WHERE step_id = ? AND approval_type = ? AND action_at >= ?")
    .get(step.id, approvalType, step.started_at);
  if (already) throw httpError(400, `${confirmationKey} has already recorded a decision for this step.`);

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO npd_approvals (request_id, step_id, approval_type, approver_id, approver_name, action, comments, action_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(requestId, step.id, approvalType, user.id, user.name, action, comments || null, now);

  await logActivity({
    requestId,
    stepId: step.id,
    user,
    action: `verification_${action}`,
    description: `${user.name} (${confirmationKey}) recorded "${action}" on "${stepDef.name}".${comments ? ` Comment: ${comments}` : ""}`,
  });

  if (action === "rejected") {
    await db.prepare("UPDATE npd_requests SET status = 'changes_requested', updated_at = ? WHERE id = ?").run(now, requestId);
    await db.prepare("UPDATE npd_steps SET status = 'changes_requested', skipped_at = NULL, skipped_by = NULL, skip_reason = NULL WHERE id = ?").run(step.id);
    await notifyUser({
      userId: request.created_by,
      requestId,
      stepId: step.id,
      kind: "changes_requested",
      title: `Changes requested: ${request.request_number}`,
      message: `${confirmationKey} flagged an issue on "${stepDef.name}".${comments ? ` ${comments}` : ""}`,
    });
    return getRequestDetail(requestId, user);
  }

  const approvedRows = await db
    .prepare("SELECT approval_type FROM npd_approvals WHERE step_id = ? AND action = 'approved' AND action_at >= ?")
    .all(step.id, step.started_at);
  const doneKeys = new Set(approvedRows.map((r) => r.approval_type.split(":")[1]));
  const allDone = stepDef.confirmations.every((c) => doneKeys.has(c));
  if (!allDone) return getRequestDetail(requestId, user);

  await db.prepare("UPDATE npd_steps SET status = 'completed', completed_at = ? WHERE id = ?").run(now, step.id);
  await logActivity({ requestId, stepId: step.id, user, action: "step_completed", newStatus: "completed", description: `All departments confirmed "${stepDef.name}".` });
  if (isSkippedResume) {
    await finalizeIfAllStepsDone({ requestId, user });
  } else {
    await activateNextStep({ requestId, fromStepNumber: stepNumber, user });
  }
  return getRequestDetail(requestId, user);
}

// Admin-only escape hatch: reopen a step (and reset every later step) when
// the workflow gets stuck or a mistake needs correcting outside the normal
// flow. Always logged with the reason for the audit trail.
async function reopenStep({ requestId, stepNumber, user, reason }) {
  if (!canOverride(user)) throw httpError(403, "Only NPD admins can reopen a step.");
  const stepDef = getStepDef(stepNumber);
  if (!stepDef) throw httpError(400, "Invalid step.");
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  const now = new Date().toISOString();

  await db
    .prepare(
      "UPDATE npd_steps SET status = 'locked', started_at = NULL, submitted_at = NULL, completed_at = NULL, skipped_at = NULL, skipped_by = NULL, skip_reason = NULL WHERE request_id = ? AND step_number > ?"
    )
    .run(requestId, stepNumber);
  await db
    .prepare(
      "UPDATE npd_steps SET status = 'in_progress', started_at = ?, submitted_at = NULL, completed_at = NULL, skipped_at = NULL, skipped_by = NULL, skip_reason = NULL WHERE request_id = ? AND step_number = ?"
    )
    .run(now, requestId, stepNumber);
  await db
    .prepare("UPDATE npd_requests SET status = ?, current_step = ?, updated_at = ? WHERE id = ?")
    .run(requestStatusForStep(stepDef), stepNumber, now, requestId);

  const step = await db.prepare("SELECT id FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, stepNumber);
  await logActivity({
    requestId,
    stepId: step.id,
    user,
    action: "step_reopened",
    newStatus: "in_progress",
    description: `${user.name} reopened "${stepDef.name}" (and reset all later steps).${reason ? ` Reason: ${reason}` : ""}`,
  });
  await notifyStepAssignees({ requestId, stepId: step.id, stepDef });
  return getRequestDetail(requestId, user);
}

// Lets whoever would normally act on (or approve) a step defer it for now so
// later steps aren't blocked. The step stays open — it shows as "skipped"
// until its real owner actually completes it — and the whole request can't
// reach "completed" until every skipped step is resolved.
async function skipStep({ requestId, stepNumber, user, reason }) {
  const stepDef = getStepDef(stepNumber);
  if (!stepDef) throw httpError(400, "Invalid step.");
  if (NON_SKIPPABLE_STEP_NUMBERS.has(stepDef.number)) {
    throw httpError(400, `"${stepDef.name}" cannot be skipped.`);
  }

  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (CLOSED_REQUEST_STATUSES.includes(request.status)) throw httpError(400, "This request is closed.");
  if (Number(request.current_step) !== Number(stepNumber)) throw httpError(400, "This step is not currently active.");
  if (!(await canSkipStep(user, stepDef))) throw httpError(403, "You do not have permission to skip this step.");

  const step = await db.prepare("SELECT * FROM npd_steps WHERE request_id = ? AND step_number = ?").get(requestId, stepNumber);
  const activeStatuses = stepDef.type === "submit" ? ["in_progress", "changes_requested", "rejected"] : ["in_progress", "waiting_approval"];
  if (!step || !activeStatuses.includes(step.status)) throw httpError(400, "This step is not active.");
  if (step.skipped_at) throw httpError(400, "This step has already been skipped.");

  const now = new Date().toISOString();
  const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;
  await db
    .prepare("UPDATE npd_steps SET skipped_at = ?, skipped_by = ?, skip_reason = ? WHERE id = ?")
    .run(now, user.id, cleanReason, step.id);

  await logActivity({
    requestId,
    stepId: step.id,
    user,
    action: "step_skipped",
    oldStatus: step.status,
    newStatus: "skipped",
    description: `${user.name} skipped "${stepDef.name}" for now — later steps can proceed, but it still needs to be completed.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
  });

  await activateNextStep({ requestId, fromStepNumber: stepNumber, user });
  return getRequestDetail(requestId, user);
}

async function cancelRequest({ requestId, user, reason }) {
  if (!canOverride(user)) throw httpError(403, "Only NPD admins can cancel a request.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE npd_requests SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, requestId);
  await logActivity({ requestId, user, action: "request_cancelled", newStatus: "cancelled", description: `${user.name} cancelled this request.${reason ? ` Reason: ${reason}` : ""}` });
  return getRequestDetail(requestId, user);
}

// ─── Comments / attachments ─────────────────────────────────────────────────

async function addComment({ requestId, stepId, user, comment }) {
  const c = String(comment || "").trim();
  if (!c) throw httpError(400, "Comment cannot be empty.");
  const result = await db.prepare("INSERT INTO npd_comments (request_id, step_id, comment, created_by) VALUES (?, ?, ?, ?)").run(requestId, stepId || null, c, user.id);
  await logActivity({ requestId, stepId: stepId || null, user, action: "comment_added", description: `${user.name} added a comment.` });
  return db
    .prepare("SELECT c.*, u.name AS created_by_name FROM npd_comments c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?")
    .get(result.lastInsertRowid);
}

async function addAttachment({ requestId, stepId, user, fileName, originalFileName, fileUrl, fileType }) {
  const result = await db
    .prepare(
      `INSERT INTO npd_attachments (request_id, step_id, file_name, original_file_name, file_url, file_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(requestId, stepId || null, fileName, originalFileName, fileUrl, fileType || null, user.id);
  await logActivity({ requestId, stepId: stepId || null, user, action: "attachment_added", description: `${user.name} uploaded "${originalFileName}".` });
  return db
    .prepare("SELECT a.*, u.name AS uploaded_by_name FROM npd_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = ?")
    .get(result.lastInsertRowid);
}

// ─── My Tasks / My Approvals ────────────────────────────────────────────────

async function listMyTasks(user) {
  const rows = await db
    .prepare(
      `SELECT s.*, r.request_number, r.product_name, r.customer_name, r.status AS request_status
       FROM npd_steps s JOIN npd_requests r ON r.id = s.request_id
       WHERE s.status IN ('in_progress', 'changes_requested', 'rejected') AND r.deleted_at IS NULL
       ORDER BY s.started_at ASC`
    )
    .all();
  const out = [];
  for (const row of rows) {
    const def = getStepDefByKey(row.step_key);
    if (!def || def.type !== "submit") continue;
    if (await canActOnStep(user, def)) out.push(row);
  }
  return out;
}

async function listMyApprovals(user) {
  const rows = await db
    .prepare(
      `SELECT s.*, r.request_number, r.product_name, r.customer_name, r.status AS request_status
       FROM npd_steps s JOIN npd_requests r ON r.id = s.request_id
       WHERE s.status IN ('in_progress','waiting_approval') AND r.deleted_at IS NULL
       ORDER BY s.started_at ASC`
    )
    .all();
  const out = [];
  for (const row of rows) {
    const def = getStepDefByKey(row.step_key);
    if (!def) continue;
    if (def.type === "approval") {
      if (canOverride(user) || (await isConfiguredApprover(def.approvalType, user.id))) {
        const already = await db
          .prepare("SELECT id FROM npd_approvals WHERE step_id = ? AND approver_id = ? AND action_at >= ? AND action IN ('approved','rejected','changes_requested')")
          .get(row.id, user.id, row.started_at);
        if (!already) out.push(row);
      }
    } else if (def.type === "multi_confirm") {
      for (const dept of def.confirmations) {
        if (await canConfirmVerification(user, def, dept)) {
          const approvalType = `${def.key}:${dept}`;
          const already = await db
            .prepare("SELECT id FROM npd_approvals WHERE step_id = ? AND approval_type = ? AND action_at >= ?")
            .get(row.id, approvalType, row.started_at);
          if (!already) out.push({ ...row, confirmation_area: dept });
        }
      }
    }
  }
  return out;
}

module.exports = {
  STEP_DEFS,
  NON_SKIPPABLE_STEP_NUMBERS,
  httpError,
  getStepDef,
  getStepDefByKey,
  canActOnStep,
  canSkipStep,
  canOverride,
  userHasDepartment,
  hasNpdAccess,
  isConfiguredApprover,
  getConfiguredApprovers,
  setApprovers,
  listAllApproverConfig,
  listAccessUsers,
  grantAccess,
  revokeAccess,
  canDeleteRequest,
  listDeleteAccessUsers,
  grantDeleteAccess,
  revokeDeleteAccess,
  getStepAssignees,
  setStepAssignees,
  listAllStepAssignees,
  createRequest,
  getRequestDetail,
  listRequests,
  submitStep,
  recordApproval,
  recordVerification,
  reopenStep,
  skipStep,
  deleteRequest,
  cancelRequest,
  addComment,
  addAttachment,
  listMyTasks,
  listMyApprovals,
  listNotifications,
  dismissNotification,
};
