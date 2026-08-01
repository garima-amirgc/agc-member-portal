const express = require("express");
const { db } = require("../config/db");
const { ROLES } = require("../config/constants");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");

const router = express.Router();
router.use(authRequired);

router.get("/", async (req, res) => {
  if (hasAdminGrant(req.user, ADMIN_GRANT_KEYS.LEARNING_ADMIN)) {
    const businessUnit = req.query.business_unit;
    const sql = businessUnit
      ? "SELECT * FROM courses WHERE business_unit = ? ORDER BY id DESC"
      : "SELECT * FROM courses ORDER BY id DESC";
    const rows = businessUnit ? await db.prepare(sql).all(businessUnit) : await db.prepare(sql).all();
    if (rows.length === 0) return res.json([]);
    const ids = rows.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    const allLessons = await db
      .prepare(
        `SELECT id, course_id, title, video_url, order_index, video_uploaded_at FROM lessons WHERE course_id IN (${ph}) ORDER BY course_id ASC, order_index ASC`
      )
      .all(...ids);
    const byCourse = {};
    for (const l of allLessons) {
      if (!byCourse[l.course_id]) byCourse[l.course_id] = [];
      byCourse[l.course_id].push({
        id: l.id,
        title: l.title,
        video_url: l.video_url,
        order_index: l.order_index,
        video_uploaded_at: l.video_uploaded_at ?? null,
      });
    }
    return res.json(rows.map((c) => ({ ...c, lessons: byCourse[c.id] || [] })));
  }

  const facilityRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.user.id);
  const facilities = facilityRows.map((r) => r.business_unit);

  if (facilities.length === 0) return res.json([]);

  const deptRows = await db
    .prepare("SELECT department FROM user_departments WHERE user_id = ?")
    .all(req.user.id);
  const departments = deptRows.map((r) => r.department);

  const facPh = facilities.map(() => "?").join(",");
  let rows;
  if (departments.length === 0) {
    // No department assigned — only see courses open to all departments
    rows = await db
      .prepare(`SELECT * FROM courses WHERE business_unit IN (${facPh}) AND department IS NULL ORDER BY id DESC`)
      .all(...facilities);
  } else {
    const deptPh = departments.map(() => "?").join(",");
    rows = await db
      .prepare(
        `SELECT * FROM courses WHERE business_unit IN (${facPh}) AND (department IS NULL OR department IN (${deptPh})) ORDER BY id DESC`
      )
      .all(...facilities, ...departments);
  }
  return res.json(rows);
});

router.get("/:id", async (req, res) => {
  const course = await db.prepare("SELECT * FROM courses WHERE id = ?").get(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const adminAllCourses = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.LEARNING_ADMIN);
  if (!adminAllCourses) {
    const facilityAllowed = await db
      .prepare("SELECT 1 FROM user_facilities WHERE user_id = ? AND business_unit = ? LIMIT 1")
      .get(req.user.id, course.business_unit);
    if (!facilityAllowed) return res.status(403).json({ message: "Forbidden for your facilities" });

    if (course.department) {
      const deptAllowed = await db
        .prepare("SELECT 1 FROM user_departments WHERE user_id = ? AND department = ? LIMIT 1")
        .get(req.user.id, course.department);
      if (!deptAllowed) return res.status(403).json({ message: "Forbidden for your department" });
    }
  }

  const lessons = await db
    .prepare("SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC")
    .all(req.params.id);
  return res.json({ ...course, lessons });
});

function normalizeResourceCategory(raw) {
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim().toLowerCase();
}

router.post("/", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const { title, description, business_unit, resource_category, department, topic } = req.body;
  const rc = normalizeResourceCategory(resource_category);
  const dept = department ? String(department).trim() || null : null;
  const topicVal = topic ? String(topic).trim() || null : null;
  const result = await db
    .prepare(
      "INSERT INTO courses(title, description, business_unit, created_by, resource_category, department, topic) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(title, description || "", business_unit, req.user.id, rc, dept, topicVal);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const { title, description, business_unit, resource_category, department, topic } = req.body;
  const rc = normalizeResourceCategory(resource_category);
  const dept = department ? String(department).trim() || null : null;
  const topicVal = topic ? String(topic).trim() || null : null;
  await db
    .prepare("UPDATE courses SET title=?, description=?, business_unit=?, resource_category=?, department=?, topic=? WHERE id=?")
    .run(title, description, business_unit, rc, dept, topicVal, req.params.id);
  res.json({ message: "Course updated" });
});

router.delete("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const existing = await db.prepare("SELECT id FROM courses WHERE id=?").get(req.params.id);
    if (!existing) return res.status(404).json({ message: "Course not found" });

    const lessons = await db.prepare("SELECT video_url FROM lessons WHERE course_id = ?").all(req.params.id);
    for (const l of lessons) {
      try {
        await deleteLessonVideoByUrl(l.video_url);
      } catch (e) {
        console.error("Course lesson video delete failed:", e);
        return res.status(502).json({ message: "Failed to delete course lesson videos from storage." });
      }
    }

    await db.prepare("DELETE FROM courses WHERE id=?").run(req.params.id);
    return res.json({ message: "Course deleted" });
  } catch (e) {
    return res.status(409).json({ message: "Could not delete this course." });
  }
});

module.exports = router;
