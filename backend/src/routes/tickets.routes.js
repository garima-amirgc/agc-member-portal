const express = require("express");
const { authRequired } = require("../middleware/auth");
const itTickets = require("../services/itTickets.service");
const userDeptSvc = require("../services/userDepartments.service");
const ticketUpload = require("./upload.routes");

const router = express.Router();
router.use(authRequired);

router.get("/it-assignees", async (req, res) => {
  try {
    return res.json(await itTickets.listItAssignees());
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.get("/assigned-to-me", async (req, res) => {
  try {
    if (!(await userDeptSvc.hasDepartment(req.user.id, "IT"))) {
      return res.json([]);
    }
    return res.json(await itTickets.listTicketsAssignedToAssignee(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

/** Same handler as POST /upload/ticket-attachment — mounted here so the URL matches other /tickets/* API calls. */
router.post(
  "/attachments/upload",
  ticketUpload.ticketAttachmentUploadSingle,
  ticketUpload.handleTicketAttachmentUpload
);

router.post("/", async (req, res) => {
  try {
    const ticket = await itTickets.createTicketAndNotify(req.user.id, req.body);
    return res.status(201).json(ticket);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    if (await userDeptSvc.hasDepartment(req.user.id, "IT")) {
      return res.json(await itTickets.listAllTicketsForIT());
    }
    return res.json(await itTickets.listTicketsForUser(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const status = req.body?.status;
    const updated = await itTickets.updateTicketStatus(req.user.id, Number(req.params.id), status);
    return res.json(updated);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
