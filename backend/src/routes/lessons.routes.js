const express = require("express");
const { db } = require("../config/db");
const { ROLES } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");
const { parsePositiveInt } = require("../utils/ids");

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

router.post("/", allowRoles(ROLES.ADMIN), async (req, res) => {
  const { title, video_url } = req.body;
  const course_id = parsePositiveInt(req.body?.course_id);
  const order_index = parsePositiveInt(req.body?.order_index);
  if (course_id == null) {
    return res.status(400).json({ message: "course_id must be a positive integer" });
  }
  if (order_index == null) {
    return res.status(400).json({ message: "order_index must be a positive integer" });
  }
  if (!title || !String(title).trim() || video_url == null || !String(video_url).trim()) {
    return res.status(400).json({ message: "title and video_url are required" });
  }
  const result = await db
    .prepare("INSERT INTO lessons(course_id, title, video_url, order_index) VALUES (?, ?, ?, ?)")
    .run(course_id, title, video_url, order_index);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const { title, video_url, order_index } = req.body;
  await db.prepare("UPDATE lessons SET title=?, video_url=?, order_index=? WHERE id=?").run(
    title,
    video_url,
    order_index,
    req.params.id
  );
  res.json({ message: "Lesson updated" });
});

router.delete("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
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
