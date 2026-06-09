const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");

const { anniversaryYearsEmployed } = require("../utils/profileDates");
const { portalTodayParts, daysUntilMonthDay, monthDayLabel, parseRangeDays } = require("../utils/portalDate");

const router = express.Router();

function normalizeDob(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  // Basic day validation (avoid Date parsing timezone surprises by validating via UTC).
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shapeRow(r) {
  if (!r || typeof r !== "object") return r;
  return {
    id: r.id,
    name: r.name != null ? String(r.name) : "",
    // Stored as `company_name` in DB (legacy), exposed as `facility_name` to the UI.
    facility_name: r.company_name != null ? String(r.company_name) : "",
    company_name: r.company_name != null ? String(r.company_name) : "",
    department: r.department != null ? String(r.department) : "",
    dob: r.dob != null ? String(r.dob) : "",
    profile_image_url: r.profile_image_url != null ? String(r.profile_image_url) : "",
    created_at: r.created_at != null ? String(r.created_at) : null,
  };
}

// Admin CRUD
router.get("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.BIRTHDAYS), async (_req, res) => {
  const rows = await db.prepare("SELECT * FROM birthday_list ORDER BY dob ASC, name ASC, id ASC").all();
  return res.json((Array.isArray(rows) ? rows : []).map(shapeRow));
});

router.post("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.BIRTHDAYS), async (req, res) => {
  const name = req.body?.name != null ? String(req.body.name).trim() : "";
  const facilityRaw =
    req.body?.facility_name != null
      ? req.body.facility_name
      : req.body?.company_name != null
        ? req.body.company_name
        : "";
  const facility_name = String(facilityRaw).trim().toUpperCase();
  const department = req.body?.department != null ? String(req.body.department).trim() : "";
  const dob = normalizeDob(req.body?.dob);
  if (!name) return res.status(400).json({ message: "name is required" });
  if (!facility_name) return res.status(400).json({ message: "facility_name is required" });
  if (!department) return res.status(400).json({ message: "department is required" });
  if (!dob) return res.status(400).json({ message: "dob must be YYYY-MM-DD" });

  const result = await db
    .prepare("INSERT INTO birthday_list(name, company_name, department, dob) VALUES (?, ?, ?, ?)")
    .run(name.slice(0, 120), facility_name.slice(0, 160), department.slice(0, 120), dob);
  const row = await db.prepare("SELECT * FROM birthday_list WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(shapeRow(row));
});

router.put("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.BIRTHDAYS), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM birthday_list WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : String(existing.name || "").trim();
  const facilityRaw =
    req.body?.facility_name !== undefined
      ? req.body.facility_name
      : req.body?.company_name !== undefined
        ? req.body.company_name
        : undefined;
  const facility_name =
    facilityRaw !== undefined
      ? String(facilityRaw).trim().toUpperCase()
      : String(existing.company_name || "").trim().toUpperCase();
  const department =
    req.body?.department !== undefined ? String(req.body.department).trim() : String(existing.department || "").trim();
  const dob = req.body?.dob !== undefined ? normalizeDob(req.body.dob) : normalizeDob(existing.dob);

  if (!name) return res.status(400).json({ message: "name is required" });
  if (!facility_name) return res.status(400).json({ message: "facility_name is required" });
  if (!department) return res.status(400).json({ message: "department is required" });
  if (!dob) return res.status(400).json({ message: "dob must be YYYY-MM-DD" });

  await db
    .prepare("UPDATE birthday_list SET name = ?, company_name = ?, department = ?, dob = ? WHERE id = ?")
    .run(name.slice(0, 120), facility_name.slice(0, 160), department.slice(0, 120), dob, req.params.id);
  const row = await db.prepare("SELECT * FROM birthday_list WHERE id = ?").get(req.params.id);
  return res.json(shapeRow(row));
});

router.delete("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.BIRTHDAYS), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM birthday_list WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  await db.prepare("DELETE FROM birthday_list WHERE id = ?").run(req.params.id);
  return res.json({ message: "Deleted" });
});

/**
 * Below-nav feed for all authenticated users.
 * Returns birthdays that fall within the next N days (inclusive), plus today's.
 *
 * Response shape:
 * {
 *   today: [{ id, name, department, dob, label }],
 *   upcoming: [{ id, name, department, dob, label, in_days }],
 *   range_days: number
 * }
 */
function shapeCelebrationRow(row, inDays, todayParts) {
  const label = monthDayLabel(row.month, row.day);
  const base = {
    id: row.id,
    name: row.name,
    facility_name: row.facility_name,
    company_name: row.company_name,
    department: row.department,
    profile_image_url: row.profile_image_url,
    label,
    in_days: inDays,
  };
  if (inDays === 0) {
    base.label = monthDayLabel(todayParts.month, todayParts.day);
  }
  return base;
}

function dedupeBirthdayCandidates(candidates) {
  const byKey = new Map();
  for (const c of candidates) {
    const key = `${c.month}-${c.day}-${c.name.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || (existing.source === "list" && c.source === "user")) {
      byKey.set(key, c);
    }
  }
  return [...byKey.values()];
}

async function loadBirthdayCandidates() {
  const userRows = await db
    .prepare(
      "SELECT id, name, business_unit, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, profile_image_url, birth_month, birth_day FROM users WHERE birth_month IS NOT NULL AND birth_day IS NOT NULL"
    )
    .all();
  const listRows = await db
    .prepare("SELECT id, name, company_name, department, dob FROM birthday_list WHERE dob IS NOT NULL AND TRIM(dob) <> ''")
    .all();

  const candidates = [];
  for (const r of Array.isArray(userRows) ? userRows : []) {
    candidates.push({
      id: r.id,
      name: r.name != null ? String(r.name) : "",
      facility_name: r.business_unit != null ? String(r.business_unit) : "",
      company_name: r.business_unit != null ? String(r.business_unit) : "",
      department: r.department != null ? String(r.department) : "",
      profile_image_url: r.profile_image_url != null ? String(r.profile_image_url) : "",
      month: Number(r.birth_month),
      day: Number(r.birth_day),
      source: "user",
    });
  }
  for (const r of Array.isArray(listRows) ? listRows : []) {
    const dob = normalizeDob(r.dob);
    if (!dob) continue;
    candidates.push({
      id: `bl-${r.id}`,
      name: r.name != null ? String(r.name) : "",
      facility_name: r.company_name != null ? String(r.company_name) : "",
      company_name: r.company_name != null ? String(r.company_name) : "",
      department: r.department != null ? String(r.department) : "",
      profile_image_url: "",
      month: Number(dob.slice(5, 7)),
      day: Number(dob.slice(8, 10)),
      source: "list",
    });
  }
  return dedupeBirthdayCandidates(candidates);
}

router.get("/feed", authRequired, async (req, res) => {
  const rangeDays = parseRangeDays(req.query?.days, 14);
  const todayParts = portalTodayParts();
  const refDate = new Date(todayParts.year, todayParts.month - 1, todayParts.day);

  const candidates = await loadBirthdayCandidates();
  const today = [];
  const upcoming = [];

  for (const row of candidates) {
    const inDays = daysUntilMonthDay(todayParts, row.month, row.day);
    if (inDays == null || inDays > rangeDays) continue;
    const shaped = shapeCelebrationRow(row, inDays, todayParts);
    if (inDays === 0) today.push(shaped);
    else upcoming.push(shaped);
  }

  today.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  upcoming.sort((a, b) => (a.in_days - b.in_days) || String(a.name).localeCompare(String(b.name)));

  const annRows = await db
    .prepare(
      "SELECT id, name, business_unit, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, profile_image_url, join_month, join_day, join_year FROM users WHERE join_month IS NOT NULL AND join_day IS NOT NULL"
    )
    .all();

  const anniversaries_today = [];
  for (const r of Array.isArray(annRows) ? annRows : []) {
    const inDays = daysUntilMonthDay(todayParts, r.join_month, r.join_day);
    if (inDays !== 0) continue;
    anniversaries_today.push({
      id: r.id,
      name: r.name != null ? String(r.name) : "",
      facility_name: r.business_unit != null ? String(r.business_unit) : "",
      company_name: r.business_unit != null ? String(r.business_unit) : "",
      department: r.department != null ? String(r.department) : "",
      profile_image_url: r.profile_image_url != null ? String(r.profile_image_url) : "",
      label: monthDayLabel(todayParts.month, todayParts.day),
      years_employed: anniversaryYearsEmployed(r.join_year, refDate),
      in_days: 0,
    });
  }
  anniversaries_today.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return res.json({ today, upcoming, anniversaries_today, range_days: rangeDays });
});

module.exports = router;

