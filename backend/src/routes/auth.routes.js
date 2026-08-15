const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const { BUSINESS_UNITS, ROLES, canonicalRole } = require("../config/constants");
const userDeptSvc = require("../services/userDepartments.service");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, isFullAdminUser, parseAdminGrantsColumn } = require("../config/adminGrants");
const { hasNpdAccess } = require("../services/npdWorkflow.service");

async function authResponseUser(userRow, departments, dept) {
  const { password: _pw, invite_token_hash: _i, invite_expires_at: _ie, admin_grants: rawAg, ...safe } = userRow;
  const adminGrants = parseAdminGrantsColumn(rawAg);
  const role = canonicalRole(userRow.role);
  const has_direct_reports = await hasDirectReports(userRow.id);
  const npd_access = await hasNpdAccess({ id: userRow.id, role, adminGrants });
  return {
    ...safe,
    role,
    password: undefined,
    admin_grants: adminGrants,
    is_full_admin: isFullAdminUser({ role, adminGrants }),
    departments,
    department: dept,
    has_direct_reports,
    npd_access,
  };
}
const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { getTrainingSummary } = require("../services/trainingCompletion.service");
const { managerLeaveInboxWithTeam } = require("../handlers/managerInbox.handler");
const { supervisorRequired } = require("../middleware/supervisorRequired");
const { hasDirectReports } = require("../services/supervisor.service");
const inviteSvc = require("../services/invite.service");
const emailSvc = require("../services/email.service");
const { issueInviteAndEmail } = require("../services/inviteResend.service");
const { issuePortalSession, resolveUserForLogin } = require("../services/authSession.service");
const msAuth = require("../services/microsoftAuth.service");

const router = express.Router();

const PASSWORD_RESET_MINUTES = Math.min(24 * 60, Math.max(15, Number(process.env.PASSWORD_RESET_MINUTES || 60)));

function recoverAccessDevExtrasEnabled() {
  if (process.env.RECOVER_ACCESS_DEV_LINKS === "1") return true;
  if (process.env.RENDER || process.env.NODE_ENV === "production") return false;
  const base = inviteSvc.publicAppBaseUrl();
  return /localhost|127\.0\.0\.1/i.test(base);
}

function recoverAccessResponse(base, { devLink, devHint } = {}) {
  const out = { ...base };
  if (recoverAccessDevExtrasEnabled()) {
    if (devLink) out.dev_link = devLink;
    if (devHint) out.dev_hint = devHint;
  }
  return out;
}

function jwtExpiresForSession(rememberMe) {
  const r = rememberMe === true || rememberMe === "true" || rememberMe === 1;
  return r ? "30d" : "8h";
}

router.post("/register", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const { name, email, password, role, business_unit, manager_id = null } = req.body;
  if (!name || !email || !password || !role || !business_unit) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  const roleNorm = canonicalRole(role);
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE].includes(roleNorm)) {
    return res.status(400).json({ message: "Invalid role" });
  }
  if (roleNorm === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can create administrator accounts." });
  }
  if (!BUSINESS_UNITS.includes(business_unit)) {
    return res.status(400).json({ message: "Invalid business unit" });
  }
  try {
    inviteSvc.validateNewPassword(String(password));
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message || "Invalid password" });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const existingUser = await db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(emailNorm);
  if (existingUser) {
    return res.status(409).json({ message: "A user with this email address already exists." });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare(
      "INSERT INTO users(name, email, password, role, business_unit, manager_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const result = await stmt.run(name, emailNorm, hash, roleNorm, business_unit, manager_id);
    return res.status(201).json({ id: result.lastInsertRowid, message: "User created" });
  } catch {
    return res.status(400).json({ message: "User already exists or invalid data" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password, rememberMe } = req.body;
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const gate = await resolveUserForLogin(user.email);
  if (!gate.user) {
    const code = gate.code || "FORBIDDEN";
    if (code === "INVITE_PENDING" || code === "INVITE_EXPIRED") {
      return res.status(403).json({ code, message: gate.error });
    }
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await db
    .prepare("UPDATE users SET password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE id = ?")
    .run(user.id);

  const session = await issuePortalSession(user, rememberMe);
  return res.json(session);
});

router.get("/microsoft/status", (_req, res) => {
  res.json({
    enabled: msAuth.isEnabled(),
    loginPath: "/api/auth/microsoft",
  });
});

router.get("/microsoft", (req, res) => {
  if (!msAuth.isEnabled()) {
    return res.redirect(msAuth.frontendLoginUrl("sso_error=Microsoft+SSO+is+not+configured+on+the+server."));
  }
  const remember = req.query.remember === "1" || req.query.remember === "true";
  const state = msAuth.createOAuthState(remember);
  res.setHeader("Set-Cookie", `ms_sso_state=${state}; ${msAuth.cookieOpts(req, 600)}`);
  return res.redirect(msAuth.buildAuthorizeUrl(req, { state, remember }));
});

router.get("/microsoft/callback", async (req, res) => {
  const clearStateCookie = `ms_sso_state=; ${msAuth.cookieOpts(req, 0)}`;
  try {
    if (!msAuth.isEnabled()) {
      res.setHeader("Set-Cookie", clearStateCookie);
      return res.redirect(msAuth.frontendLoginUrl("sso_error=Microsoft+SSO+is+not+configured."));
    }

    const errParam = req.query.error_description || req.query.error;
    if (errParam) {
      res.setHeader("Set-Cookie", clearStateCookie);
      return res.redirect(
        msAuth.frontendLoginUrl(`sso_error=${encodeURIComponent(String(errParam))}`)
      );
    }

    const cookies = msAuth.parseCookies(req.headers.cookie);
    const returnedState = String(req.query.state || "");
    if (!returnedState || returnedState !== cookies.ms_sso_state) {
      res.setHeader("Set-Cookie", clearStateCookie);
      return res.redirect(msAuth.frontendLoginUrl("sso_error=Invalid+sign-in+session.+Try+again."));
    }

    const parsedState = msAuth.parseOAuthState(returnedState);
    if (!parsedState) {
      res.setHeader("Set-Cookie", clearStateCookie);
      return res.redirect(msAuth.frontendLoginUrl("sso_error=Sign-in+session+expired.+Try+again."));
    }

    const code = req.query.code;
    if (!code) {
      res.setHeader("Set-Cookie", clearStateCookie);
      return res.redirect(msAuth.frontendLoginUrl("sso_error=Missing+authorization+code."));
    }

    const tokens = await msAuth.exchangeCodeForTokens(req, code);
    const profile = await msAuth.fetchGraphProfile(tokens.access_token);
    const gate = await resolveUserForLogin(profile.email, { viaMicrosoft: true });
    if (!gate.user) {
      res.setHeader("Set-Cookie", clearStateCookie);
      const codeKey = gate.code ? `&sso_code=${encodeURIComponent(gate.code)}` : "";
      return res.redirect(
        msAuth.frontendLoginUrl(`sso_error=${encodeURIComponent(gate.error || "Access denied.")}${codeKey}`)
      );
    }

    await db
      .prepare(
        "UPDATE users SET password_reset_token_hash = NULL, password_reset_expires_at = NULL, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?"
      )
      .run(gate.user.id);

    const session = await issuePortalSession(gate.user, parsedState.remember);
    res.setHeader("Set-Cookie", clearStateCookie);
    const q = new URLSearchParams({
      token: session.token,
      remember: parsedState.remember ? "1" : "0",
    });
    return res.redirect(`${inviteSvc.publicAppBaseUrl().replace(/\/+$/, "")}/login/sso?${q.toString()}`);
  } catch (e) {
    console.error("[auth] microsoft/callback:", e);
    res.setHeader("Set-Cookie", clearStateCookie);
    return res.redirect(
      msAuth.frontendLoginUrl(`sso_error=${encodeURIComponent(e.message || "Microsoft sign-in failed.")}`)
    );
  }
});

router.post("/recover-access", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  if (!email) return res.status(400).json({ message: "Email is required." });

  const generic = {
    message:
      "If this address is registered, we've sent instructions to your inbox. Please allow a few minutes for delivery.",
  };

  try {
    const user = await db
      .prepare("SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))")
      .get(email);
    if (!user) {
      return res.json(
        recoverAccessResponse(generic, {
          devHint: "No portal account uses that email. Try the exact address your admin added.",
        })
      );
    }

    if (user.invite_token_hash != null && String(user.invite_token_hash).trim() !== "") {
      const inviteMail = await issueInviteAndEmail(db, user.id);
      if (!inviteMail.email_sent) {
        console.warn("[auth] recover-access: invite email not sent for", user.email, inviteMail.email_error || "");
      } else {
        console.log("[auth] recover-access: invite email sent for", user.email);
      }
      return res.json(
        recoverAccessResponse(generic, {
          devLink: inviteMail.setup_url,
          devHint: inviteMail.email_sent
            ? undefined
            : `Email could not be sent (${inviteMail.email_error || "SMTP error"}). Use the link below on localhost.`,
        })
      );
    }

    const raw = inviteSvc.generateInviteRawToken();
    const h = inviteSvc.hashInviteToken(raw);
    const exp = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000).toISOString();
    await db
      .prepare("UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?")
      .run(h, exp, user.id);

    const resetUrl = `${inviteSvc.publicAppBaseUrl()}/reset-password?token=${encodeURIComponent(raw)}`;
    const resetMail = await emailSvc.sendPasswordResetEmail({
      to: String(user.email).trim(),
      name: String(user.name || "").trim(),
      resetUrl,
      validMinutes: PASSWORD_RESET_MINUTES,
    });
    if (!resetMail.email_sent) {
      console.warn(
        "[auth] recover-access: password reset email not sent for",
        user.email,
        resetMail.email_error || "unknown error"
      );
    } else {
      console.log("[auth] recover-access: password reset email sent for", user.email);
    }
    return res.json(
      recoverAccessResponse(generic, {
        devLink: resetUrl,
        devHint: resetMail.email_sent
          ? undefined
          : `Email could not be sent (${resetMail.email_error || "SMTP error"}). Use the link below on localhost.`,
      })
    );
  } catch (e) {
    console.error("[auth] recover-access:", e);
    return res.json(generic);
  }
});

router.get("/reset-password-status", async (req, res) => {
  const raw = String(req.query.token || "").trim();
  if (!raw) return res.status(400).json({ valid: false, message: "Token required" });
  const h = inviteSvc.hashInviteToken(raw);
  const row = await db
    .prepare(
      "SELECT id, email, password_reset_token_hash, password_reset_expires_at FROM users WHERE password_reset_token_hash = ?"
    )
    .get(h);
  if (!row) return res.json({ valid: false });
  if (!row.password_reset_expires_at || new Date(row.password_reset_expires_at).getTime() <= Date.now()) {
    return res.json({ valid: false, reason: "expired" });
  }
  return res.json({ valid: true, email: inviteSvc.maskEmail(row.email) });
});

router.post("/reset-password", async (req, res) => {
  try {
    const raw = String(req.body?.token || "").trim();
    const password = req.body?.password;
    const rememberMe = req.body?.rememberMe;
    if (!raw) return res.status(400).json({ message: "Token is required" });
    inviteSvc.validateNewPassword(password);
    const h = inviteSvc.hashInviteToken(raw);
    const row = await db.prepare("SELECT * FROM users WHERE password_reset_token_hash = ?").get(h);
    if (!row || !row.password_reset_expires_at || new Date(row.password_reset_expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ message: "Invalid or expired reset link." });
    }
    const pwHash = bcrypt.hashSync(String(password), 10);
    await db
      .prepare(
        "UPDATE users SET password = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?"
      )
      .run(pwHash, row.id);

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
    const departments = await userDeptSvc.listForUser(user.id);
    const dept = departments[0] || "Production";
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        business_unit: user.business_unit,
        manager_id: user.manager_id,
        department: dept,
        departments,
      },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: jwtExpiresForSession(rememberMe) }
    );
    return res.json({
      token,
      user: await authResponseUser(user, departments, dept),
    });
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/invite-status", async (req, res) => {
  const raw = String(req.query.token || "").trim();
  if (!raw) return res.status(400).json({ valid: false, message: "Token required" });
  const hash = inviteSvc.hashInviteToken(raw);
  const row = await db
    .prepare("SELECT id, email, invite_token_hash, invite_expires_at FROM users WHERE invite_token_hash = ?")
    .get(hash);
  if (!row) return res.json({ valid: false });
  if (!inviteSvc.hasActiveInvite(row)) {
    return res.json({ valid: false, reason: "expired" });
  }
  return res.json({ valid: true, email: inviteSvc.maskEmail(row.email) });
});

router.post("/complete-invite", async (req, res) => {
  try {
    const raw = String(req.body?.token || "").trim();
    const password = req.body?.password;
    const rememberMe = req.body?.rememberMe;
    if (!raw) return res.status(400).json({ message: "Token is required" });
    inviteSvc.validateNewPassword(password);
    const hash = inviteSvc.hashInviteToken(raw);
    const row = await db
      .prepare("SELECT id, email, invite_token_hash, invite_expires_at FROM users WHERE invite_token_hash = ?")
      .get(hash);
    if (!row || !inviteSvc.hasActiveInvite(row)) {
      return res.status(400).json({ message: "Invalid or expired invite link." });
    }
    const pwHash = bcrypt.hashSync(String(password), 10);
    await db
      .prepare(
        "UPDATE users SET password = ?, invite_token_hash = NULL, invite_expires_at = NULL, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE id = ?"
      )
      .run(pwHash, row.id);

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
    const departments = await userDeptSvc.listForUser(user.id);
    const dept = departments[0] || "Production";
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        business_unit: user.business_unit,
        manager_id: user.manager_id,
        department: dept,
        departments,
      },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: jwtExpiresForSession(rememberMe) }
    );
    return res.json({
      token,
      user: await authResponseUser(user, departments, dept),
    });
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.post("/leave-request", authRequired, async (req, res) => {
  try {
    const out = await leaveSvc.submitLeaveRequest(req.user.id, req.body);
    return res.status(201).json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/my-leave-requests", authRequired, async (req, res) => {
  try {
    return res.json(await leaveSvc.listLeaveRequestsForEmployee(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.get("/manager-leave-inbox", authRequired, managerLeaveInboxWithTeam);

router.patch("/manager-leave-requests/:id", authRequired, supervisorRequired, async (req, res) => {
  try {
    const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/manager-team-overview", authRequired, supervisorRequired, async (req, res) => {
  try {
    const team = await managerTeamSvc.getTeamOverview(req.user.id);
    const includeSelf =
      req.query.include_self_training === "true" || req.query.include_self_training === "1";
    if (!includeSelf) return res.json(team);
    const self_training_summary = await getTrainingSummary(req.user.id);
    return res.json({ team, self_training_summary });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
