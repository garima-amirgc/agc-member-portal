/**
 * Verify invite email template + SMTP: node scripts/test-invite-email.js recipient@example.com
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const email = require("../src/services/email.service");
const inviteSvc = require("../src/services/invite.service");

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: node scripts/test-invite-email.js recipient@example.com");
    process.exit(1);
  }
  if (!email.isEmailConfigured()) {
    console.error("SMTP is not fully configured in backend/.env");
    process.exit(1);
  }

  const setupUrl = `${inviteSvc.publicAppBaseUrl()}/invite?token=test-invite-email-probe`;
  const result = await email.deliverAccountInviteEmail({
    to,
    name: "Invite test",
    setupUrl,
    validDays: inviteSvc.INVITE_DAYS,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.email_sent ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
