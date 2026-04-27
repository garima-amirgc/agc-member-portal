/**
 * Verify SMTP from .env: node scripts/test-smtp.js your-email@example.com
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const email = require("../src/services/email.service");

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: node scripts/test-smtp.js recipient@example.com");
    process.exit(1);
  }
  if (!email.isEmailConfigured()) {
    console.error(
      "SMTP is not fully configured. Set in backend/.env:\n" +
        "  SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM\n" +
        "(and usually SMTP_PORT=587, SMTP_SECURE=false)"
    );
    process.exit(1);
  }

  try {
    const { sendMail } = email;
    await sendMail({
      to,
      subject: "Member Portal — SMTP test",
      text: "If you received this message, SMTP is configured correctly.",
      html: "<p>If you received this message, <strong>SMTP is configured correctly</strong>.</p>",
    });
    console.log("Sent OK to", to);
  } catch (e) {
    console.error("Send failed:", e.message || e);
    if (e.code) console.error("code:", e.code);
    if (e.response) console.error("response:", e.response);
    process.exit(1);
  }
}

main();
