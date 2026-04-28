const express = require("express");
const { db, isPostgres, getPool } = require("../config/db");
const { ROLES, BUSINESS_UNITS } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");
const { mergeFacilityAccess } = require("../utils/businessUnitCodes");

const router = express.Router();

const ORDER_SQLITE = `COALESCE(NULLIF(TRIM(event_at), ''), NULLIF(TRIM(show_from_at), ''), NULLIF(TRIM(start_at), ''), created_at) ASC, sort_order ASC, id ASC`;
const ORDER_PG = `COALESCE(NULLIF(TRIM(COALESCE(event_at, '')), ''), NULLIF(TRIM(COALESCE(show_from_at, '')), ''), NULLIF(TRIM(COALESCE(start_at, '')), ''), created_at::text) ASC, sort_order ASC, id ASC`;

/** Facilities the user may see upcoming events for (member: profile; admin: all sites). */
async function facilitiesForUpcomingUser(user) {
  if (String(user.role || "").trim() === ROLES.ADMIN) {
    return [...BUSINESS_UNITS];
  }
  let rows = [];
  if (isPostgres) {
    const pool = getPool();
    if (!pool) return [];
    const r = await pool.query(
      "SELECT business_unit FROM user_facilities WHERE user_id = $1 ORDER BY business_unit ASC",
      [user.id]
    );
    rows = r.rows || [];
  } else {
    rows = await db
      .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
      .all(user.id);
  }

  return mergeFacilityAccess(rows, user.business_unit);
}

function normalizeDateInput(v) {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim();
  if (!raw) return null;

  let s = raw;
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) {
    s = s.replace(/^(\d{4}-\d{2}-\d{2})[ ](.+)$/, "$1T$2");
  }
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Parse `business_units` JSON from DB; fallback to legacy `business_unit` column. */
function normalizeBusinessUnitsArray(row) {
  if (row.business_units != null && String(row.business_units).trim() !== "") {
    try {
      const p = JSON.parse(row.business_units);
      if (Array.isArray(p)) {
        const set = new Set(p.map((x) => String(x ?? "").trim().toUpperCase()));
        return BUSINESS_UNITS.filter((u) => set.has(u));
      }
    } catch {
      /* ignore */
    }
  }
  const bu = row.business_unit != null ? String(row.business_unit).trim().toUpperCase() : "";
  return bu && BUSINESS_UNITS.includes(bu) ? [bu] : [];
}

/** sql.js rows + JSON: ensure stable keys for the React admin UI. */
function shapeUpcomingRow(row) {
  if (!row || typeof row !== "object") return row;
  const business_units = normalizeBusinessUnitsArray(row);
  return {
    ...row,
    business_units,
    start_at: row.start_at != null ? String(row.start_at) : null,
    end_at: row.end_at != null ? String(row.end_at) : null,
    show_from_at: row.show_from_at != null ? String(row.show_from_at) : null,
    event_at: row.event_at != null ? String(row.event_at) : null,
  };
}

/**
 * Published, non-expired events across all facilities the user can access.
 */
router.get("/feed", authRequired, async (req, res) => {
  const facs = await facilitiesForUpcomingUser(req.user);
  if (facs.length === 0) return res.json([]);

  const nowIso = new Date().toISOString();
  let rows;
  if (isPostgres) {
    const pool = getPool();
    const r = await pool.query(
      `
      SELECT *
      FROM facility_upcoming
      WHERE (
        business_unit = ANY($1::text[])
        OR EXISTS (
          SELECT 1 FROM unnest($1::text[]) AS u(bu)
          WHERE POSITION(('"' || u.bu || '"') IN COALESCE(business_units, '')) > 0
        )
      )
        AND COALESCE(published, 1) = 1
        AND (show_from_at IS NULL OR TRIM(COALESCE(show_from_at, '')) = '' OR show_from_at <= $2)
        AND (end_at IS NULL OR TRIM(COALESCE(end_at, '')) = '' OR end_at > $3)
      ORDER BY ${ORDER_PG}
      `,
      [facs, nowIso, nowIso]
    );
    rows = r.rows;
  } else {
    const ph = facs.map(() => "?").join(", ");
    const instrFallback = facs.map(() => `INSTR(COALESCE(business_units, ''), '"' || ? || '"') > 0`).join(" OR ");
    const sql = `
    SELECT *
    FROM facility_upcoming
    WHERE (
      business_unit IN (${ph})
      OR EXISTS (
        SELECT 1 FROM json_each(business_units) AS j
        WHERE j.value IN (${ph})
      )
      OR (${instrFallback})
    )
      AND COALESCE(published, 1) = 1
      AND (show_from_at IS NULL OR TRIM(IFNULL(show_from_at, '')) = '' OR show_from_at <= ?)
      AND (end_at IS NULL OR TRIM(end_at) = '' OR end_at > ?)
    ORDER BY ${ORDER_SQLITE}
  `;
    rows = await db.prepare(sql).all(...facs, ...facs, ...facs, nowIso, nowIso);
  }
  return res.json(rows.map(shapeUpcomingRow));
});

router.get("/", authRequired, async (req, res) => {
  const raw = req.query.business_unit;
  const bu = Array.isArray(raw) ? raw[0] : raw;

  if (req.user.role === ROLES.ADMIN && !bu) {
    const rows = isPostgres
      ? (await getPool().query(`SELECT * FROM facility_upcoming ORDER BY ${ORDER_PG}`)).rows
      : await db.prepare(`SELECT * FROM facility_upcoming ORDER BY ${ORDER_SQLITE}`).all();
    return res.json(rows.map(shapeUpcomingRow));
  }

  const buNorm = String(bu).trim().toUpperCase();
  if (!buNorm || !BUSINESS_UNITS.includes(buNorm)) {
    return res.status(400).json({ message: "business_unit query is required (AGC, AQM, SCF, or ASP)" });
  }
  const nowIso = new Date().toISOString();
  let rows;
  if (isPostgres) {
    const pool = getPool();
    const r = await pool.query(
      `
      SELECT *
      FROM facility_upcoming
      WHERE (
          business_unit = $1
          OR POSITION(('"' || $1 || '"') IN COALESCE(business_units, '')) > 0
        )
        AND COALESCE(published, 1) = 1
        AND (show_from_at IS NULL OR TRIM(COALESCE(show_from_at, '')) = '' OR show_from_at <= $2)
        AND (end_at IS NULL OR TRIM(COALESCE(end_at, '')) = '' OR end_at > $3)
      ORDER BY ${ORDER_PG}
      `,
      [buNorm, nowIso, nowIso]
    );
    rows = r.rows;
  } else {
    rows = await db
      .prepare(
        `
      SELECT *
      FROM facility_upcoming
      WHERE (
          business_unit = ?
          OR EXISTS (SELECT 1 FROM json_each(business_units) AS j WHERE j.value = ?)
          OR INSTR(COALESCE(business_units, ''), '"' || ? || '"') > 0
        )
        AND COALESCE(published, 1) = 1
        AND (show_from_at IS NULL OR TRIM(IFNULL(show_from_at, '')) = '' OR show_from_at <= ?)
        AND (end_at IS NULL OR TRIM(end_at) = '' OR end_at > ?)
      ORDER BY ${ORDER_SQLITE}
      `
      )
      .all(buNorm, buNorm, buNorm, nowIso, nowIso);
  }
  return res.json(rows.map(shapeUpcomingRow));
});

function toPublishedFlag(v) {
  if (v === undefined || v === null) return 1;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  if (n === 0 || n === 1) return n;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "draft") return 0;
  return 1;
}

function normalizeImageUrl(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, 2048);
}

/** Resolve one or many facilities from body: `business_units` (preferred) or legacy `business_unit`. */
function resolveBusinessUnitsFromBody(body) {
  let raw = body?.business_units;
  if (raw != null && !Array.isArray(raw)) {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) raw = parsed;
      } catch {
        /* ignore */
      }
    }
    if (!Array.isArray(raw) && typeof raw === "object") {
      raw = Object.values(raw);
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const seen = new Set();
    for (const u of raw) {
      const s = String(u ?? "").trim().toUpperCase();
      if (BUSINESS_UNITS.includes(s)) seen.add(s);
    }
    return BUSINESS_UNITS.filter((u) => seen.has(u));
  }
  const single = body?.business_unit != null ? String(body.business_unit).trim().toUpperCase() : "";
  if (single && BUSINESS_UNITS.includes(single)) return [single];
  return [];
}

router.post("/", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { title, detail, start_at, end_at, published, image_url, show_from_at, event_at } = req.body;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ message: "title is required" });
  }

  const units = resolveBusinessUnitsFromBody(req.body);
  if (units.length === 0) {
    return res.status(400).json({ message: "Select at least one facility (business_units or business_unit)" });
  }

  const normShowFrom = show_from_at !== undefined ? normalizeDateInput(show_from_at) : null;
  const normEvent =
    event_at !== undefined ? normalizeDateInput(event_at) : start_at !== undefined ? normalizeDateInput(start_at) : null;
  const normEnd = normalizeDateInput(end_at);
  if (show_from_at !== undefined && String(show_from_at).trim() && !normShowFrom) {
    return res.status(400).json({ message: "Invalid show_from_at" });
  }
  if (event_at !== undefined && String(event_at).trim() && !normEvent) {
    return res.status(400).json({ message: "Invalid event_at" });
  }
  if (start_at !== undefined && event_at === undefined && String(start_at).trim() && !normEvent) {
    return res.status(400).json({ message: "Invalid start_at" });
  }
  if (end_at !== undefined && String(end_at).trim() && !normEnd) {
    return res.status(400).json({ message: "Invalid end_at" });
  }
  if (normShowFrom && normEnd && Date.parse(normEnd) <= Date.parse(normShowFrom)) {
    return res.status(400).json({ message: "Hide after must be after show in list from" });
  }

  const pub = toPublishedFlag(published);
  const nextImg = normalizeImageUrl(image_url);
  const titleTrim = title.trim();
  const detailTrim = (detail && String(detail).trim()) || null;

  const primaryBu = units[0];
  const unitsJson = JSON.stringify(units);
  const maxRow = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM facility_upcoming").get();
  const sort_order = Number(maxRow.m) + 1;

  const result = await db
    .prepare(
      "INSERT INTO facility_upcoming (business_unit, business_units, title, detail, start_at, end_at, sort_order, published, image_url, show_from_at, event_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      primaryBu,
      unitsJson,
      titleTrim,
      detailTrim,
      normEnd,
      sort_order,
      pub,
      nextImg,
      normShowFrom,
      normEvent
    );

  const row = await db.prepare("SELECT * FROM facility_upcoming WHERE id = ?").get(result.lastInsertRowid);
  const shaped = shapeUpcomingRow(row);
  return res.status(201).json({ created: [shaped], count: 1 });
});

router.put("/:id", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM facility_upcoming WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  const { business_unit, title, detail, start_at, end_at, published, image_url, show_from_at, event_at } = req.body;

  const unitsFromBody = resolveBusinessUnitsFromBody(req.body);
  let nextBu = String(existing.business_unit || "").trim().toUpperCase();
  let nextUnitsJson = existing.business_units;

  if (unitsFromBody.length > 0) {
    nextBu = unitsFromBody[0];
    nextUnitsJson = JSON.stringify(unitsFromBody);
  } else if (business_unit !== undefined && business_unit !== null) {
    const s = String(business_unit).trim();
    if (s !== "") {
      const su = s.toUpperCase();
      if (!BUSINESS_UNITS.includes(su)) {
        return res.status(400).json({ message: "Invalid business_unit" });
      }
      nextBu = su;
      nextUnitsJson = JSON.stringify([su]);
    }
  }
  if (!nextUnitsJson || String(nextUnitsJson).trim() === "") {
    nextUnitsJson = JSON.stringify(BUSINESS_UNITS.includes(nextBu) ? [nextBu] : ["AGC"]);
  }
  if (!BUSINESS_UNITS.includes(nextBu)) {
    return res.status(400).json({ message: "Invalid business_unit" });
  }

  const nextTitle = title !== undefined ? String(title).trim() : existing.title;
  if (!nextTitle) return res.status(400).json({ message: "title is required" });

  const nextDetail = detail !== undefined ? (detail && String(detail).trim()) || null : existing.detail;

  let nextShowFrom = existing.show_from_at;
  if (show_from_at !== undefined) nextShowFrom = normalizeDateInput(show_from_at);

  let nextEvent = existing.event_at;
  if (event_at !== undefined) nextEvent = normalizeDateInput(event_at);
  else if (start_at !== undefined) nextEvent = normalizeDateInput(start_at);

  const nextEnd = end_at !== undefined ? normalizeDateInput(end_at) : existing.end_at;

  if (show_from_at !== undefined && String(show_from_at).trim() && !nextShowFrom) {
    return res.status(400).json({ message: "Invalid show_from_at" });
  }
  if (event_at !== undefined && String(event_at).trim() && !nextEvent) {
    return res.status(400).json({ message: "Invalid event_at" });
  }
  if (start_at !== undefined && event_at === undefined && String(start_at).trim() && !nextEvent) {
    return res.status(400).json({ message: "Invalid start_at" });
  }
  if (end_at !== undefined && String(end_at).trim() && !nextEnd) {
    return res.status(400).json({ message: "Invalid end_at" });
  }

  if (nextShowFrom && nextEnd && Date.parse(nextEnd) <= Date.parse(nextShowFrom)) {
    return res.status(400).json({ message: "Hide after must be after show in list from" });
  }

  const nextPub = published !== undefined ? toPublishedFlag(published) : toPublishedFlag(existing.published);

  const nextImage = image_url !== undefined ? normalizeImageUrl(image_url) : existing.image_url;

  if (image_url !== undefined && existing.image_url && nextImage !== existing.image_url) {
    try {
      await deleteLessonVideoByUrl(existing.image_url);
    } catch (e) {
      console.error("Upcoming image replace delete:", e);
    }
  }

  await db
    .prepare(
      "UPDATE facility_upcoming SET business_unit = ?, business_units = ?, title = ?, detail = ?, end_at = ?, published = ?, image_url = ?, show_from_at = ?, event_at = ? WHERE id = ?"
    )
    .run(nextBu, nextUnitsJson, nextTitle, nextDetail, nextEnd, nextPub, nextImage, nextShowFrom, nextEvent, req.params.id);

  const row = await db.prepare("SELECT * FROM facility_upcoming WHERE id = ?").get(req.params.id);
  return res.json(shapeUpcomingRow(row));
});

router.delete("/:id", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM facility_upcoming WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  if (existing.image_url) {
    try {
      await deleteLessonVideoByUrl(existing.image_url);
    } catch (e) {
      console.error("Upcoming image delete:", e);
    }
  }
  await db.prepare("DELETE FROM facility_upcoming WHERE id = ?").run(req.params.id);
  return res.json({ message: "Deleted" });
});

module.exports = router;
