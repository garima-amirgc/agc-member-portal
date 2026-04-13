const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const { BUSINESS_UNITS, ROLES } = require("../config/constants");
const userDeptSvc = require("../services/userDepartments.service");
const { authRequired, allowRoles } = require("../middleware/auth");
const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { managerLeaveInboxWithTeam } = require("../handlers/managerInbox.handler");
const inviteSvc = require("../services/invite.service");

const router = express.Router();

router.post("/register", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { name, email, password, role, business_unit, manager_id = null } = req.body;
  if (!name || !email || !password || !role || !business_unit) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  if (!BUSINESS_UNITS.includes(business_unit)) {
    return res.status(400).json({ message: "Invalid business unit" });
  }
  try {
    inviteSvc.validateNewPassword(String(password));
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message || "Invalid password" });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare(
      "INSERT INTO users(name, email, password, role, business_unit, manager_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const result = await stmt.run(name, email, hash, role, business_unit, manager_id);
    return res.status(201).json({ id: result.lastInsertRowid, message: "User created" });
  } catch {
    return res.status(400).json({ message: "User already exists or invalid data" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (user.invite_token_hash) {
    if (inviteSvc.hasActiveInvite(user)) {
      return res.status(403).json({
        code: "INVITE_PENDING",
        message:
          "This account is waiting for you to set a password. Use the invite link from your email, or ask an administrator to resend it.",
      });
    }
    return res.status(403).json({
      code: "INVITE_EXPIRED",
      message: "Your setup link has expired. Ask an administrator to send a new invite.",
    });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

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
    { expiresIn: "8h" }
  );

  const { password: _pw, invite_token_hash: _i, invite_expires_at: _ie, ...safe } = user;
  return res.json({
    token,
    user: { ...safe, password: undefined, departments, department: dept },
  });
});

/** Public: check invite token before showing set-password form. */
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

/** Public: first-time password after admin invite. */
router.post("/complete-invite", async (req, res) => {
  try {
    const raw = String(req.body?.token || "").trim();
    const password = req.body?.password;
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
        "UPDATE users SET password = ?, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?"
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
      { expiresIn: "8h" }
    );
    const { password: _p, invite_token_hash: _i, invite_expires_at: _ie, ...safe } = user;
    return res.json({
      token,
      user: { ...safe, password: undefined, departments, department: dept },
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

router.patch("/manager-leave-requests/:id", authRequired, async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
  try {
    const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/manager-team-overview", authRequired, async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
  try {
    return res.json(await managerTeamSvc.getTeamOverview(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
