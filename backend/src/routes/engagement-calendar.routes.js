const express = require("express");
const { db, isPostgres, getPool } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const {
  DEFAULT_YEAR,
  defaultDataJson,
  normalizeEngagementMonths,
} = require("../data/engagementCalendarDefault");

const router = express.Router();

function parseDataJson(row) {
  if (!row || !row.data_json) return null;
  const raw = row.data_json;
  if (typeof raw === "object" && raw !== null && !Buffer.isBuffer(raw)) {
    return raw;
  }
  const s = String(raw);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function shapeResponse(row) {
  if (!row) return null;
  const data = parseDataJson(row) || {};
  const subtitle = data.subtitle != null ? String(data.subtitle).trim() : "";
  const monthsNorm = normalizeEngagementMonths(data.months);
  const months =
    monthsNorm || JSON.parse(defaultDataJson()).months;
  return {
    year: Number(row.year),
    subtitle,
    months,
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  };
}

function validatePayload(body) {
  const year = Number(body?.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: "year must be between 2000 and 2100" };
  }
  const subtitle = body.subtitle != null ? String(body.subtitle).trim() : "";
  if (subtitle.length > 2000) return { error: "subtitle is too long" };
  const months = normalizeEngagementMonths(body.months);
  if (!months) {
    return { error: "months must be an array of exactly 12 entries" };
  }
  return { year, data: { subtitle, months } };
}

router.get("/", authRequired, async (req, res) => {
  try {
    let row;
    if (isPostgres) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT year, data_json, updated_at FROM engagement_calendar ORDER BY updated_at DESC NULLS LAST, year DESC LIMIT 1`
      );
      row = r.rows[0];
    } else {
      row = await db
        .prepare(
          `SELECT year, data_json, updated_at FROM engagement_calendar ORDER BY updated_at DESC, year DESC LIMIT 1`
        )
        .get();
    }

    if (!row) {
      const data = JSON.parse(defaultDataJson());
      return res.json({
        year: DEFAULT_YEAR,
        subtitle: data.subtitle,
        months: data.months,
        updatedAt: null,
      });
    }

    return res.json(shapeResponse(row));
  } catch (e) {
    console.error("engagement-calendar GET:", e);
    return res.status(500).json({ message: "Could not load engagement calendar" });
  }
});

router.put("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR), async (req, res) => {
  const v = validatePayload(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const { year, data } = v;
  const jsonStr = JSON.stringify(data);

  try {
    const nowIso = new Date().toISOString();
    if (isPostgres) {
      const pool = getPool();
      await pool.query(
        `
        INSERT INTO engagement_calendar (year, data_json, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (year) DO UPDATE SET
          data_json = EXCLUDED.data_json,
          updated_at = NOW()
        `,
        [year, jsonStr]
      );
      const r = await pool.query(`SELECT year, data_json, updated_at FROM engagement_calendar WHERE year = $1`, [
        year,
      ]);
      return res.json(shapeResponse(r.rows[0]));
    }

    const existing = await db.prepare("SELECT id FROM engagement_calendar WHERE year = ?").get(year);
    if (existing) {
      await db
        .prepare("UPDATE engagement_calendar SET data_json = ?, updated_at = ? WHERE year = ?")
        .run(jsonStr, nowIso, year);
    } else {
      await db.prepare("INSERT INTO engagement_calendar (year, data_json, updated_at) VALUES (?, ?, ?)").run(
        year,
        jsonStr,
        nowIso
      );
    }
    const row = await db.prepare("SELECT year, data_json, updated_at FROM engagement_calendar WHERE year = ?").get(year);
    return res.json(shapeResponse(row));
  } catch (e) {
    console.error("engagement-calendar PUT:", e);
    return res.status(500).json({ message: e.message || "Could not save engagement calendar" });
  }
});

module.exports = router;
