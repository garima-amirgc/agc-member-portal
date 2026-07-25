const express = require("express");
const { authRequired } = require("../middleware/auth");
const itTickets = require("../services/itTickets.service");
const userDeptSvc = require("../services/userDepartments.service");
const ticketUpload = require("./upload.routes");
const { ROLES, canonicalRole } = require("../config/constants");
const { hasAdminGrant, ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const email = require("../services/email.service");

const router = express.Router();
router.use(authRequired);

router.get("/it-assignees", async (req, res) => {
  try {
    return res.json(await itTickets.listItAssignees());
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// IT staff only — list all portal users for "submit on behalf of" dropdown
router.get("/requester-users", async (req, res) => {
  try {
    const isFullAdmin = canonicalRole(req.user.role) === ROLES.ADMIN &&
      (req.user.adminGrants == null || (Array.isArray(req.user.adminGrants) && req.user.adminGrants.length === 0));
    const hasTicketVisibility = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.IT_TICKETS);
    const isITDept = await userDeptSvc.hasDepartment(req.user.id, "IT");
    if (!isFullAdmin && !hasTicketVisibility && !isITDept) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.json(await itTickets.listAllUsersForBehalfDropdown());
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
    const isFullAdmin = canonicalRole(req.user.role) === ROLES.ADMIN &&
      (req.user.adminGrants == null || (Array.isArray(req.user.adminGrants) && req.user.adminGrants.length === 0));
    const hasTicketVisibility = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.IT_TICKETS);
    const isITDept = await userDeptSvc.hasDepartment(req.user.id, "IT");
    const canSubmitOnBehalf = isFullAdmin || hasTicketVisibility || isITDept;

    const behalfOfUserId =
      canSubmitOnBehalf && req.body?.behalf_of_user_id
        ? Number(req.body.behalf_of_user_id)
        : null;

    const ticket = await itTickets.createTicketAndNotify(req.user.id, req.body, behalfOfUserId);
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
    const isITDept = await userDeptSvc.hasDepartment(req.user.id, "IT");
    if (isFullAdmin || hasTicketVisibility || isITDept) {
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

// ── Unread message counts ────────────────────────────────────────────────────
router.get("/unread-counts", async (req, res) => {
  try {
    return res.json(await itTickets.getUnreadCounts(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// ── Ticket Messages (chat thread) ───────────────────────────────────────────

async function canAccessTicketMessages(user, ticketId) {
  const isFullAdmin = canonicalRole(user.role) === ROLES.ADMIN &&
    (user.adminGrants == null || (Array.isArray(user.adminGrants) && user.adminGrants.length === 0));
  if (isFullAdmin || hasAdminGrant(user, ADMIN_GRANT_KEYS.IT_TICKETS)) return true;
  if (await userDeptSvc.hasDepartment(user.id, "IT")) return true;
  const ticket = await itTickets.getTicketById(ticketId);
  if (!ticket) return false;
  return Number(ticket.user_id) === Number(user.id) || Number(ticket.assignee_id) === Number(user.id);
}

router.get("/:id/messages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid ticket id" });
    if (!(await canAccessTicketMessages(req.user, id))) return res.status(403).json({ message: "Forbidden" });
    const msgs = await itTickets.getTicketMessages(id);
    // Mark messages as read for this user (fire-and-forget — don't block the response)
    itTickets.markMessagesRead(id, req.user.id).catch(() => {});
    return res.json(msgs);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message || "Server error" });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid ticket id" });
    if (!(await canAccessTicketMessages(req.user, id))) return res.status(403).json({ message: "Forbidden" });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "Message body cannot be empty" });
    const msg = await itTickets.postTicketMessage(id, req.user.id, body);

    // Notify the other party by email (fire-and-forget)
    try {
      const ticket = await itTickets.getTicketById(id);
      if (ticket) {
        const senderId = Number(req.user.id);
        const requesterId = Number(ticket.user_id);
        const assigneeId = Number(ticket.assignee_id);
        // If sender is the requester → notify assignee; otherwise → notify requester
        const isRequester = senderId === requesterId;
        const toEmail = isRequester ? ticket.assignee_email : ticket.user_email;
        const toName  = isRequester ? ticket.assignee_name  : ticket.user_name;
        if (toEmail) {
          await email.sendTicketMessageEmail({
            to: toEmail,
            recipientName: toName,
            senderName: req.user.name,
            ticketId: id,
            ticketTitle: ticket.title,
            messageBody: body,
          });
        }
      }
    } catch (emailErr) {
      console.error("[IT_TICKET] Message email notify failed:", emailErr?.message || emailErr);
    }

    return res.status(201).json(msg);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message || "Server error" });
  }
});

router.patch("/:id/messages/:msgId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const msgId = Number(req.params.msgId);
    if (!Number.isFinite(id) || id < 1 || !Number.isFinite(msgId) || msgId < 1)
      return res.status(400).json({ message: "Invalid id" });
    if (!(await canAccessTicketMessages(req.user, id)))
      return res.status(403).json({ message: "Forbidden" });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "Message body cannot be empty" });
    const updated = await itTickets.editTicketMessage(id, msgId, req.user.id, body);
    return res.json(updated);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message || "Server error" });
  }
});

router.delete("/:id/messages/:msgId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const msgId = Number(req.params.msgId);
    if (!Number.isFinite(id) || id < 1 || !Number.isFinite(msgId) || msgId < 1)
      return res.status(400).json({ message: "Invalid id" });
    if (!(await canAccessTicketMessages(req.user, id)))
      return res.status(403).json({ message: "Forbidden" });
    await itTickets.deleteTicketMessage(id, msgId, req.user.id);
    return res.status(204).end();
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
