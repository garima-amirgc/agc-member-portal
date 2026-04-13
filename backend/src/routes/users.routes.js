const express = require("express");
const bcrypt = require("bcryptjs");
const { db, isPostgres, getPool } = require("../config/db");
const { BUSINESS_UNITS, ROLES } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { syncUserAssignmentsForFacilities } = require("../services/assignmentSync.service");
const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { buildReportingHierarchy } = require("../services/reportingHierarchy.service");
const { managerLeaveInboxWithTeam } = require("../handlers/managerInbox.handler");
const userDeptSvc = require("../services/userDepartments.service");
const inviteSvc = require("../services/invite.service");
const emailSvc = require("../services/email.service");
const { issueInviteAndEmail } = require("../services/inviteResend.service");

const router = express.Router();
router.use(authRequired);

function adminUsersListSql() {
  const facAgg = isPostgres
    ? `COALESCE((SELECT string_agg(uf.business_unit, ',' ORDER BY uf.business_unit) FROM user_facilities uf WHERE uf.user_id = u.id), '') AS facilities_csv`
    : `COALESCE((SELECT GROUP_CONCAT(uf.business_unit, ',') FROM user_facilities uf WHERE uf.user_id = u.id), '') AS facilities_csv`;
  const deptAgg = isPostgres
    ? `COALESCE((SELECT string_agg(ud.department, ',' ORDER BY ud.department) FROM user_departments ud WHERE ud.user_id = u.id), '') AS departments_csv`
    : `COALESCE((SELECT GROUP_CONCAT(ud.department, ',') FROM user_departments ud WHERE ud.user_id = u.id), '') AS departments_csv`;
  return `
      SELECT
        u.id, u.name, u.email, u.role, u.business_unit, u.manager_id, u.created_at,
        COALESCE(NULLIF(TRIM(u.department), ''), 'Production') AS department,
        u.invite_token_hash,
        u.invite_expires_at,
        m.name AS manager_name,
        ${facAgg},
        ${deptAgg}
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      ORDER BY u.id DESC
      `;
}

// Logged-in user's profile
router.get("/me", async (req, res) => {
  const user = await db
    .prepare(
      "SELECT id, name, email, role, business_unit, manager_id, profile_image_url, created_at, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department FROM users WHERE id = ?"
    )
    .get(req.user.id);

  if (!user) return res.status(404).json({ message: "User not found" });

  const facRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.user.id);
  const facilities = facRows.map((r) => r.business_unit);

  const reporting_hierarchy = await buildReportingHierarchy(req.user.id);
  const departments = await userDeptSvc.listForUser(req.user.id);

  return res.json({ ...user, facilities, departments, reporting_hierarchy });
});

// Update logged-in user's profile details
router.put("/me", async (req, res) => {
  const existing = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!existing) return res.status(404).json({ message: "User not found" });

  const { name, email, password } = req.body;

  const nextName = name ?? existing.name;
  const nextEmail = email ?? existing.email;

  if (!nextName || !nextEmail) return res.status(400).json({ message: "Missing name/email" });

  if (nextEmail !== existing.email) {
    const emailExists = await db
      .prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1")
      .get(nextEmail, req.user.id);
    if (emailExists) return res.status(400).json({ message: "Email already in use" });
  }

  let nextPassword = existing.password;
  let clearInvite = false;
  if (password !== undefined && password !== null && String(password).trim() !== "") {
    try {
      inviteSvc.validateNewPassword(String(password).trim());
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message || "Invalid password" });
    }
    nextPassword = bcrypt.hashSync(String(password).trim(), 10);
    clearInvite = true;
  }

  if (clearInvite) {
    await db
      .prepare(
        "UPDATE users SET name = ?, email = ?, password = ?, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?"
      )
      .run(nextName, nextEmail, nextPassword, req.user.id);
  } else {
    await db.prepare("UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?").run(
      nextName,
      nextEmail,
      nextPassword,
      req.user.id
    );
  }

  return res.json({ message: "Profile updated" });
});

// Leave requests (same /users/me prefix as profile — avoids 404 when /leave-requests isn’t routed).
router.post("/me/leave-requests", async (req, res) => {
  try {
    const out = await leaveSvc.submitLeaveRequest(req.user.id, req.body);
    return res.status(201).json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

router.get("/me/leave-requests", async (req, res) => {
  try {
    return res.json(await leaveSvc.listLeaveRequestsForEmployee(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

router.get("/", allowRoles(ROLES.ADMIN), async (req, res) => {
  const rowsRaw = await db.prepare(adminUsersListSql()).all();
  const rows = rowsRaw.map((r) => {
    const departments = String(r.departments_csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    const facilities = String(r.facilities_csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    const { facilities_csv, departments_csv, invite_token_hash, invite_expires_at, ...rest } = r;
    const invite_status = inviteSvc.inviteStatusForRow({
      invite_token_hash,
      invite_expires_at,
    });
    return {
      ...rest,
      facilities,
      departments: departments.length > 0 ? departments : [rest.department || "Production"],
      department: departments[0] || rest.department || "Production",
      invite_status,
    };
  });
  res.json(rows);
});

// Manager leave inbox (under /users so routing matches profile API).
router.get("/manager/leave-inbox", managerLeaveInboxWithTeam);

router.patch("/manager/leave-requests/:id", async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
  try {
    const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

// Manager: direct reports with leave history and course assignment progress
router.get("/manager/team-overview", async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });
  try {
    return res.json(await managerTeamSvc.getTeamOverview(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

/** Before GET /:id — explicit path so it is never shadowed. */
router.post("/:id/resend-invite", allowRoles(ROLES.ADMIN), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  try {
    const { setup_url, email_sent } = await issueInviteAndEmail(db, userId);
    return res.json({
      setup_url,
      email_sent,
      invite_status: "active",
    });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ message: "User not found" });
    console.error("[users] resend-invite:", e);
    return res.status(500).json({ message: "Could not create invite" });
  }
});

// Admin: fetch a specific user + facilities
router.get("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const user = await db
    .prepare(
      "SELECT id, name, email, role, business_unit, manager_id, profile_image_url, created_at, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, invite_token_hash, invite_expires_at FROM users WHERE id = ?"
    )
    .get(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const facRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.params.id);
  const facilities = facRows.map((r) => r.business_unit);

  const departments = await userDeptSvc.listForUser(req.params.id);

  const invite_status = inviteSvc.inviteStatusForRow(user);
  const { invite_token_hash: _h, invite_expires_at: _e, ...safe } = user;
  return res.json({ ...safe, facilities, departments, invite_status });
});

router.post("/", allowRoles(ROLES.ADMIN), async (req, res) => {
  const { name, email, password, role, business_unit, business_units, manager_id = null, department, departments } =
    req.body;
  const businessUnits = Array.isArray(business_units)
    ? business_units
    : business_unit
      ? [business_unit]
      : [];

  const passwordTrim = password != null ? String(password).trim() : "";
  const useInvite = !passwordTrim;

  if (!name || !email || !role || businessUnits.length === 0) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (!useInvite) {
    try {
      inviteSvc.validateNewPassword(passwordTrim);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message || "Invalid password" });
    }
  }

  if (!businessUnits.every((u) => BUSINESS_UNITS.includes(u))) {
    return res.status(400).json({ message: "Invalid business unit(s)" });
  }

  let deptList = null;
  if (Array.isArray(departments)) {
    deptList = userDeptSvc.validateAndNormalize(departments);
    if (!deptList) return res.status(400).json({ message: "Invalid departments" });
  } else if (department !== undefined && department !== null && String(department).trim() !== "") {
    deptList = userDeptSvc.validateAndNormalize([department]);
    if (!deptList) return res.status(400).json({ message: "Invalid department" });
  } else {
    deptList = ["Production"];
  }
  const primaryDept = deptList[0];

  let pwHash;
  let inviteHash = null;
  let inviteExpires = null;
  let rawInviteToken = null;
  if (useInvite) {
    rawInviteToken = inviteSvc.generateInviteRawToken();
    inviteHash = inviteSvc.hashInviteToken(rawInviteToken);
    inviteExpires = inviteSvc.inviteExpiresAtIso();
    pwHash = inviteSvc.randomPasswordPlaceholder();
  } else {
    pwHash = bcrypt.hashSync(passwordTrim, 10);
  }

  try {
    const result = await db
      .prepare(
        "INSERT INTO users(name, email, password, role, business_unit, manager_id, department, invite_token_hash, invite_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(name, email, pwHash, role, businessUnits[0], manager_id, primaryDept, inviteHash, inviteExpires);

    const userId = result.lastInsertRowid;

    const ins = db.prepare("INSERT OR IGNORE INTO user_facilities(user_id, business_unit) VALUES (?, ?)");
    for (const bu of businessUnits) await ins.run(userId, bu);

    await userDeptSvc.syncForUser(userId, deptList);

    await syncUserAssignmentsForFacilities(userId);

    if (useInvite) {
      const setupUrl = `${inviteSvc.publicAppBaseUrl()}/invite?token=${encodeURIComponent(rawInviteToken)}`;
      const mail = await emailSvc.sendAccountInviteEmail({
        to: String(email).trim(),
        name: String(name).trim(),
        setupUrl,
        validDays: inviteSvc.INVITE_DAYS,
      });
      return res.status(201).json({
        id: userId,
        invite: true,
        setup_url: setupUrl,
        email_sent: mail.sent === true,
        invite_status: "active",
      });
    }

    return res.status(201).json({ id: userId, invite: false, invite_status: "none" });
  } catch (e) {
    const msg = String(e?.message || "");
    const code = e?.code;
    if (code === "23505" || /unique|duplicate/i.test(msg)) {
      return res.status(409).json({ message: "A user with this email already exists. Edit that user or use Resend invite." });
    }
    console.error("[users] create user:", e);
    return res.status(400).json({ message: "Could not create user" });
  }
});

router.put("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const { name, email, role, business_unit, business_units, manager_id, password, department, departments } = req.body;
  const existing = await db
    .prepare(
      `SELECT id, name, email, role, business_unit, manager_id, password, department, profile_image_url, created_at,
              invite_token_hash, invite_expires_at
       FROM users WHERE id = ?`
    )
    .get(userId);
  if (!existing) return res.status(404).json({ message: "User not found" });

  let newPassword = existing.password;
  let clearInvite = false;
  if (password !== undefined && password !== null && String(password).trim() !== "") {
    try {
      inviteSvc.validateNewPassword(String(password).trim());
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message || "Invalid password" });
    }
    newPassword = bcrypt.hashSync(String(password).trim(), 10);
    clearInvite = true;
  }
  const nextInviteHash = clearInvite ? null : existing.invite_token_hash;
  const nextInviteExpires = clearInvite ? null : existing.invite_expires_at;

  const existingFacRows = await db.prepare("SELECT business_unit FROM user_facilities WHERE user_id = ?").all(userId);
  const existingFacilities = existingFacRows.map((r) => r.business_unit);

  let incomingFacilities = null;
  if (Array.isArray(business_units) && business_units.length > 0) {
    incomingFacilities = business_units;
  } else if (business_unit) {
    incomingFacilities = [business_unit];
  }

  let newFacilities =
    incomingFacilities ??
    (existingFacilities.length > 0 ? existingFacilities : existing.business_unit ? [existing.business_unit] : []);

  if (newFacilities.length === 0) {
    newFacilities = ["AGC"];
  }

  if (!newFacilities.every((u) => BUSINESS_UNITS.includes(u))) {
    return res.status(400).json({ message: "Invalid business unit(s)" });
  }

  let nextEmail = email !== undefined && email !== null ? String(email).trim() : existing.email;
  const nextName = name !== undefined && name !== null ? String(name).trim() : existing.name;
  if (!nextName || !nextEmail) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  if (nextEmail !== existing.email) {
    const taken = await db.prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1").get(nextEmail, userId);
    if (taken) {
      return res.status(400).json({ message: "Email already in use" });
    }
  }

  let nextManagerId = existing.manager_id;
  if (manager_id !== undefined) {
    if (manager_id === null || manager_id === "") {
      nextManagerId = null;
    } else {
      const mid = Number(manager_id);
      if (!Number.isFinite(mid) || mid < 1) {
        nextManagerId = null;
      } else if (mid === userId) {
        return res.status(400).json({ message: "User cannot be their own manager" });
      } else {
        const mgr = await db.prepare("SELECT id FROM users WHERE id = ?").get(mid);
        if (!mgr) {
          return res.status(400).json({ message: "Invalid manager" });
        }
        nextManagerId = mid;
      }
    }
  }

  let newDeptList = await userDeptSvc.listForUser(userId);
  if (Object.prototype.hasOwnProperty.call(req.body, "departments")) {
    const v = userDeptSvc.validateAndNormalize(departments);
    if (!v) return res.status(400).json({ message: "Invalid departments" });
    newDeptList = v;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "department")) {
    const v = userDeptSvc.validateAndNormalize([department]);
    if (!v) return res.status(400).json({ message: "Invalid department" });
    newDeptList = v;
  }
  const newDept = newDeptList[0] || "Production";

  const nextRole = role !== undefined && role !== null && String(role).trim() !== "" ? String(role).trim() : existing.role;
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE].includes(nextRole)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    await db
      .prepare(
        "UPDATE users SET name=?, email=?, role=?, business_unit=?, manager_id=?, password=?, department=?, invite_token_hash=?, invite_expires_at=? WHERE id=?"
      )
      .run(
        nextName,
        nextEmail,
        nextRole,
        newFacilities[0],
        nextManagerId == null ? null : nextManagerId,
        newPassword,
        newDept,
        nextInviteHash,
        nextInviteExpires,
        userId
      );

    await db.prepare("DELETE FROM user_facilities WHERE user_id = ?").run(userId);
    const ins = db.prepare("INSERT OR IGNORE INTO user_facilities(user_id, business_unit) VALUES (?, ?)");
    for (const bu of newFacilities) await ins.run(userId, bu);

    await userDeptSvc.syncForUser(userId, newDeptList);

    await syncUserAssignmentsForFacilities(userId);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("UNIQUE") && msg.includes("email")) {
      return res.status(400).json({ message: "Email already in use" });
    }
    if (msg.includes("FOREIGN KEY")) {
      return res.status(400).json({ message: "Invalid manager or related data" });
    }
    if (msg.includes("no such column") && msg.toLowerCase().includes("department")) {
      return res.status(500).json({
        message: "Database is missing the department column. Restart the server once to run migrations.",
      });
    }
    console.error("[users] PUT /:id failed:", err);
    return res.status(500).json({ message: "Could not update user" });
  }

  const updated = await db
    .prepare(
      `SELECT id, name, email, role,
        COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department,
        manager_id
       FROM users WHERE id = ?`
    )
    .get(userId);

  const departmentsOut = await userDeptSvc.listForUser(userId);

  return res.json({ message: "User updated", user: { ...updated, departments: departmentsOut } });
});

/**
 * Remove a user and dependent rows. Uses explicit deletes + updates so it still works if an older
 * DB was created without ON DELETE CASCADE on every child FK (common cause of persistent 23503).
 */
async function deleteAdminUserCascade(userId, actingAdminId) {
  if (isPostgres) {
    const pool = getPool();
    if (!pool) throw new Error("PostgreSQL pool unavailable");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const uid = Number(userId);
      const aid = Number(actingAdminId);
      await client.query(
        `DELETE FROM lesson_completions WHERE assignment_id IN (SELECT id FROM assignments WHERE user_id = $1)`,
        [uid]
      );
      await client.query(`DELETE FROM assignments WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM manager_notifications WHERE manager_id = $1 OR employee_id = $1`, [uid]);
      await client.query(`DELETE FROM leave_requests WHERE employee_id = $1 OR manager_id = $1`, [uid]);
      await client.query(`DELETE FROM resource_progress WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM user_facilities WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM user_departments WHERE user_id = $1`, [uid]);
      await client.query(`UPDATE it_tickets SET assignee_id = NULL WHERE assignee_id = $1`, [uid]);
      await client.query(`DELETE FROM it_tickets WHERE user_id = $1`, [uid]);
      await client.query(`UPDATE users SET manager_id = NULL WHERE manager_id = $1`, [uid]);
      await client.query(`UPDATE courses SET created_by = $1 WHERE created_by = $2`, [aid, uid]);
      await client.query(`UPDATE resource_documents SET created_by = NULL WHERE created_by = $1`, [uid]);
      await client.query(`DELETE FROM users WHERE id = $1`, [uid]);
      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (rb) {
        console.error("[users] delete ROLLBACK failed:", rb);
      }
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  await db
    .prepare(
      `DELETE FROM lesson_completions WHERE assignment_id IN (SELECT id FROM assignments WHERE user_id = ?)`
    )
    .run(userId);
  await db.prepare(`DELETE FROM assignments WHERE user_id = ?`).run(userId);
  await db.prepare(`DELETE FROM manager_notifications WHERE manager_id = ? OR employee_id = ?`).run(userId, userId);
  await db.prepare(`DELETE FROM leave_requests WHERE employee_id = ? OR manager_id = ?`).run(userId, userId);
  await db.prepare(`DELETE FROM resource_progress WHERE user_id = ?`).run(userId);
  await db.prepare(`DELETE FROM user_facilities WHERE user_id = ?`).run(userId);
  await db.prepare(`DELETE FROM user_departments WHERE user_id = ?`).run(userId);
  await db.prepare("UPDATE it_tickets SET assignee_id = NULL WHERE assignee_id = ?").run(userId);
  await db.prepare(`DELETE FROM it_tickets WHERE user_id = ?`).run(userId);
  await db.prepare("UPDATE users SET manager_id = NULL WHERE manager_id = ?").run(userId);
  await db
    .prepare("UPDATE courses SET created_by = ? WHERE created_by = ?")
    .run(actingAdminId, userId);
  await db.prepare("UPDATE resource_documents SET created_by = NULL WHERE created_by = ?").run(userId);
  await db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

router.delete("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account." });
  }
  try {
    await deleteAdminUserCascade(userId, req.user.id);
    return res.json({ message: "User deleted" });
  } catch (e) {
    const msg = String(e?.message || "");
    const code = e?.code;
    console.error("[users] DELETE /:id", code, e?.detail || msg, e?.table, e?.constraint);
    if (code === "23503" || /foreign key|violates foreign key/i.test(msg)) {
      return res.status(409).json({
        message:
          "Cannot delete this user while other records still reference them (e.g. courses they created, or tickets). Remove or reassign those first.",
        detail: e?.detail || undefined,
        constraint: e?.constraint || undefined,
      });
    }
    console.error("[users] delete:", e);
    return res.status(500).json({ message: "Could not delete user" });
  }
});

module.exports = router;
