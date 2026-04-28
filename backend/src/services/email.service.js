const nodemailer = require("nodemailer");

/** Display name in email subjects, footers, and plain-text signatures. */
const APP_MAIL_BRAND = "Member Portal";

/** Bump when invite/reset HTML changes (helps verify production deploy). */
const EMAIL_TEMPLATE_VERSION = "20260427-email-v4";

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Public URL to a logo image (https). Prefer EMAIL_LOGO_URL; otherwise derived from APP_BASE_URL/FRONTEND_URL. */
function getEmailLogoUrl() {
  const explicit = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (explicit) return explicit;
  const base = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/amir-group-logo.png?v=8`;
}

function emailShell({ title, preheader, bodyHtml }) {
  const logo = getEmailLogoUrl();
  const headerCellAttrs = logo
    ? 'align="center" style="padding:22px 24px;background:#000000;text-align:center;border-bottom:1px solid #1a1a1a;"'
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

function isEmailConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM
  );
}

let transporter;

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === "true";
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
      },
      /** Microsoft 365 / some hosts need explicit STARTTLS on port 587. Set SMTP_REQUIRE_TLS=true if sends fail. */
      ...(process.env.SMTP_REQUIRE_TLS === "true" ? { requireTLS: true } : {}),
      ...(process.env.SMTP_DEBUG === "1" || process.env.SMTP_DEBUG === "true" ? { debug: true } : {}),
    });
  }
  return transporter;
}

/** Reset pool (e.g. after .env change in tests). */
function resetTransporter() {
  transporter = null;
}

/**
 * Send email via SMTP (Microsoft 365 / Outlook when using smtp.office365.com + app password or allowed account).
 * @returns {Promise<{ sent?: boolean, skipped?: boolean }>}
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(
      "[EMAIL] Not configured: set SMTP_HOST, SMTP_PORT (optional), SMTP_USER, SMTP_PASS, EMAIL_FROM in .env"
    );
    return { skipped: true };
  }

  await t.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

/**
 * Notify manager in Outlook / corporate email when a direct report completes a course.
 */
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
  attachments = [],
}) {
  if (!to) return { skipped: true };

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
  <p><strong>New IT ticket</strong> was raised in Member Portal.</p>
  <p style="margin: 16px 0; padding: 12px 16px; background: #eef2fb; border-left: 4px solid #0b3eaf;">
    <strong>#${escapeHtml(String(ticketId))}</strong> — ${escapeHtml(title)}
  </p>
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

/**
 * Invite link for first-time password setup (admin-created users).
 */
async function sendAccountInviteEmail({ to, name, setupUrl, validDays }) {
  if (!to) return { skipped: true };
  const subject = `Set up your ${APP_MAIL_BRAND} account`;
  const rawUrl = String(setupUrl || "").trim();
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    "Your administrator has created a Member Portal account for you.",
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
    preheader: "Choose a password to activate your Member Portal account.",
    bodyHtml,
  });

  const out = await sendMail({ to, subject, text, html });
  if (out.skipped) {
    console.warn(
      "[EMAIL] Invite email not sent — configure SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM (and set APP_BASE_URL / FRONTEND_URL to your public site URL for correct links)."
    );
  }
  return out;
}

/**
 * Password reset for accounts that already completed invite setup.
 */
async function sendPasswordResetEmail({ to, name, resetUrl, validMinutes }) {
  if (!to) return { skipped: true };
  const mins = validMinutes ?? 60;
  const subject = `Reset your ${APP_MAIL_BRAND} password`;
  const rawUrl = String(resetUrl || "").trim();
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    "We received a request to reset your Member Portal password.",
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
    preheader: "Reset your Member Portal password using the secure link below.",
    bodyHtml,
  });

  const out = await sendMail({ to, subject, text, html });
  if (out.skipped) {
    console.warn(
      "[EMAIL] Password reset email not sent — configure SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM (and APP_BASE_URL / FRONTEND_URL for correct links)."
    );
  }
  return out;
}

module.exports = {
  EMAIL_TEMPLATE_VERSION,
  isEmailConfigured,
  sendMail,
  resetTransporter,
  sendManagerCourseCompletionEmail,
  sendITTicketCreatedEmail,
  sendAccountInviteEmail,
  sendPasswordResetEmail,
};
