const express = require("express");
const { authRequired } = require("../middleware/auth");
const { supervisorRequired } = require("../middleware/supervisorRequired");
const leaveSvc = require("../services/leaveRequests.service");

const router = express.Router();
router.use(authRequired);

router.post("/", async (req, res) => {
  try {
    const out = await leaveSvc.submitLeaveRequest(req.user.id, req.body);
    return res.status(201).json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    return res.json(await leaveSvc.listLeaveRequestsForEmployee(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.get("/inbox", supervisorRequired, async (req, res) => {
  try {
    return res.json(await leaveSvc.listLeaveInboxForManager(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.patch("/:id", supervisorRequired, async (req, res) => {
  try {
    const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
