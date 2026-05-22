const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const { canonicalRole } = require("../config/constants");
const userDeptSvc = require("../services/userDepartments.service");
const { parseAdminGrantsColumn, isFullAdminUser } = require("../config/adminGrants");
const { hasDirectReports } = require("../services/supervisor.service");
const inviteSvc = require("./invite.service");

function jwtExpiresForSession(rememberMe) {
  const r = rememberMe === true || rememberMe === "true" || rememberMe === 1 || rememberMe === "1";
  return r ? "30d" : "8h";
}

async function authResponseUser(userRow, departments, dept) {
  const { password: _pw, invite_token_hash: _i, invite_expires_at: _ie, admin_grants: rawAg, ...safe } = userRow;
  const adminGrants = parseAdminGrantsColumn(rawAg);
  const role = canonicalRole(userRow.role);
  const has_direct_reports = await hasDirectReports(userRow.id);
  return {
    ...safe,
    role,
    password: undefined,
    admin_grants: adminGrants,
    is_full_admin: isFullAdminUser({ role, adminGrants }),
    departments,
    department: dept,
    has_direct_reports,
  };
}

/**
 * @param {object} userRow Full users row
 * @param {boolean|string|number} rememberMe
 */
async function issuePortalSession(userRow, rememberMe) {
  const departments = await userDeptSvc.listForUser(userRow.id);
  const dept = departments[0] || "Production";
  const token = jwt.sign(
    {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      business_unit: userRow.business_unit,
      manager_id: userRow.manager_id,
      designation: userRow.designation != null ? String(userRow.designation) : "",
      department: dept,
      departments,
    },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: jwtExpiresForSession(rememberMe) }
  );
  return {
    token,
    user: await authResponseUser(userRow, departments, dept),
  };
}

/**
 * Resolve portal user by email (case-insensitive). Returns { user, error } where error is a client-facing message or code.
 */
async function resolveUserForLogin(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    return { user: null, error: "No email returned from Microsoft.", code: "NO_EMAIL" };
  }

  const user = await db.prepare("SELECT * FROM users WHERE LOWER(TRIM(email)) = ?").get(normalized);
  if (!user) {
    return {
      user: null,
      error:
        "No portal account exists for this Microsoft email. Ask an administrator to add you to the AGC Member Portal.",
      code: "NO_PORTAL_USER",
    };
  }

  if (user.invite_token_hash) {
    if (inviteSvc.hasActiveInvite(user)) {
      return {
        user: null,
        error:
          "This account is waiting for you to set a password. Use the invite link from your email, or use Forgot password on the login page.",
        code: "INVITE_PENDING",
      };
    }
    return {
      user: null,
      error: "Your setup link has expired. Ask an administrator to send a new invite.",
      code: "INVITE_EXPIRED",
    };
  }

  return { user, error: null, code: null };
}

module.exports = {
  jwtExpiresForSession,
  authResponseUser,
  issuePortalSession,
  resolveUserForLogin,
};
