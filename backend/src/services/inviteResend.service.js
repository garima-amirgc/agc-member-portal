const inviteSvc = require("./invite.service");
const emailSvc = require("./email.service");

/**
 * Regenerate invite token and email the user (same behavior as admin "Resend invite").
 * @returns {{ setup_url: string, email_sent: boolean }}
 */
async function issueInviteAndEmail(db, userId) {
  const row = await db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId);
  if (!row) {
    const e = new Error("User not found");
    e.statusCode = 404;
    throw e;
  }

  const rawInviteToken = inviteSvc.generateInviteRawToken();
  const inviteHash = inviteSvc.hashInviteToken(rawInviteToken);
  const inviteExpires = inviteSvc.inviteExpiresAtIso();
  const pwHash = inviteSvc.randomPasswordPlaceholder();

  await db
    .prepare("UPDATE users SET password = ?, invite_token_hash = ?, invite_expires_at = ? WHERE id = ?")
    .run(pwHash, inviteHash, inviteExpires, userId);

  const setupUrl = `${inviteSvc.publicAppBaseUrl()}/invite?token=${encodeURIComponent(rawInviteToken)}`;
  const mail = await emailSvc.sendAccountInviteEmail({
    to: String(row.email).trim(),
    name: String(row.name || "").trim(),
    setupUrl,
    validDays: inviteSvc.INVITE_DAYS,
  });

  return { setup_url: setupUrl, email_sent: mail.sent === true };
}

module.exports = { issueInviteAndEmail };
