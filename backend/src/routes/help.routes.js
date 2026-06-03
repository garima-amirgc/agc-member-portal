const express = require("express");
const { authRequired } = require("../middleware/auth");
const { getHelpContacts, getHelpRecipientEmails } = require("../config/helpContacts");
const emailSvc = require("../services/email.service");

const router = express.Router();
router.use(authRequired);

router.get("/contacts", (_req, res) => {
  const contacts = getHelpContacts().map(({ id, name, role, email }) => ({
    id,
    name,
    role,
    email: email || null,
  }));
  return res.json({ contacts });
});

router.post("/report", async (req, res) => {
  try {
    const category = String(req.body?.category || "").trim().slice(0, 80);
    const subject = String(req.body?.subject || "").trim().slice(0, 200);
    const message = String(req.body?.message || "").trim().slice(0, 8000);
    if (!category) return res.status(400).json({ message: "Category is required." });
    if (!subject) return res.status(400).json({ message: "Subject is required." });
    if (!message) return res.status(400).json({ message: "Message is required." });

    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
          .slice(0, 3)
          .map((a) => ({
            name: String(a?.name || a?.original_name || "Attachment").trim().slice(0, 240),
            url: String(a?.url || a?.file_url || "").trim().slice(0, 2000),
          }))
          .filter((a) => a.url)
      : [];

    const recipients = getHelpRecipientEmails();
    if (recipients.length === 0) {
      return res.status(503).json({
        message: "Help contacts are not configured yet. Ask an administrator to set HELP_GARIMA_EMAIL and HELP_ASHHAR_EMAIL.",
      });
    }

    const out = await emailSvc.sendHelpReportEmail({
      to: recipients,
      submitterName: req.user?.name || "",
      submitterEmail: req.user?.email || "",
      submitterRole: req.user?.role || "",
      submitterDepartment: req.user?.department || "",
      category,
      subject,
      message,
      attachments,
    });

    if (out.skipped) {
      return res.status(503).json({
        message: "Email is not configured on the server. Your message could not be sent — contact Garima or Ashhar directly.",
      });
    }

    return res.status(201).json({ ok: true, message: "Your message was sent." });
  } catch (e) {
    console.error("[help] POST /report:", e);
    return res.status(500).json({ message: "Could not send your message. Please try again later." });
  }
});

module.exports = router;
