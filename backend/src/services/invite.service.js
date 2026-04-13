const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const INVITE_DAYS = Number(process.env.INVITE_LINK_VALID_DAYS || 7);

function hashInviteToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "").trim(), "utf8").digest("hex");
}

function generateInviteRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Unknown bcrypt placeholder so invited users cannot log in until they complete setup. */
function randomPasswordPlaceholder() {
  return bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);
}

function inviteExpiresAtIso() {
  return new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function validateNewPassword(pw) {
  const s = String(pw || "");
  if (s.length < 10) {
    const e = new Error("Password must be at least 10 characters.");
    e.statusCode = 400;
    throw e;
  }
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) {
    const e = new Error("Password must include at least one letter and one number.");
    e.statusCode = 400;
    throw e;
  }
}

function hasActiveInvite(row) {
  if (!row || !row.invite_token_hash) return false;
  if (!row.invite_expires_at) return true;
  return new Date(row.invite_expires_at).getTime() > Date.now();
}

function inviteStatusForRow(row) {
  if (!row?.invite_token_hash) return "none";
  return hasActiveInvite(row) ? "active" : "expired";
}

function maskEmail(email) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "—";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const show = local.length <= 2 ? "*" : `${local.slice(0, 2)}…`;
  return `${show}@${domain}`;
}

function publicAppBaseUrl() {
  const raw = process.env.APP_BASE_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const u = String(raw).trim().replace(/\/+$/, "");
  if ((process.env.NODE_ENV === "production" || process.env.RENDER) && /localhost|127\.0\.0\.1/i.test(u)) {
    console.warn(
      "[APP_BASE_URL] Invite and password-reset links point at localhost. Set APP_BASE_URL or FRONTEND_URL to your public React app URL (e.g. https://your-site.onrender.com)."
    );
  }
  return u;
}

module.exports = {
  hashInviteToken,
  generateInviteRawToken,
  randomPasswordPlaceholder,
  inviteExpiresAtIso,
  validateNewPassword,
  hasActiveInvite,
  inviteStatusForRow,
  maskEmail,
  publicAppBaseUrl,
  INVITE_DAYS,
};
