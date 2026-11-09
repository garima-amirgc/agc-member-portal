const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
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

// ─── Requests — Gate 1 launch scorecard ────────────────────────────────────

router.get("/requests", async (req, res) => {
  try {
    res.json(await npd.listRequests());
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
    const request = await npd.getRequestDetail(id);
    if (!request) return res.status(404).json({ message: "Request not found." });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not load request.");
  }
});

router.put("/requests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const request = await npd.updateRequest({ requestId: id, user: req.user, body: req.body });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not update request.");
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

// ─── SLT review ─────────────────────────────────────────────────────────────

// Anyone with module access can see who's on the SLT roster, to pick from
// when submitting a request for review (listing it is not the same as
// managing it — that's the admin-gated /admin/slt-users below).
router.get("/slt-users", async (_req, res) => {
  try {
    res.json(await npd.listSltUsers());
  } catch (e) {
    handleError(res, e, "Could not load SLT list.");
  }
});

router.get("/my-pending-decisions", async (req, res) => {
  try {
    res.json(await npd.listMyPendingDecisions(req.user));
  } catch (e) {
    handleError(res, e, "Could not load pending decisions.");
  }
});

router.post("/requests/:id/submit-for-review", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const request = await npd.submitForReview({
      requestId: id,
      user: req.user,
      approverUserIds: req.body?.approver_user_ids,
    });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not submit for review.");
  }
});

router.post("/requests/:id/decision", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const request = await npd.recordDecision({ requestId: id, user: req.user, decision: req.body?.decision });
    res.json(request);
  } catch (e) {
    handleError(res, e, "Could not record decision.");
  }
});

// ─── Comments / attachments ─────────────────────────────────────────────────

router.post("/requests/:id/comments", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const comment = await npd.addComment({ requestId: id, user: req.user, comment: req.body?.comment });
    res.status(201).json(comment);
  } catch (e) {
    handleError(res, e, "Could not add comment.");
  }
});

router.post("/requests/:id/attachments", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { file_name, original_name, file_url, file_type } = req.body || {};
    if (!file_name || !file_url) return res.status(400).json({ message: "file_name and file_url are required." });
    const attachment = await npd.addAttachment({
      requestId: id,
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

router.get("/admin/slt-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.listSltUsers());
  } catch (e) {
    handleError(res, e, "Could not load SLT list.");
  }
});

router.post("/admin/slt-users", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.addSltUser(req.body?.user_id));
  } catch (e) {
    handleError(res, e, "Could not add SLT member.");
  }
});

router.delete("/admin/slt-users/:userId", requireAdminGrant(ADMIN_GRANT_KEYS.NPD), async (req, res) => {
  try {
    res.json(await npd.removeSltUser(req.params.userId));
  } catch (e) {
    handleError(res, e, "Could not remove SLT member.");
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
