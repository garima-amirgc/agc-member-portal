const nodemailer = require("nodemailer");

const APP_MAIL_BRAND = "AGC Member Portal";

const EMAIL_TEMPLATE_VERSION = "20260605-email-v8";

const EMAIL_HEADER_BG = "#0B3EAF";

const EMAIL_FROM_NAME = String(process.env.EMAIL_FROM_NAME || "AGC Member Portal").trim();

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getEmailLogoUrl() {
  const explicit = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (explicit) return explicit;

  const spacesBase = String(process.env.DO_SPACES_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (spacesBase) {
    return `${spacesBase}/branding/amir-group-logo.png?v=8`;
  }

  const base = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/amir-group-logo.png?v=8`;
}

function emailShell({ title, preheader, bodyHtml }) {
  const logo = getEmailLogoUrl();
  const headerCellAttrs = logo
    ? `align="center" style="padding:22px 24px;background:${EMAIL_HEADER_BG};text-align:center;border-bottom:1px solid #082d82;"`
    : 'style="padding:24px 28px 8px 28px;border-bottom:1px solid #eef2f6;"';
  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" width="220" height="auto" alt="AMIR Group of Companies" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:220px;width:100%;height:auto;" />`
    : `<div style="font-size:20px;font-weight:700;letter-spacing:0.02em;color:#0B3EAF;">${escapeHtml(APP_MAIL_BRAND)}</div>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(
    preheader || ""
  )}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <tr>
            <td ${headerCellAttrs}>
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:Segoe UI, Arial, sans-serif;color:#1c1d1f;line-height:1.55;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;font-family:Segoe UI, Arial, sans-serif;color:#5c5f66;font-size:12px;line-height:1.5;">
              <hr style="border:none;border-top:1px solid #e6eaef;margin:20px 0 16px 0;" />
              <p style="margin:0;">This message was sent by <strong>${escapeHtml(APP_MAIL_BRAND)}</strong>.</p>
              <p style="margin:8px 0 0 0;">If you did not expect this email, you can ignore it or contact your administrator.</p>
            </td>
          </tr>
        </table>
        <p style="font-family:Segoe UI, Arial, sans-serif;font-size:11px;color:#8a8f96;margin:16px 8px 0 8px;max-width:600px;">
          AMIR Group — internal member portal · ${escapeHtml(EMAIL_TEMPLATE_VERSION)}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function cleanEnvValue(raw) {
  const s = String(raw ?? "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function smtpConfig() {
  return {
    host: cleanEnvValue(process.env.SMTP_HOST),
    user: cleanEnvValue(process.env.SMTP_USER),
    pass: cleanEnvValue(process.env.SMTP_PASS),
    from: cleanEnvValue(process.env.EMAIL_FROM),
  };
}

const SMTP_NOT_CONFIGURED_MSG =
  "SMTP is not configured on the API service. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM (Render → Web Service → Environment).";

function isEmailConfigured() {
  const { host, user, pass, from } = smtpConfig();
  return !!(host && user && pass && from);
}

let transporter;

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    const { host, user, pass } = smtpConfig();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === "true";
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
      },
      ...(process.env.SMTP_REQUIRE_TLS === "true" ? { requireTLS: true } : {}),
      ...(process.env.SMTP_DEBUG === "1" || process.env.SMTP_DEBUG === "true" ? { debug: true } : {}),
    });
  }
  return transporter;
}

function resetTransporter() {
  transporter = null;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(
      "[EMAIL] Not configured: set SMTP_HOST, SMTP_PORT (optional), SMTP_USER, SMTP_PASS, EMAIL_FROM in .env"
    );
    return { skipped: true, reason: SMTP_NOT_CONFIGURED_MSG };
  }

  const { from: rawFrom } = smtpConfig();
  const from = rawFrom.includes("<") ? rawFrom : EMAIL_FROM_NAME ? `${EMAIL_FROM_NAME} <${rawFrom}>` : rawFrom;

  const info = await t.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
  console.log(`[EMAIL] Sent "${subject}" to ${to}${info.messageId ? ` (${info.messageId})` : ""}`);
  return { sent: true, messageId: info.messageId };
}

async function verifySmtpConnection() {
  const t = getTransporter();
  if (!t) {
    console.log("[EMAIL] SMTP not configured — password reset and invite mail will be skipped.");
    return false;
  }
  try {
    await t.verify();
    console.log(`[EMAIL] SMTP connection verified (${smtpConfig().host})`);
    return true;
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 300);
    console.error("[EMAIL] SMTP verify failed:", msg);
    return false;
  }
}

async function sendManagerCourseCompletionEmail({
  managerEmail,
  managerName,
  employeeName,
  employeeEmail,
  courseTitle,
}) {
  if (!managerEmail) return { skipped: true };

  const subject = `Course completed: ${employeeName} finished "${courseTitle}"`;
  const text = [
    `Hello${managerName ? ` ${managerName}` : ""},`,
    "",
    `${employeeName} (${employeeEmail || "no email on file"}) has completed the course:`,
    `  ${courseTitle}`,
    "",
    `Time: ${new Date().toISOString()}`,
    "",
    `This message was sent by ${APP_MAIL_BRAND}.`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #1c1d1f;">
  <p>Hello${managerName ? ` ${escapeHtml(managerName)}` : ""},</p>
  <p><strong>${escapeHtml(employeeName)}</strong> (${escapeHtml(employeeEmail || "—")}) has <strong>completed</strong> the following course:</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #f7f9fa; border-left: 4px solid #5624d0;">
    ${escapeHtml(courseTitle)}
  </p>
  <p style="font-size: 12px; color: #6a6f73;">${escapeHtml(new Date().toLocaleString())}</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #6a6f73;">${APP_MAIL_BRAND} — automated notification</p>
</body>
</html>`;

  return sendMail({ to: managerEmail, subject, text, html });
}

async function sendEmployeeAllTrainingCompleteEmail({ employeeEmail, employeeName, courseCount }) {
  if (!employeeEmail) return { skipped: true };

  const subject = "Congratulations — all assigned training complete";
  const text = [
    `Hello${employeeName ? ` ${employeeName}` : ""},`,
    "",
    `You have completed all ${courseCount} assigned course${courseCount === 1 ? "" : "s"} on ${APP_MAIL_BRAND}.`,
    "",
    "Great work staying current with your training requirements.",
    "",
    `This message was sent by ${APP_MAIL_BRAND}.`,
  ].join("\n");

  const bodyHtml = `
  <p>Hello${employeeName ? ` ${escapeHtml(employeeName)}` : ""},</p>
  <p><strong>Congratulations!</strong> You have completed all <strong>${escapeHtml(String(courseCount))}</strong> assigned course${courseCount === 1 ? "" : "s"}.</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #eef8e8; border-left: 4px solid #A7D344;">
    Your training record is fully up to date. Thank you for your commitment to learning and compliance.
  </p>
  <p style="font-size: 12px; color: #6a6f73;">${escapeHtml(new Date().toLocaleString())}</p>`;

  const html = emailShell({
    title: subject,
    preheader: "You finished all assigned training",
    bodyHtml,
  });

  return sendMail({ to: employeeEmail, subject, text, html });
}

async function sendManagerAllTrainingCompleteEmail({
  managerEmail,
  managerName,
  employeeName,
  employeeEmail,
  courseCount,
}) {
  if (!managerEmail) return { skipped: true };

  const subject = `All training complete: ${employeeName}`;
  const text = [
    `Hello${managerName ? ` ${managerName}` : ""},`,
    "",
    `${employeeName} (${employeeEmail || "no email on file"}) has completed all ${courseCount} assigned course${courseCount === 1 ? "" : "s"}.`,
    "",
    "You can review their progress on the manager dashboard in the member portal.",
    "",
    `This message was sent by ${APP_MAIL_BRAND}.`,
  ].join("\n");

  const bodyHtml = `
  <p>Hello${managerName ? ` ${escapeHtml(managerName)}` : ""},</p>
  <p><strong>${escapeHtml(employeeName)}</strong> (${escapeHtml(employeeEmail || "—")}) has <strong>completed all assigned training</strong> (${escapeHtml(String(courseCount))} course${courseCount === 1 ? "" : "s"}).</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #f7f9fa; border-left: 4px solid #0B3EAF;">
    View their progress on the manager dashboard in ${escapeHtml(APP_MAIL_BRAND)}.
  </p>
  <p style="font-size: 12px; color: #6a6f73;">${escapeHtml(new Date().toLocaleString())}</p>`;

  const html = emailShell({
    title: subject,
    preheader: `${employeeName} finished all assigned training`,
    bodyHtml,
  });

  return sendMail({ to: managerEmail, subject, text, html });
}

async function sendITTicketCreatedEmail({
  to,
  itName,
  assigneeName,
  creatorName,
  creatorEmail,
  creatorDepartment,
  ticketId,
  title,
  description,
  priority,
  attachments = [],
}) {
  if (!to) return { skipped: true };

  const priorityLabel = String(priority || "medium").trim().toUpperCase();

  const attLines =
    Array.isArray(attachments) && attachments.length > 0
      ? [
          "Attachments:",
          ...attachments.map((a, i) => {
            const label = a?.name || `File ${i + 1}`;
            const url = a?.url || "";
            return url ? `  - ${label}: ${url}` : "";
          }),
          "",
        ].filter(Boolean)
      : [];

  const attHtml =
    Array.isArray(attachments) && attachments.length > 0
      ? `<p><strong>Attachments:</strong></p><ul style="margin: 8px 0; padding-left: 20px;">${attachments
          .map((a) => {
            const url = String(a?.url || "").trim();
            const label = escapeHtml(String(a?.name || "File"));
            if (!url) return "";
            return `<li><a href="${escapeHtml(url)}">${label}</a></li>`;
          })
          .filter(Boolean)
          .join("")}</ul>`
      : "";

  const subject = `[AGC IT] New ticket #${ticketId}: ${title}`;
  const text = [
    `Hello${itName ? ` ${itName}` : ""},`,
    "",
    `A new IT ticket was submitted.`,
    "",
    `Ticket #${ticketId}: ${title}`,
    `Priority: ${priorityLabel}`,
    assigneeName ? `Assigned to: ${assigneeName}` : "",
    `From: ${creatorName || "—"} (${creatorEmail || "—"})`,
    `Department: ${creatorDepartment || "—"}`,
    "",
    description ? `Details:\n${description}` : "(No additional details)",
    "",
    ...attLines,
    `Submitted: ${new Date().toISOString()}`,
    "",
    `${APP_MAIL_BRAND} — IT ticketing`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #0a0a0a;">
  <p>Hello${itName ? ` ${escapeHtml(itName)}` : ""},</p>
  <p><strong>New IT ticket</strong> was raised in ${escapeHtml(APP_MAIL_BRAND)}.</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #eef2fb; border-left: 4px solid #0b3eaf;">
    <strong>#${escapeHtml(String(ticketId))}</strong> — ${escapeHtml(title)}
  </p>
  <p><strong>Priority:</strong> ${escapeHtml(priorityLabel)}</p>
  ${assigneeName ? `<p><strong>Assigned to:</strong> ${escapeHtml(assigneeName)}</p>` : ""}
  <p><strong>From:</strong> ${escapeHtml(creatorName || "—")} (${escapeHtml(creatorEmail || "—")})<br/>
     <strong>Department:</strong> ${escapeHtml(creatorDepartment || "—")}</p>
  ${description ? `<p style="white-space: pre-wrap;">${escapeHtml(description)}</p>` : ""}
  ${attHtml}
  <p style="font-size: 12px; color: #5c5f66;">${escapeHtml(new Date().toLocaleString())}</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #5c5f66;">${APP_MAIL_BRAND} — automated IT notification</p>
</body>
</html>`;

  return sendMail({ to, subject, text, html });
}

async function sendITTicketUpdatedEmail({
  to,
  recipientName,
  editorName,
  assigneeName,
  creatorName,
  creatorEmail,
  creatorDepartment,
  ticketId,
  title,
  description,
  priority,
  attachments = [],
}) {
  if (!to) return { skipped: true };

  const priorityLabel = String(priority || "medium").trim().toUpperCase();

  const attLines =
    Array.isArray(attachments) && attachments.length > 0
      ? [
          "Attachments:",
          ...attachments.map((a, i) => {
            const label = a?.name || `File ${i + 1}`;
            const url = a?.url || "";
            return url ? `  - ${label}: ${url}` : "";
          }),
          "",
        ].filter(Boolean)
      : [];

  const attHtml =
    Array.isArray(attachments) && attachments.length > 0
      ? `<p><strong>Attachments:</strong></p><ul style="margin: 8px 0; padding-left: 20px;">${attachments
          .map((a) => {
            const url = String(a?.url || "").trim();
            const label = escapeHtml(String(a?.name || "File"));
            if (!url) return "";
            return `<li><a href="${escapeHtml(url)}">${label}</a></li>`;
          })
          .filter(Boolean)
          .join("")}</ul>`
      : "";

  const subject = `[AGC IT] Ticket #${ticketId} updated: ${title}`;
  const text = [
    `Hello${recipientName ? ` ${recipientName}` : ""},`,
    "",
    `An IT ticket was updated.`,
    editorName ? `Updated by: ${editorName}` : "",
    "",
    `Ticket #${ticketId}: ${title}`,
    `Priority: ${priorityLabel}`,
    assigneeName ? `Assigned to: ${assigneeName}` : "",
    `From: ${creatorName || "—"} (${creatorEmail || "—"})`,
    `Department: ${creatorDepartment || "—"}`,
    "",
    description ? `Details:\n${description}` : "(No additional details)",
    "",
    ...attLines,
    `Updated: ${new Date().toISOString()}`,
    "",
    `${APP_MAIL_BRAND} — IT ticketing`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #0a0a0a;">
  <p>Hello${recipientName ? ` ${escapeHtml(recipientName)}` : ""},</p>
  <p><strong>An IT ticket was updated</strong> in ${escapeHtml(APP_MAIL_BRAND)}.</p>
  ${editorName ? `<p><strong>Updated by:</strong> ${escapeHtml(editorName)}</p>` : ""}
  <p style="margin: 16px 0; padding: 12px 16px; background: #fff8e8; border-left: 4px solid #f59e0b;">
    <strong>#${escapeHtml(String(ticketId))}</strong> — ${escapeHtml(title)}
  </p>
  <p><strong>Priority:</strong> ${escapeHtml(priorityLabel)}</p>
  ${assigneeName ? `<p><strong>Assigned to:</strong> ${escapeHtml(assigneeName)}</p>` : ""}
  <p><strong>From:</strong> ${escapeHtml(creatorName || "—")} (${escapeHtml(creatorEmail || "—")})<br/>
     <strong>Department:</strong> ${escapeHtml(creatorDepartment || "—")}</p>
  ${description ? `<p style="white-space: pre-wrap;">${escapeHtml(description)}</p>` : ""}
  ${attHtml}
  <p style="font-size: 12px; color: #5c5f66;">${escapeHtml(new Date().toLocaleString())}</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #5c5f66;">${APP_MAIL_BRAND} — automated IT notification</p>
</body>
</html>`;

  return sendMail({ to, subject, text, html });
}

async function sendITTicketResolvedEmail({
  to,
  creatorName,
  creatorEmail,
  itName,
  assigneeName,
  ticketId,
  title,
  description,
}) {
  if (!to) return { skipped: true };

  const subject = `[AGC IT] Ticket #${ticketId} completed: ${title}`;
  const text = [
    `Hello${creatorName ? ` ${creatorName}` : ""},`,
    "",
    `Your IT ticket has been marked completed.`,
    "",
    `Ticket #${ticketId}: ${title}`,
    assigneeName ? `Resolved by: ${assigneeName}` : itName ? `Resolved by: ${itName}` : "",
    creatorEmail ? `From: ${creatorEmail}` : "",
    description ? `Details:\n${description}` : "",
    "",
    `Completed: ${new Date().toISOString()}`,
    "",
    `${APP_MAIL_BRAND} — IT ticketing`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #0a0a0a;">
  <p>Hello${creatorName ? ` ${escapeHtml(creatorName)}` : ""},</p>
  <p><strong>Your IT ticket was completed</strong> in ${escapeHtml(APP_MAIL_BRAND)}.</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #eff8f2; border-left: 4px solid #22c55e;">
    <strong>#${escapeHtml(String(ticketId))}</strong> — ${escapeHtml(title)}
  </p>
  ${description ? `<p style="white-space: pre-wrap;">${escapeHtml(description)}</p>` : ""}
  ${assigneeName ? `<p><strong>Resolved by:</strong> ${escapeHtml(assigneeName)}</p>` : ""}
  <p style="font-size: 12px; color: #5c5f66;">${escapeHtml(new Date().toLocaleString())}</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #5c5f66;">${APP_MAIL_BRAND} — automated IT notification</p>
</body>
</html>`;

  return sendMail({ to, subject, text, html });
}

async function sendAccountInviteEmail({ to, name, setupUrl, validDays }) {
  if (!to) return { skipped: true, reason: "Missing recipient email address." };
  const subject = `Set up your ${APP_MAIL_BRAND} account`;
  const rawUrl = String(setupUrl || "").trim();
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    `Your administrator has created an ${APP_MAIL_BRAND} account for you.`,
    "Use the link below to choose a password and activate your access:",
    "",
    rawUrl,
    "",
    `This link expires in about ${validDays ?? 7} days.`,
    "",
    "If you did not expect this message, you can ignore it.",
    "",
    APP_MAIL_BRAND,
  ].join("\n");

  const link = escapeHtml(rawUrl);
  const bodyHtml = `
  <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Welcome${name ? `, ${escapeHtml(name)}` : ""}</p>
  <p style="margin:0 0 16px 0;">Your administrator has created a <strong>${escapeHtml(APP_MAIL_BRAND)}</strong> account for you. Click the button below to choose a password and activate your access.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center" bgcolor="#0B3EAF" style="border-radius:8px;">
        <a href="${link}" style="display:inline-block;padding:14px 22px;font-family:Segoe UI, Arial, sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Set up your password</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 8px 0;font-size:13px;color:#5c5f66;">If the button does not work, copy and paste this link into your browser:</p>
  <p style="margin:0 0 20px 0;font-size:13px;color:#0B3EAF;word-break:break-all;">${link}</p>
  <p style="margin:0;font-size:12px;color:#5c5f66;">For your security, this link expires in about <strong>${validDays ?? 7}</strong> days.</p>`;

  const html = emailShell({
    title: subject,
    preheader: `Choose a password to activate your ${APP_MAIL_BRAND} account.`,
    bodyHtml,
  });

  const out = await sendMail({ to, subject, text, html });
  if (out.skipped) {
    console.warn("[EMAIL] Invite email not sent —", out.reason || SMTP_NOT_CONFIGURED_MSG);
    return { skipped: true, reason: out.reason || SMTP_NOT_CONFIGURED_MSG };
  }
  console.log("[EMAIL] Invite email sent to:", to);
  return out;
}

async function deliverAccountInviteEmail({ to, name, setupUrl, validDays }) {
  if (!to) {
    return { email_sent: false, email_error: "Missing recipient email address." };
  }
  if (!isEmailConfigured()) {
    return { email_sent: false, email_error: SMTP_NOT_CONFIGURED_MSG };
  }
  try {
    const mail = await sendAccountInviteEmail({ to, name, setupUrl, validDays });
    if (mail.sent) return { email_sent: true, messageId: mail.messageId };
    if (mail.skipped) {
      return { email_sent: false, email_error: mail.reason || SMTP_NOT_CONFIGURED_MSG };
    }
    return { email_sent: false, email_error: mail.reason || SMTP_NOT_CONFIGURED_MSG };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 300);
    console.error("[EMAIL] Invite delivery failed for", to, msg);
    return { email_sent: false, email_error: msg };
  }
}

async function sendPasswordResetEmail({ to, name, resetUrl, validMinutes }) {
  if (!to) {
    return { email_sent: false, email_error: "Missing recipient email address." };
  }
  if (!isEmailConfigured()) {
    return { email_sent: false, email_error: SMTP_NOT_CONFIGURED_MSG };
  }
  const mins = validMinutes ?? 60;
  const subject = `Reset your ${APP_MAIL_BRAND} password`;
  const rawUrl = String(resetUrl || "").trim();
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    `We received a request to reset your ${APP_MAIL_BRAND} password.`,
    "Open the link below to choose a new password:",
    "",
    rawUrl,
    "",
    `This link expires in about ${mins} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    APP_MAIL_BRAND,
  ].join("\n");

  const link = escapeHtml(rawUrl);
  const bodyHtml = `
  <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Password reset</p>
  <p style="margin:0 0 16px 0;">Hello${name ? ` ${escapeHtml(name)}` : ""},</p>
  <p style="margin:0 0 16px 0;">We received a request to reset your <strong>${escapeHtml(APP_MAIL_BRAND)}</strong> password. If you made this request, use the button below to choose a new password.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center" bgcolor="#0B3EAF" style="border-radius:8px;">
        <a href="${link}" style="display:inline-block;padding:14px 22px;font-family:Segoe UI, Arial, sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Reset password</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 8px 0;font-size:13px;color:#5c5f66;">If the button does not work, copy and paste this link into your browser:</p>
  <p style="margin:0 0 20px 0;font-size:13px;color:#0B3EAF;word-break:break-all;">${link}</p>
  <p style="margin:0;font-size:12px;color:#5c5f66;">This link expires in about <strong>${mins}</strong> minutes. If you did not request a reset, you can ignore this message.</p>`;

  const html = emailShell({
    title: subject,
    preheader: `Reset your ${APP_MAIL_BRAND} password using the secure link below.`,
    bodyHtml,
  });

  try {
    const mail = await sendMail({ to, subject, text, html });
    if (mail.sent) return { email_sent: true, messageId: mail.messageId };
    return { email_sent: false, email_error: mail.reason || SMTP_NOT_CONFIGURED_MSG };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 300);
    console.error("[EMAIL] Password reset delivery failed for", to, msg);
    return { email_sent: false, email_error: msg };
  }
}

async function sendHelpReportEmail({
  to,
  submitterName,
  submitterEmail,
  submitterRole,
  submitterDepartment,
  category,
  subject,
  message,
  attachments = [],
}) {
  const list = Array.isArray(to) ? to.filter(Boolean) : to ? [to] : [];
  if (list.length === 0) return { skipped: true };

  const catLabel = String(category || "").trim() || "General";
  const mailSubject = `[${APP_MAIL_BRAND}] Help request: ${subject}`;

  const attLines =
    Array.isArray(attachments) && attachments.length > 0
      ? [
          "Attachments:",
          ...attachments.map((a, i) => {
            const label = a?.name || `File ${i + 1}`;
            const url = a?.url || "";
            return url ? `  - ${label}: ${url}` : "";
          }),
          "",
        ].filter(Boolean)
      : [];

  const attHtml =
    Array.isArray(attachments) && attachments.length > 0
      ? `<p><strong>Attachments:</strong></p><ul style="margin: 8px 0; padding-left: 20px;">${attachments
          .map((a) => {
            const url = String(a?.url || "").trim();
            const label = escapeHtml(String(a?.name || "File"));
            if (!url) return "";
            return `<li><a href="${escapeHtml(url)}">${label}</a></li>`;
          })
          .filter(Boolean)
          .join("")}</ul>`
      : "";

  const text = [
    "A member submitted a help request through the portal.",
    "",
    `Category: ${catLabel}`,
    `Subject: ${subject}`,
    "",
    message,
    "",
    ...attLines,
    "—",
    `From: ${submitterName || "—"} (${submitterEmail || "—"})`,
    `Role: ${submitterRole || "—"}`,
    `Department: ${submitterDepartment || "—"}`,
    `Submitted: ${new Date().toISOString()}`,
    "",
    APP_MAIL_BRAND,
  ].join("\n");

  const bodyHtml = `
  <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">Help request</p>
  <p style="margin:0 0 16px 0;">A member submitted this message from <strong>${escapeHtml(APP_MAIL_BRAND)}</strong>.</p>
  <p style="margin:0 0 8px 0;"><strong>Category:</strong> ${escapeHtml(catLabel)}</p>
  <p style="margin:0 0 8px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  <div style="margin:16px 0;padding:14px 16px;background:#f7f9fa;border-left:4px solid #0B3EAF;white-space:pre-wrap;">${escapeHtml(message)}</div>
  ${attHtml}
  <p style="margin:0 0 4px 0;"><strong>From:</strong> ${escapeHtml(submitterName || "—")} (${escapeHtml(submitterEmail || "—")})</p>
  <p style="margin:0 0 4px 0;"><strong>Role:</strong> ${escapeHtml(submitterRole || "—")}</p>
  <p style="margin:0 0 16px 0;"><strong>Department:</strong> ${escapeHtml(submitterDepartment || "—")}</p>
  <p style="margin:0;font-size:12px;color:#5c5f66;">${escapeHtml(new Date().toLocaleString())}</p>`;

  const html = emailShell({
    title: mailSubject,
    preheader: `${submitterName || "A member"} needs help: ${subject}`,
    bodyHtml,
  });

  return sendMail({ to: list.join(", "), subject: mailSubject, text, html });
}

async function sendTicketMessageEmail({
  to,
  recipientName,
  senderName,
  ticketId,
  ticketTitle,
  messageBody,
}) {
  if (!to) return { skipped: true };

  const subject = `[AGC IT] New message on ticket #${ticketId}: ${ticketTitle}`;

  const text = [
    `Hello${recipientName ? ` ${recipientName}` : ""},`,
    "",
    `${senderName || "Someone"} left a note on IT ticket #${ticketId}.`,
    "",
    `Ticket: ${ticketTitle}`,
    "",
    `Message:`,
    messageBody,
    "",
    `Log in to the AGC Member Portal to reply.`,
    "",
    `${APP_MAIL_BRAND} — IT ticketing`,
  ].join("\n");

  const bodyHtml = `
  <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:#0f172a;">New note on your IT ticket</p>
  <p style="margin:0 0 16px 0;">Hello${recipientName ? ` ${escapeHtml(recipientName)}` : ""},</p>
  <p style="margin:0 0 8px 0;"><strong>${escapeHtml(senderName || "Someone")}</strong> sent a message on ticket <strong>#${escapeHtml(String(ticketId))}</strong>:</p>
  <p style="margin:0 0 4px 0;font-size:12px;color:#5c5f66;">${escapeHtml(ticketTitle)}</p>
  <div style="margin:16px 0;padding:14px 16px;background:#eef2fb;border-left:4px solid #0B3EAF;white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(messageBody)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center" bgcolor="#0B3EAF" style="border-radius:8px;">
        <a href="${escapeHtml(String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "").trim().replace(/\/+$/, ""))}/it-tickets" style="display:inline-block;padding:12px 22px;font-family:Segoe UI, Arial, sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Open ticket &amp; reply</a>
      </td>
    </tr>
  </table>
  <p style="margin:0;font-size:12px;color:#5c5f66;">${escapeHtml(new Date().toLocaleString())}</p>`;

  const html = emailShell({
    title: subject,
    preheader: `${senderName || "Someone"} left a note on ticket #${ticketId}`,
    bodyHtml,
  });

  return sendMail({ to, subject, text, html });
}

// ── Customer Inquiry Emails ───────────────────────────────────────────────────

async function sendCustomerInquiryToFsqa({ to, inquiry }) {
  if (!to) return { skipped: true };
  const reviewUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "") + "/customers/review";
  const html = emailShell({
    title: "New Customer Inquiry — Action Required",
    preheader: `New inquiry from ${escapeHtml(inquiry.customer_name)} (${escapeHtml(inquiry.inquiry_type)})`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding:28px 32px 0;">
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0B3EAF;">New Customer Inquiry</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;">A customer has submitted an inquiry and it requires your FSQA review.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0;margin-bottom:20px;">
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;width:140px;vertical-align:top;">Ref #</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">#${escapeHtml(String(inquiry.id))}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Name</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.customer_name)}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Company</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.customer_company || "—")}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Email</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.customer_email)}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Type</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.inquiry_type)}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Subject</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(inquiry.subject)}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Message</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.message)}</td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 28px;background:#0B3EAF;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Review Inquiry →</a>
            </td></tr>
          </table>
        </td></tr>
      </table>`,
  });
  return sendMail({ to, subject: `[FSQA Review Required] New Customer Inquiry #${inquiry.id} — ${inquiry.subject}`, html });
}

async function sendCustomerInquiryToManagement({ to, inquiry }) {
  if (!to) return { skipped: true };
  const reviewUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "") + "/customers/review";
  const html = emailShell({
    title: "Customer Inquiry — Management Review Required",
    preheader: `FSQA has reviewed inquiry #${inquiry.id} and forwarded it to management`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding:28px 32px 0;">
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0B3EAF;">Customer Inquiry — Management Review</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;">FSQA has reviewed the following inquiry and forwarded it for your management decision.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0;margin-bottom:16px;">
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;width:140px;vertical-align:top;">Ref #</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">#${escapeHtml(String(inquiry.id))}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Customer</td><td style="padding:5px 0;font-size:13px;color:#0f172a;">${escapeHtml(inquiry.customer_name)}${inquiry.customer_company ? ` — ${escapeHtml(inquiry.customer_company)}` : ""}</td></tr>
            <tr><td style="padding:5px 0;font-size:13px;color:#64748b;vertical-align:top;">Subject</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(inquiry.subject)}</td></tr>
          </table>
          ${inquiry.fsqa_comment ? `
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
            <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">FSQA Comment</div>
            <div style="font-size:13px;color:#0f172a;">${escapeHtml(inquiry.fsqa_comment)}</div>
          </div>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 28px;background:#0B3EAF;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Review &amp; Close →</a>
            </td></tr>
          </table>
        </td></tr>
      </table>`,
  });
  return sendMail({ to, subject: `[Management Review] Customer Inquiry #${inquiry.id} — ${inquiry.subject}`, html });
}

module.exports = {
  EMAIL_TEMPLATE_VERSION,
  isEmailConfigured,
  verifySmtpConnection,
  sendMail,
  resetTransporter,
  sendManagerCourseCompletionEmail,
  sendEmployeeAllTrainingCompleteEmail,
  sendManagerAllTrainingCompleteEmail,
  sendITTicketCreatedEmail,
  sendITTicketUpdatedEmail,
  sendITTicketResolvedEmail,
  sendTicketMessageEmail,
  sendAccountInviteEmail,
  deliverAccountInviteEmail,
  sendPasswordResetEmail,
  sendHelpReportEmail,
  sendCustomerInquiryToFsqa,
  sendCustomerInquiryToManagement,
};
