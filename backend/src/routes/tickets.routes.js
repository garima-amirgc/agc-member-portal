const express = require("express");
const { authRequired } = require("../middleware/auth");
const itTickets = require("../services/itTickets.service");
const userDeptSvc = require("../services/userDepartments.service");
const ticketUpload = require("./upload.routes");
const { ROLES, canonicalRole } = require("../config/constants");
const { hasAdminGrant, ADMIN_GRANT_KEYS } = require("../config/adminGrants");

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
    const isFullAdmin = canonicalRole(req.user.role) === ROLES.ADMIN &&
      (req.user.adminGrants == null || (Array.isArray(req.user.adminGrants) && req.user.adminGrants.length === 0));
    const hasTicketVisibility = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.IT_TICKETS);
    if (isFullAdmin || hasTicketVisibility) {
      return res.json(await itTickets.listAllTicketsForIT());
    }
    return res.json(await itTickets.listTicketsForUser(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await itTickets.deleteTicket(req.user, Number(req.params.id));
    return res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (body.status !== undefined && body.title === undefined && body.description === undefined) {
      const updated = await itTickets.updateTicketStatus(req.user.id, id, body.status);
      return res.json(updated);
    }
    const updated = await itTickets.updateTicketByOwner(req.user, id, body);
    return res.json(updated);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
