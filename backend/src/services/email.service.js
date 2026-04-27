const nodemailer = require("nodemailer");

/** Display name in email subjects, footers, and plain-text signatures. */
const APP_MAIL_BRAND = "Member Portal";

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

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    "An administrator created an account for you. Open the link below to choose your password and sign in:",
    "",
    String(setupUrl || "").trim(),
    "",
    `This link expires in about ${validDays ?? 7} days.`,
    "",
    "If you did not expect this message, you can ignore it.",
    "",
    APP_MAIL_BRAND,
  ].join("\n");

  const link = escapeHtml(String(setupUrl || "").trim());
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #1c1d1f;">
  <p>Hello${name ? ` ${escapeHtml(name)}` : ""},</p>
  <p>An administrator created an account for you. Use the button below to choose your password.</p>
  <p style="margin: 24px 0;">
    <a href="${link}" style="display:inline-block;padding:12px 20px;background:#0B3EAF;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Set up password</a>
  </p>
  <p style="font-size: 13px; color: #5c5f66;">Or paste this URL into your browser:<br/><span style="word-break: break-all;">${link}</span></p>
  <p style="font-size: 12px; color: #5c5f66;">This link expires in about ${validDays ?? 7} days.</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #5c5f66;">${APP_MAIL_BRAND}</p>
</body>
</html>`;

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
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    "We received a request to reset your password. Open the link below to choose a new password:",
    "",
    String(resetUrl || "").trim(),
    "",
    `This link expires in about ${mins} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    APP_MAIL_BRAND,
  ].join("\n");

  const link = escapeHtml(String(resetUrl || "").trim());
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Segoe UI, Arial, sans-serif; line-height: 1.5; color: #1c1d1f;">
  <p>Hello${name ? ` ${escapeHtml(name)}` : ""},</p>
  <p>We received a request to reset your password.</p>
  <p style="margin: 24px 0;">
    <a href="${link}" style="display:inline-block;padding:12px 20px;background:#0B3EAF;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>
  </p>
  <p style="font-size: 13px; color: #5c5f66;">Or paste this URL into your browser:<br/><span style="word-break: break-all;">${link}</span></p>
  <p style="font-size: 12px; color: #5c5f66;">This link expires in about ${mins} minutes.</p>
  <hr style="border: none; border-top: 1px solid #d1d7dc; margin: 24px 0;" />
  <p style="font-size: 12px; color: #5c5f66;">${APP_MAIL_BRAND}</p>
</body>
</html>`;

  const out = await sendMail({ to, subject, text, html });
  if (out.skipped) {
    console.warn(
      "[EMAIL] Password reset email not sent — configure SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM (and APP_BASE_URL / FRONTEND_URL for correct links)."
    );
  }
  return out;
}

module.exports = {
  isEmailConfigured,
  sendMail,
  resetTransporter,
  sendManagerCourseCompletionEmail,
  sendITTicketCreatedEmail,
  sendAccountInviteEmail,
  sendPasswordResetEmail,
};
