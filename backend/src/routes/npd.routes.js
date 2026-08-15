const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { DEPARTMENTS } = require("../config/constants");
const npd = require("../services/npdWorkflow.service");

const router = express.Router();

function handleError(res, e, fallbackMessage) {
  if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
  console.error("[npd]", e);
  return res.status(500).json({ message: fallbackMessage || "Something went wrong." });
}

async function requireNpdAccess(req, res, next) {
  try {
    const ok = await npd.hasNpdAccess(req.user);
    if (!ok) return res.status(403).json({ message: "You do not have access to New Product Development." });
    next();
  } catch (e) {
    console.error("[npd] access check:", e);
    res.status(500).json({ message: "Could not verify access." });
  }
}

router.use(authRequired, requireNpdAccess);

// ─── Meta ───────────────────────────────────────────────────────────────────

router.get("/meta", (req, res) => {
  res.json({
    steps: npd.STEP_DEFS.map((s) => ({
      number: s.number,
      key: s.key,
      name: s.name,
      department: s.department || null,
      type: s.type,
      approvalType: s.approvalType || null,
      confirmations: s.confirmations || null,
      skippable: !npd.NON_SKIPPABLE_STEP_NUMBERS.has(s.number),
    })),
    departments: DEPARTMENTS,
  });
});

// ─── Requests ───────────────────────────────────────────────────────────────

router.get("/requests", async (req, res) => {
  try {
    const rows = await npd.listRequests({ status: req.query.status || undefined });
    res.json(rows);
  } catch (e) {
    handleError(res, e, "Could not load requests.");
  }
});

router.post("/requests", async (req, res) => {
  try {
    const request = await npd.createRequest({ user: req.user, body: req.body });
    res.status(201).json(request);
  } catch (e) {
    handleError(res, e, "Could not create request.");
  }
});

router.get("/requests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const request = await npd.getRequestDetail(id, req.user);
    if (!request) return res.status(404).json({ message: "Request not found." });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not load request.");
  }
});

router.post("/requests/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const request = await npd.cancelRequest({ requestId: id, user: req.user, reason: req.body?.reason });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not cancel request.");
  }
});

router.delete("/requests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await npd.deleteRequest({ requestId: id, user: req.user });
    res.json(result);
  } catch (e) {
    handleError(res, e, "Could not delete request.");
  }
});

// ─── Step actions ───────────────────────────────────────────────────────────

router.post("/requests/:id/steps/:stepNumber/submit", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepNumber = Number(req.params.stepNumber);
    const request = await npd.submitStep({ requestId: id, stepNumber, user: req.user, data: req.body?.data || {} });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not submit step.");
  }
});

router.post("/requests/:id/steps/:stepNumber/decision", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepNumber = Number(req.params.stepNumber);
    const request = await npd.recordApproval({
      requestId: id,
      stepNumber,
      user: req.user,
      action: req.body?.action,
      comments: req.body?.comments,
    });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not record decision.");
  }
});

router.post("/requests/:id/steps/:stepNumber/verify", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepNumber = Number(req.params.stepNumber);
    const request = await npd.recordVerification({
      requestId: id,
      stepNumber,
      user: req.user,
      confirmationKey: req.body?.confirmation_area,
      action: req.body?.action,
      comments: req.body?.comments,
    });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not record verification.");
  }
});

router.post("/requests/:id/steps/:stepNumber/skip", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepNumber = Number(req.params.stepNumber);
    const request = await npd.skipStep({ requestId: id, stepNumber, user: req.user, reason: req.body?.reason });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not skip step.");
  }
});

router.post("/requests/:id/steps/:stepNumber/reopen", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepNumber = Number(req.params.stepNumber);
    const request = await npd.reopenStep({ requestId: id, stepNumber, user: req.user, reason: req.body?.reason });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not reopen step.");
  }
});

// ─── Comments / attachments ─────────────────────────────────────────────────

router.post("/requests/:id/comments", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const comment = await npd.addComment({
      requestId: id,
      stepId: req.body?.step_id ? Number(req.body.step_id) : null,
      user: req.user,
      comment: req.body?.comment,
    });
    res.status(201).json(comment);
  } catch (e) {
    handleError(res, e, "Could not add comment.");
  }
});

router.post("/requests/:id/attachments", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { file_name, original_name, file_url, file_type, step_id } = req.body || {};
    if (!file_name || !file_url) return res.status(400).json({ message: "file_name and file_url are required." });
    const attachment = await npd.addAttachment({
      requestId: id,
      stepId: step_id ? Number(step_id) : null,
      user: req.user,
      fileName: file_name,
      originalFileName: original_name || file_name,
      fileUrl: file_url,
      fileType: file_type || null,
    });
    res.status(201).json(attachment);
  } catch (e) {
    handleError(res, e, "Could not save attachment.");
  }
});

// ─── My Tasks / My Approvals / notifications ───────────────────────────────

router.get("/my-tasks", async (req, res) => {
  try {
    res.json(await npd.listMyTasks(req.user));
  } catch (e) {
    handleError(res, e, "Could not load your tasks.");
  }
});

router.get("/my-approvals", async (req, res) => {
  try {
    res.json(await npd.listMyApprovals(req.user));
  } catch (e) {
    handleError(res, e, "Could not load your approvals.");
  }
});

router.get("/notifications", async (req, res) => {
  try {
    res.json(await npd.listNotifications(req.user.id, { status: req.query.status || "active" }));
  } catch (e) {
    handleError(res, e, "Could not load notifications.");
  }
});

router.post("/notifications/:id/dismiss", async (req, res) => {
  try {
    await npd.dismissNotification(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, "Could not dismiss notification.");
  }
});

// ─── Admin configuration ────────────────────────────────────────────────────

router.get("/admin/access-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.listAccessUsers());
  } catch (e) {
    handleError(res, e, "Could not load access list.");
  }
});

router.post("/admin/access-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.grantAccess(req.body?.user_id));
  } catch (e) {
    handleError(res, e, "Could not grant access.");
  }
});

router.delete("/admin/access-users/:userId", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.revokeAccess(req.params.userId));
  } catch (e) {
    handleError(res, e, "Could not revoke access.");
  }
});

router.get("/admin/delete-access-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.listDeleteAccessUsers());
  } catch (e) {
    handleError(res, e, "Could not load delete access list.");
  }
});

router.post("/admin/delete-access-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.grantDeleteAccess(req.body?.user_id));
  } catch (e) {
    handleError(res, e, "Could not grant delete access.");
  }
});

router.delete("/admin/delete-access-users/:userId", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.revokeDeleteAccess(req.params.userId));
  } catch (e) {
    handleError(res, e, "Could not revoke delete access.");
  }
});

router.get("/admin/approvers", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.listAllApproverConfig());
  } catch (e) {
    handleError(res, e, "Could not load approver configuration.");
  }
});

router.get("/admin/step-assignees", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.listAllStepAssignees());
  } catch (e) {
    handleError(res, e, "Could not load step access configuration.");
  }
});

router.put("/admin/step-assignees/:stepKey", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.setStepAssignees(req.params.stepKey, req.body?.user_ids || []));
  } catch (e) {
    handleError(res, e, "Could not save step access.");
  }
});

router.put("/admin/approvers/:approvalType", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.setApprovers(req.params.approvalType, req.body?.user_ids || []));
  } catch (e) {
    handleError(res, e, "Could not save approvers.");
  }
});

router.get("/admin/assignable-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (_req, res) => {
  try {
    const rows = await db.prepare("SELECT id, name, email FROM users ORDER BY name ASC").all();
    res.json(rows);
  } catch (e) {
    handleError(res, e, "Could not load users.");
  }
});

module.exports = router;
