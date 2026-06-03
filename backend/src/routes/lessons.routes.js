const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");
const { parsePositiveInt } = require("../utils/ids");

function isoNow() {
  return new Date().toISOString();
}

const router = express.Router();
router.use(authRequired);

router.get("/course/:courseId", async (req, res) => {
  const lessons = await db
    .prepare("SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC")
    .all(req.params.courseId);
  res.json(lessons);
});

router.get("/:id", async (req, res) => {
  const lesson = await db.prepare("SELECT * FROM lessons WHERE id = ?").get(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found" });
  res.json(lesson);
});

router.post("/", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const { title, video_url } = req.body;
  const course_id = parsePositiveInt(req.body?.course_id);
  let order_index = parsePositiveInt(req.body?.order_index);
  if (course_id == null) {
    return res.status(400).json({ message: "course_id must be a positive integer" });
  }
  if (order_index == null) {
    const row = await db
      .prepare("SELECT COALESCE(MAX(order_index), 0) AS max_order FROM lessons WHERE course_id = ?")
      .get(course_id);
    order_index = Number(row?.max_order || 0) + 1;
  }
  if (!title || !String(title).trim() || video_url == null || !String(video_url).trim()) {
    return res.status(400).json({ message: "title and video_url are required" });
  }
  const uploadedAt = isoNow();
  const result = await db
    .prepare(
      "INSERT INTO lessons(course_id, title, video_url, order_index, video_uploaded_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(course_id, title, video_url, order_index, uploadedAt);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const lessonId = parsePositiveInt(req.params.id);
  if (lessonId == null) {
    return res.status(400).json({ message: "id must be a positive integer" });
  }
  const { title, video_url, order_index } = req.body;
  const existing = await db
    .prepare("SELECT id, video_url, video_uploaded_at FROM lessons WHERE id=?")
    .get(lessonId);
  if (!existing) return res.status(404).json({ message: "Lesson not found" });

  const prevUrl = String(existing.video_url ?? "");
  const nextUrl = video_url != null ? String(video_url).trim() : "";
  const urlChanged = prevUrl !== nextUrl;
  const nextUploaded = urlChanged ? isoNow() : existing.video_uploaded_at;

  await db
    .prepare("UPDATE lessons SET title=?, video_url=?, order_index=?, video_uploaded_at=? WHERE id=?")
    .run(title, video_url, order_index, nextUploaded, lessonId);
  res.json({ message: "Lesson updated" });
});

router.delete("/:id", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const lesson = await db.prepare("SELECT id, video_url FROM lessons WHERE id=?").get(req.params.id);
  if (!lesson) return res.status(404).json({ message: "Lesson not found" });

  try {
    await deleteLessonVideoByUrl(lesson.video_url);
  } catch (e) {
    console.error("Lesson video delete failed:", e);
    return res.status(502).json({ message: "Failed to delete lesson video from storage." });
  }

  await db.prepare("DELETE FROM lessons WHERE id=?").run(req.params.id);
  return res.json({ message: "Lesson deleted" });
});

module.exports = router;
