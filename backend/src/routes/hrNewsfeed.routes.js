const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");

const router = express.Router();

const VALID_FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
const VALID_DEPARTMENTS = [
  "HR", "Social Committee", "IT", "Finance", "Safety",
  "Production", "FSQA", "Management", "Other",
];

function parseFacilities(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return VALID_FACILITIES.filter((f) => parsed.includes(f));
  } catch {}
  return [];
}

function shapeRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    facilities: parseFacilities(row.facilities),
    published: row.published !== 0 && row.published !== false,
  };
}

function normalizeImageUrl(v) {
  if (!v) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 2048) : null;
}

// GET /hr-newsfeed/current — published items, all authenticated users
router.get("/current", authRequired, async (req, res) => {
  const rows = await db
    .prepare(
      "SELECT * FROM hr_newsfeed WHERE COALESCE(published, 1) = 1 ORDER BY sort_order ASC, created_at DESC"
    )
    .all();
  return res.json(rows.map(shapeRow));
});

// GET /hr-newsfeed/ — admin list (all, including drafts)
router.get("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.HR_NEWSFEED), async (req, res) => {
  const rows = await db
    .prepare("SELECT * FROM hr_newsfeed ORDER BY sort_order ASC, created_at DESC")
    .all();
  return res.json(rows.map(shapeRow));
});

// POST /hr-newsfeed/ — create
router.post("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.HR_NEWSFEED), async (req, res) => {
  const { title, body, image_url, facilities, department, published } = req.body;
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ message: "title is required" });
  }

  const facilitiesArr = Array.isArray(facilities)
    ? VALID_FACILITIES.filter((f) => facilities.includes(f))
    : [];
  const deptVal = department && VALID_DEPARTMENTS.includes(department) ? department : null;
  const pub = published === false || published === 0 || published === "0" ? 0 : 1;
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM hr_newsfeed")
    .get();
  const sort_order = Number(maxRow?.m || 0) + 1;

  const result = await db
    .prepare(
      "INSERT INTO hr_newsfeed (title, body, image_url, facilities, department, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      title.trim(),
      (body && String(body).trim()) || null,
      normalizeImageUrl(image_url),
      JSON.stringify(facilitiesArr),
      deptVal,
      pub,
      sort_order
    );

  const row = await db.prepare("SELECT * FROM hr_newsfeed WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(shapeRow(row));
});

// PUT /hr-newsfeed/:id — update
router.put("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.HR_NEWSFEED), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM hr_newsfeed WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  const { title, body, image_url, facilities, department, published } = req.body;

  const nextTitle = title !== undefined ? String(title).trim() : existing.title;
  if (!nextTitle) return res.status(400).json({ message: "title is required" });

  const nextBody =
    body !== undefined ? (body && String(body).trim()) || null : existing.body;

  let nextFacilities = existing.facilities;
  if (facilities !== undefined && Array.isArray(facilities)) {
    nextFacilities = JSON.stringify(VALID_FACILITIES.filter((f) => facilities.includes(f)));
  }

  const nextDept =
    department !== undefined
      ? department && VALID_DEPARTMENTS.includes(department)
        ? department
        : null
      : existing.department && VALID_DEPARTMENTS.includes(existing.department)
        ? existing.department
        : null;

  const nextPub =
    published !== undefined
      ? published === false || published === 0 || published === "0"
        ? 0
        : 1
      : existing.published ?? 1;

  let nextImg = existing.image_url;
  if (image_url !== undefined) {
    const trimmed = normalizeImageUrl(image_url);
    if (existing.image_url && trimmed !== existing.image_url) {
      try {
        await deleteLessonVideoByUrl(existing.image_url);
      } catch (e) {
        console.error("HR newsfeed image replace delete:", e);
      }
    }
    nextImg = trimmed;
  }

  await db
    .prepare(
      "UPDATE hr_newsfeed SET title = ?, body = ?, image_url = ?, facilities = ?, department = ?, published = ? WHERE id = ?"
    )
    .run(nextTitle, nextBody, nextImg, nextFacilities, nextDept, nextPub, req.params.id);

  const row = await db.prepare("SELECT * FROM hr_newsfeed WHERE id = ?").get(req.params.id);
  return res.json(shapeRow(row));
});

// DELETE /hr-newsfeed/:id
router.delete("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.HR_NEWSFEED), async (req, res) => {
  const existing = await db.prepare("SELECT * FROM hr_newsfeed WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  if (existing.image_url) {
    try {
      await deleteLessonVideoByUrl(existing.image_url);
    } catch (e) {
      console.error("HR newsfeed delete image:", e);
    }
  }
  await db.prepare("DELETE FROM hr_newsfeed WHERE id = ?").run(req.params.id);
  return res.json({ message: "Deleted" });
});

module.exports = router;
