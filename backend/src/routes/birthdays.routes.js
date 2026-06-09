const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");

const { anniversaryYearsEmployed } = require("../utils/profileDates");
const { portalTodayParts, daysUntilMonthDay, monthDayLabel, parseRangeDays } = require("../utils/portalDate");

const router = express.Router();

function validMonthDay(month, day) {
  const mo = Number(month);
  const da = Number(day);
  if (!Number.isFinite(mo) || !Number.isFinite(da) || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return { month: mo, day: da };
}

function shapeCelebrationRow(row, inDays, todayParts) {
  return {
    id: row.id,
    name: row.name,
    facility_name: row.facility_name,
    company_name: row.company_name,
    department: row.department,
    profile_image_url: row.profile_image_url,
    label: inDays === 0 ? monthDayLabel(todayParts.month, todayParts.day) : monthDayLabel(row.month, row.day),
    in_days: inDays,
  };
}

async function loadProfileBirthdayCandidates() {
  const userRows = await db
    .prepare(
      "SELECT id, name, business_unit, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, profile_image_url, birth_month, birth_day FROM users WHERE birth_month IS NOT NULL AND birth_day IS NOT NULL"
    )
    .all();

  const candidates = [];
  for (const r of Array.isArray(userRows) ? userRows : []) {
    const md = validMonthDay(r.birth_month, r.birth_day);
    if (!md) continue;
    candidates.push({
      id: r.id,
      name: r.name != null ? String(r.name) : "",
      facility_name: r.business_unit != null ? String(r.business_unit) : "",
      company_name: r.business_unit != null ? String(r.business_unit) : "",
      department: r.department != null ? String(r.department) : "",
      profile_image_url: r.profile_image_url != null ? String(r.profile_image_url) : "",
      month: md.month,
      day: md.day,
    });
  }
  return candidates;
}

async function loadProfileAnniversaryCandidates() {
  const annRows = await db
    .prepare(
      "SELECT id, name, business_unit, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department, profile_image_url, join_month, join_day, join_year FROM users WHERE join_month IS NOT NULL AND join_day IS NOT NULL AND join_year IS NOT NULL"
    )
    .all();

  const candidates = [];
  for (const r of Array.isArray(annRows) ? annRows : []) {
    const md = validMonthDay(r.join_month, r.join_day);
    if (!md) continue;
    candidates.push({
      id: r.id,
      name: r.name != null ? String(r.name) : "",
      facility_name: r.business_unit != null ? String(r.business_unit) : "",
      company_name: r.business_unit != null ? String(r.business_unit) : "",
      department: r.department != null ? String(r.department) : "",
      profile_image_url: r.profile_image_url != null ? String(r.profile_image_url) : "",
      month: md.month,
      day: md.day,
      join_year: Number(r.join_year),
    });
  }
  return candidates;
}

/** Celebrations from user profiles — popups use today; dashboard sidebar uses upcoming within `days`. */
router.get("/feed", authRequired, async (req, res) => {
  const rangeDays = parseRangeDays(req.query?.days, 14);
  const todayParts = portalTodayParts();
  const refDate = new Date(todayParts.year, todayParts.month - 1, todayParts.day);

  const birthdayCandidates = await loadProfileBirthdayCandidates();
  const today = [];
  const upcoming = [];

  for (const row of birthdayCandidates) {
    const inDays = daysUntilMonthDay(todayParts, row.month, row.day);
    if (inDays == null || inDays > rangeDays) continue;
    const shaped = shapeCelebrationRow(row, inDays, todayParts);
    if (inDays === 0) today.push(shaped);
    else upcoming.push(shaped);
  }
  today.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  upcoming.sort((a, b) => (a.in_days - b.in_days) || String(a.name).localeCompare(String(b.name)));

  const anniversaryCandidates = await loadProfileAnniversaryCandidates();
  const anniversaries_today = [];
  const anniversaries_upcoming = [];

  for (const row of anniversaryCandidates) {
    const inDays = daysUntilMonthDay(todayParts, row.month, row.day);
    if (inDays == null || inDays > rangeDays) continue;
    const shaped = {
      ...shapeCelebrationRow(row, inDays, todayParts),
      years_employed: anniversaryYearsEmployed(row.join_year, refDate),
    };
    if (inDays === 0) anniversaries_today.push(shaped);
    else anniversaries_upcoming.push(shaped);
  }
  anniversaries_today.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  anniversaries_upcoming.sort(
    (a, b) => (a.in_days - b.in_days) || String(a.name).localeCompare(String(b.name))
  );

  return res.json({
    today,
    upcoming,
    anniversaries_today,
    anniversaries_upcoming,
    range_days: rangeDays,
  });
});

module.exports = router;
