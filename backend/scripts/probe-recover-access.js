/**
 * Simulate forgot-password for one email: node scripts/probe-recover-access.js user@example.com
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const database = require("../src/config/db");
const inviteSvc = require("../src/services/invite.service");
const emailSvc = require("../src/services/email.service");
const { issueInviteAndEmail } = require("../src/services/inviteResend.service");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/probe-recover-access.js email@example.com");
    process.exit(1);
  }

  await database.initDb();
  const db = database.db;

  console.log("SMTP configured:", emailSvc.isEmailConfigured());
  console.log("APP_BASE_URL:", inviteSvc.publicAppBaseUrl());

  const user = await db
    .prepare("SELECT id, email, name, invite_token_hash FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))")
    .get(email);

  if (!user) {
    console.log("No user found for:", email);
    process.exit(0);
  }

  console.log("User:", { id: user.id, email: user.email, pendingInvite: !!user.invite_token_hash });

  if (user.invite_token_hash) {
    const inviteMail = await issueInviteAndEmail(db, user.id);
    console.log("Invite path:", inviteMail);
    process.exit(inviteMail.email_sent ? 0 : 1);
  }

  const raw = inviteSvc.generateInviteRawToken();
  const h = inviteSvc.hashInviteToken(raw);
  const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await db
    .prepare("UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?")
    .run(h, exp, user.id);

  const resetUrl = `${inviteSvc.publicAppBaseUrl()}/reset-password?token=${encodeURIComponent(raw)}`;
  try {
    const resetMail = await emailSvc.sendPasswordResetEmail({
      to: String(user.email).trim(),
      name: String(user.name || "").trim(),
      resetUrl,
      validMinutes: 60,
    });
    console.log("Reset path:", resetMail);
    console.log("Reset URL:", resetUrl);
    process.exit(resetMail.email_sent ? 0 : 1);
  } catch (e) {
    console.error("Reset send threw:", e.message);
    if (e.response) console.error("SMTP response:", e.response);
    process.exit(1);
  }
}

main();
