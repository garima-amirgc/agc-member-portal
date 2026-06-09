const express = require("express");
const bcrypt = require("bcryptjs");
const { db, isPostgres, getPool } = require("../config/db");
const { BUSINESS_UNITS, ROLES, canonicalRole } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { syncUserAssignmentsForFacilities } = require("../services/assignmentSync.service");
const { mergeFacilityAccess } = require("../utils/businessUnitCodes");
const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { buildReportingHierarchy } = require("../services/reportingHierarchy.service");
const { hasDirectReports, resolveReportsToId } = require("../services/supervisor.service");
const { supervisorRequired } = require("../middleware/supervisorRequired");
const { managerLeaveInboxWithTeam } = require("../handlers/managerInbox.handler");
const userDeptSvc = require("../services/userDepartments.service");
const inviteSvc = require("../services/invite.service");
const emailSvc = require("../services/email.service");
const { issueInviteAndEmail } = require("../services/inviteResend.service");
const portalVisitsSvc = require("../services/portalVisits.service");
const {
  ADMIN_GRANT_KEYS,
  parseAdminGrantsColumn,
  sanitizeAdminGrantsPayload,
  isFullAdminUser,
} = require("../config/adminGrants");
const { requireAdminGrant } = require("../middleware/adminGrants");
const {
  parseFacilityUniversityOnlyFlag,
  validateFacilityUniversityOnlyForUser,
} = require("../utils/facilityUniversityOnly");

const router = express.Router();
router.use(authRequired);

/** Client may send `admin_grants` or `adminGrants`; treat key presence as intent (including explicit `null`). */
function readAdminGrantsFromBody(body) {
  if (!body || typeof body !== "object") return { present: false, value: undefined };
  function normalizeAdminGrantsValue(v) {
    if (v == null) return v;
    if (typeof v === "string") {
      const t = v.trim();
      if (t === "" || t.toLowerCase() === "null") return null;
      try {
        return JSON.parse(t);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Object.prototype.hasOwnProperty.call(body, "admin_grants")) {
    return { present: true, value: normalizeAdminGrantsValue(body.admin_grants) };
  }
  if (Object.prototype.hasOwnProperty.call(body, "adminGrants")) {
    return { present: true, value: normalizeAdminGrantsValue(body.adminGrants) };
  }
  return { present: false, value: undefined };
}

const { normalizeBirthMonthDay, normalizeJoinDate } = require("../utils/profileDates");

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
        u.designation,
        u.admin_grants,
        COALESCE(u.facility_university_only, 0) AS facility_university_only,
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
  if (canonicalRole(req.user.role) !== ROLES.ADMIN) {
    await syncUserAssignmentsForFacilities(req.user.id);
  }

  const user = await db
    .prepare(
      "SELECT id, name, email, role, business_unit, manager_id, profile_image_url, designation, birth_month, birth_day, join_month, join_day, join_year, phone, address, created_at, admin_grants, COALESCE(facility_university_only, 0) AS facility_university_only, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department FROM users WHERE id = ?"
    )
    .get(req.user.id);

  if (!user) return res.status(404).json({ message: "User not found" });

  const facRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.user.id);
  const facilities = mergeFacilityAccess(facRows, user.business_unit);

  const reporting_hierarchy = await buildReportingHierarchy(req.user.id);
  const departments = await userDeptSvc.listForUser(req.user.id);
  const has_direct_reports = await hasDirectReports(req.user.id);

  const { admin_grants: rawAg, ...rest } = user;
  const adminGrantsOut = parseAdminGrantsColumn(rawAg);
  return res.json({
    ...rest,
    role: canonicalRole(rest.role),
    admin_grants: adminGrantsOut,
    is_full_admin: isFullAdminUser(req.user),
    facility_university_only: Boolean(rest.facility_university_only),
    facilities,
    departments,
    reporting_hierarchy,
    has_direct_reports,
  });
});

/** Track member portal visit (home/dashboard). */
router.post("/me/portal-visit", async (req, res) => {
  try {
    await portalVisitsSvc.recordPortalVisit(req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[users] POST /me/portal-visit:", e);
    return res.status(500).json({ message: "Could not record visit" });
  }
});

// Update logged-in user's profile details
router.put("/me", async (req, res) => {
  const existing = await db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!existing) return res.status(404).json({ message: "User not found" });

  const { name, email, password, designation, phone, address } = req.body;

  const nextName = name ?? existing.name;
  const nextEmail = email ?? existing.email;
  const nextDesignation =
    designation !== undefined && designation !== null ? String(designation).trim().slice(0, 120) : existing.designation;
  const nextPhone =
    phone !== undefined && phone !== null ? String(phone).trim().slice(0, 40) : existing.phone ?? "";
  const nextAddress =
    address !== undefined && address !== null ? String(address).trim().slice(0, 500) : existing.address ?? "";

  if (!nextName || !nextEmail) return res.status(400).json({ message: "Missing name/email" });

  // DOB (month/day only) is optional. If one is provided, both must be valid.
  const providedMonth = req.body?.birth_month;
  const providedDay = req.body?.birth_day;
  const wantsUpdateDob = providedMonth !== undefined || providedDay !== undefined;
  const normalizedDob = wantsUpdateDob ? normalizeBirthMonthDay(providedMonth, providedDay) : null;
  if (wantsUpdateDob && !normalizedDob) {
    return res.status(400).json({ message: "Invalid date of birth (month and day only)." });
  }

  const providedJoinMonth = req.body?.join_month;
  const providedJoinDay = req.body?.join_day;
  const providedJoinYear = req.body?.join_year;
  const wantsUpdateJoin =
    providedJoinMonth !== undefined || providedJoinDay !== undefined || providedJoinYear !== undefined;
  const normalizedJoin = wantsUpdateJoin
    ? normalizeJoinDate(providedJoinMonth, providedJoinDay, providedJoinYear)
    : null;
  if (wantsUpdateJoin && !normalizedJoin) {
    return res.status(400).json({ message: "Invalid date of joining (month, day, and year required)." });
  }

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

  let nextBirthMonth = existing.birth_month;
  let nextBirthDay = existing.birth_day;
  if (wantsUpdateDob) {
    if (!normalizedDob) {
      return res.status(400).json({ message: "Invalid date of birth (month and day only)." });
    }
    nextBirthMonth = normalizedDob.birth_month;
    nextBirthDay = normalizedDob.birth_day;
  }

  let nextJoinMonth = existing.join_month;
  let nextJoinDay = existing.join_day;
  let nextJoinYear = existing.join_year;
  if (wantsUpdateJoin) {
    if (!normalizedJoin) {
      return res.status(400).json({ message: "Invalid date of joining (month, day, and year required)." });
    }
    nextJoinMonth = normalizedJoin.join_month;
    nextJoinDay = normalizedJoin.join_day;
    nextJoinYear = normalizedJoin.join_year;
  }

  let nextInviteHash = existing.invite_token_hash;
  let nextInviteExpires = existing.invite_expires_at;
  if (clearInvite) {
    nextInviteHash = null;
    nextInviteExpires = null;
  }

  await db
    .prepare(
      "UPDATE users SET name = ?, email = ?, designation = ?, password = ?, phone = ?, address = ?, birth_month = ?, birth_day = ?, join_month = ?, join_day = ?, join_year = ?, invite_token_hash = ?, invite_expires_at = ? WHERE id = ?"
    )
    .run(
      nextName,
      nextEmail,
      nextDesignation,
      nextPassword,
      nextPhone,
      nextAddress,
      nextBirthMonth,
      nextBirthDay,
      nextJoinMonth,
      nextJoinDay,
      nextJoinYear,
      nextInviteHash,
      nextInviteExpires,
      req.user.id
    );

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

router.get("/", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
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
    const {
      facilities_csv,
      departments_csv,
      invite_token_hash,
      invite_expires_at,
      admin_grants: rawGrants,
      ...rest
    } = r;
    const invite_status = inviteSvc.inviteStatusForRow({
      invite_token_hash,
      invite_expires_at,
    });
    return {
      ...rest,
      role: canonicalRole(rest.role),
      admin_grants: parseAdminGrantsColumn(rawGrants),
      facility_university_only: Boolean(rest.facility_university_only),
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

router.patch("/manager/leave-requests/:id", supervisorRequired, async (req, res) => {
  try {
    const out = await leaveSvc.decideLeaveRequest(req.user.id, req.params.id, req.body?.status);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

// Direct reports: leave history and course assignment progress (any user with people under them).
router.get("/manager/team-overview", supervisorRequired, async (req, res) => {
  try {
    return res.json(await managerTeamSvc.getTeamOverview(req.user.id));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

/** Before GET /:id — explicit path so it is never shadowed. */
router.post("/:id/resend-invite", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const target = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (canonicalRole(target.role) === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can manage administrator accounts." });
  }
  try {
    const { setup_url, email_sent, email_error } = await issueInviteAndEmail(db, userId);
    return res.json({
      setup_url,
      email_sent,
      email_error: email_error || undefined,
      invite_status: "active",
    });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ message: "User not found" });
    console.error("[users] resend-invite:", e);
    return res.status(500).json({ message: "Could not create invite" });
  }
});

// Admin: fetch a specific user + facilities
router.get("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const user = await db
    .prepare(
      "SELECT id, name, email, role, business_unit, manager_id, profile_image_url, designation, created_at, admin_grants, COALESCE(facility_university_only, 0) AS facility_university_only, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, invite_token_hash, invite_expires_at FROM users WHERE id = ?"
    )
    .get(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (canonicalRole(user.role) === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can open administrator account details." });
  }

  const facRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.params.id);
  const facilities = mergeFacilityAccess(facRows, user.business_unit);

  const departments = await userDeptSvc.listForUser(req.params.id);

  const invite_status = inviteSvc.inviteStatusForRow(user);
  const { invite_token_hash: _h, invite_expires_at: _e, admin_grants: rawAg, ...safe } = user;
  return res.json({
    ...safe,
    role: canonicalRole(safe.role),
    admin_grants: parseAdminGrantsColumn(rawAg),
    facility_university_only: Boolean(safe.facility_university_only),
    facilities,
    departments,
    invite_status,
  });
});

router.post("/", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    business_unit,
    business_units,
    manager_id = null,
    department,
    departments,
    designation,
  } = req.body;
  const adminGrantsInBody = readAdminGrantsFromBody(req.body || {});
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

  const roleNorm = canonicalRole(role);
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE].includes(roleNorm)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  if (roleNorm === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can create administrator accounts." });
  }

  let insertAdminGrants = null;
  if (adminGrantsInBody.present) {
    if (!isFullAdminUser(req.user)) {
      return res.status(403).json({ message: "Only a full administrator can assign administration area access." });
    }
    const g = sanitizeAdminGrantsPayload(adminGrantsInBody.value, { targetIsAdminRole: roleNorm === ROLES.ADMIN });
    if (g.error) return res.status(400).json({ message: g.error });
    if (!g.omit) insertAdminGrants = g.db;
  }

  const facilityUniversityOnlyFlag = parseFacilityUniversityOnlyFlag(
    req.body?.facility_university_only,
    roleNorm
  );
  const uniCheck = validateFacilityUniversityOnlyForUser({
    flag: facilityUniversityOnlyFlag,
    roleNorm,
    businessUnits,
    adminGrantsDb: insertAdminGrants,
  });
  if (!uniCheck.ok) return res.status(400).json({ message: uniCheck.message });

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
  const designationTrim =
    designation !== undefined && designation !== null ? String(designation).trim().slice(0, 120) : "";

  const reportsResolved = await resolveReportsToId(null, manager_id);
  if (!reportsResolved.ok) return res.status(400).json({ message: reportsResolved.message });
  const insertManagerId = reportsResolved.managerId ?? null;

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
        "INSERT INTO users(name, email, password, role, business_unit, manager_id, department, designation, invite_token_hash, invite_expires_at, admin_grants, facility_university_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        name,
        email,
        pwHash,
        roleNorm,
        businessUnits[0],
        insertManagerId,
        primaryDept,
        designationTrim,
        inviteHash,
        inviteExpires,
        insertAdminGrants,
        uniCheck.flag ? 1 : 0
      );

    const userId = result.lastInsertRowid;

    const ins = db.prepare("INSERT OR IGNORE INTO user_facilities(user_id, business_unit) VALUES (?, ?)");
    for (const bu of businessUnits) await ins.run(userId, bu);

    await userDeptSvc.syncForUser(userId, deptList);

    await syncUserAssignmentsForFacilities(userId);

    if (useInvite) {
      const setupUrl = `${inviteSvc.publicAppBaseUrl()}/invite?token=${encodeURIComponent(rawInviteToken)}`;
      const mail = await emailSvc.deliverAccountInviteEmail({
        to: String(email).trim(),
        name: String(name).trim(),
        setupUrl,
        validDays: inviteSvc.INVITE_DAYS,
      });
      return res.status(201).json({
        id: userId,
        invite: true,
        setup_url: setupUrl,
        email_sent: mail.email_sent === true,
        email_error: mail.email_error || undefined,
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
    if (code === "23503" || /foreign key/i.test(msg)) {
      return res.status(400).json({ message: "Invalid manager or related data. Check manager selection." });
    }
    console.error("[users] create user:", e);
    return res.status(400).json({
      message: "Could not create user",
      detail: msg ? msg.slice(0, 400) : undefined,
    });
  }
});

router.put("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const {
    name,
    email,
    role,
    business_unit,
    business_units,
    manager_id,
    password,
    department,
    departments,
    designation,
  } = req.body;
  const adminGrantsInBody = readAdminGrantsFromBody(req.body || {});
  const existing = await db
    .prepare(
      `SELECT id, name, email, role, business_unit, manager_id, password, department, designation, profile_image_url, created_at,
              invite_token_hash, invite_expires_at, admin_grants, COALESCE(facility_university_only, 0) AS facility_university_only
       FROM users WHERE id = ?`
    )
    .get(userId);
  if (!existing) return res.status(404).json({ message: "User not found" });
  if (canonicalRole(existing.role) === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can edit administrator accounts." });
  }

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
  const nextDesignation =
    designation !== undefined && designation !== null
      ? String(designation).trim().slice(0, 120)
      : existing.designation != null
        ? String(existing.designation)
        : "";
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
    const reportsResolved = await resolveReportsToId(userId, manager_id);
    if (!reportsResolved.ok) return res.status(400).json({ message: reportsResolved.message });
    if (reportsResolved.managerId !== undefined) {
      nextManagerId = reportsResolved.managerId;
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

  const nextRole =
    role !== undefined && role !== null && String(role).trim() !== ""
      ? canonicalRole(role)
      : canonicalRole(existing.role);
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE].includes(nextRole)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  if (nextRole === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can assign the administrator role." });
  }

  let nextAdminGrantsDb;
  if (adminGrantsInBody.present) {
    if (!isFullAdminUser(req.user)) {
      return res.status(403).json({ message: "Only a full administrator can change administration area access." });
    }
    const g = sanitizeAdminGrantsPayload(adminGrantsInBody.value, { targetIsAdminRole: nextRole === ROLES.ADMIN });
    if (g.error) return res.status(400).json({ message: g.error });
    if (g.omit) {
      const parsedExisting = parseAdminGrantsColumn(existing.admin_grants);
      nextAdminGrantsDb = parsedExisting ? JSON.stringify(parsedExisting) : null;
    } else {
      nextAdminGrantsDb = g.db;
    }
  } else {
    const parsed = parseAdminGrantsColumn(existing.admin_grants);
    nextAdminGrantsDb = parsed ? JSON.stringify(parsed) : null;
  }
  if (nextAdminGrantsDb === undefined) nextAdminGrantsDb = null;

  let nextFacilityUniversityOnly = Boolean(Number(existing.facility_university_only) === 1);
  if (Object.prototype.hasOwnProperty.call(req.body, "facility_university_only")) {
    nextFacilityUniversityOnly = parseFacilityUniversityOnlyFlag(req.body.facility_university_only, nextRole);
  } else if (nextRole === ROLES.ADMIN) {
    nextFacilityUniversityOnly = false;
  }

  const uniPut = validateFacilityUniversityOnlyForUser({
    flag: nextFacilityUniversityOnly,
    roleNorm: nextRole,
    businessUnits: newFacilities,
    adminGrantsDb: nextAdminGrantsDb,
  });
  if (!uniPut.ok) return res.status(400).json({ message: uniPut.message });

  try {
    await db
      .prepare(
        "UPDATE users SET name=?, email=?, role=?, business_unit=?, manager_id=?, password=?, department=?, designation=?, invite_token_hash=?, invite_expires_at=?, admin_grants=?, facility_university_only=? WHERE id=?"
      )
      .run(
        nextName,
        nextEmail,
        nextRole,
        newFacilities[0],
        nextManagerId == null ? null : nextManagerId,
        newPassword,
        newDept,
        nextDesignation,
        nextInviteHash,
        nextInviteExpires,
        nextAdminGrantsDb,
        uniPut.flag ? 1 : 0,
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
        designation,
        manager_id,
        admin_grants,
        COALESCE(facility_university_only, 0) AS facility_university_only
       FROM users WHERE id = ?`
    )
    .get(userId);

  const departmentsOut = await userDeptSvc.listForUser(userId);
  const { admin_grants: rawAg2, ...updatedRest } = updated;

  return res.json({
    message: "User updated",
    user: {
      ...updatedRest,
      admin_grants: parseAdminGrantsColumn(rawAg2),
      facility_university_only: Boolean(updatedRest.facility_university_only),
      departments: departmentsOut,
    },
  });
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
      await client.query(`DELETE FROM manager_all_training_alerts WHERE manager_id = $1 OR employee_id = $1`, [uid]);
      await client.query(`DELETE FROM employee_notifications WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM all_training_milestones WHERE employee_id = $1`, [uid]);
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
  await db
    .prepare(`DELETE FROM manager_all_training_alerts WHERE manager_id = ? OR employee_id = ?`)
    .run(userId, userId);
  await db.prepare(`DELETE FROM employee_notifications WHERE user_id = ?`).run(userId);
  await db.prepare(`DELETE FROM all_training_milestones WHERE employee_id = ?`).run(userId);
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

router.delete("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.USERS), async (req, res) => {
  const userId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account." });
  }
  const victim = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!victim) return res.status(404).json({ message: "User not found" });
  if (canonicalRole(victim.role) === ROLES.ADMIN && !isFullAdminUser(req.user)) {
    return res.status(403).json({ message: "Only a full administrator can delete administrator accounts." });
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
