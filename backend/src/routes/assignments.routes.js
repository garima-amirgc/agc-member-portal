const express = require("express");
const { db } = require("../config/db");
const { ROLES } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { notifyManagerCourseCompletion } = require("../services/notification.service");
const { parsePositiveInt } = require("../utils/ids");

const router = express.Router();
router.use(authRequired);

router.get("/me", async (req, res) => {
  if (req.user.role === ROLES.ADMIN) {
    const rows = await db
      .prepare(
        `SELECT a.*, c.title as course_title, c.description as course_description, c.business_unit as course_business_unit
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.user_id = ?
        ORDER BY a.assigned_at DESC`
      )
      .all(req.user.id);
    return res.json(rows);
  }

  const facilityRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(req.user.id);
  const facilities = facilityRows.map((r) => r.business_unit);

  if (facilities.length === 0) return res.json([]);

  const placeholders = facilities.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT a.*, c.title as course_title, c.description as course_description, c.business_unit as course_business_unit
      FROM assignments a
      JOIN courses c ON c.id = a.course_id
      WHERE a.user_id = ? AND c.business_unit IN (${placeholders})
      ORDER BY a.assigned_at DESC`
    )
    .all(req.user.id, ...facilities);

  return res.json(rows);
});

router.post("/", allowRoles(ROLES.ADMIN), async (req, res) => {
  const user_id = parsePositiveInt(req.body?.user_id);
  const course_id = parsePositiveInt(req.body?.course_id);
  if (user_id == null || course_id == null) {
    return res.status(400).json({ message: "user_id and course_id must be positive integers" });
  }
  const user = await db.prepare("SELECT id, business_unit FROM users WHERE id = ?").get(user_id);
  const course = await db.prepare("SELECT id, business_unit FROM courses WHERE id = ?").get(course_id);
  if (!user || !course) return res.status(400).json({ message: "Invalid user/course" });

  const facilityAllowed = await db
    .prepare("SELECT 1 FROM user_facilities WHERE user_id = ? AND business_unit = ? LIMIT 1")
    .get(user_id, course.business_unit);
  if (!facilityAllowed) return res.status(400).json({ message: "User does not have access to this facility" });

  try {
    const result = await db.prepare("INSERT INTO assignments(user_id, course_id) VALUES (?, ?)").run(user_id, course_id);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ message: "Assignment already exists or invalid user/course" });
  }
});

router.post("/:id/progress", async (req, res) => {
  const { completed = false } = req.body;
  const lesson_id = parsePositiveInt(req.body?.lesson_id);
  if (lesson_id == null) {
    return res.status(400).json({ message: "lesson_id must be a positive integer" });
  }
  const assignment = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id);
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });
  if (req.user.role !== ROLES.ADMIN && req.user.id !== assignment.user_id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (completed) {
    await db.prepare("INSERT OR IGNORE INTO lesson_completions(assignment_id, lesson_id) VALUES (?, ?)").run(
      assignment.id,
      lesson_id
    );
  }
  await db.prepare("UPDATE assignments SET last_watched_lesson = ?, status = 'in_progress' WHERE id = ?").run(
    lesson_id,
    assignment.id
  );

  const totalRow = await db.prepare("SELECT COUNT(*) as count FROM lessons WHERE course_id = ?").get(assignment.course_id);
  const totalLessons = Number(totalRow?.count ?? 0);

  const completedRow = await db
    .prepare(
      "SELECT COUNT(*) as count FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id WHERE lc.assignment_id = ? AND l.course_id = ?"
    )
    .get(assignment.id, assignment.course_id);
  const completedLessons = Number(completedRow?.count ?? 0);

  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  let status = "in_progress";
  let completedAt = null;

  if (totalLessons > 0 && completedLessons === totalLessons) {
    status = "completed";
    completedAt = new Date().toISOString();
  }

  await db.prepare("UPDATE assignments SET progress = ?, status = ?, completed_at = ? WHERE id = ?").run(
    progress,
    status,
    completedAt,
    assignment.id
  );

  if (status === "completed") {
    const user = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(assignment.user_id);
    const course = await db.prepare("SELECT id, title FROM courses WHERE id = ?").get(assignment.course_id);
    void notifyManagerCourseCompletion({
      managerId: user?.manager_id || null,
      employeeId: assignment.user_id,
      courseId: course?.id,
      courseTitle: course?.title || "Unknown course",
    });
  }

  return res.json({
    message: status === "completed" ? "You have completed the training" : "Progress updated",
    progress,
    status,
  });
});

router.get("/", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res) => {
  let rows = await db
    .prepare(
      `SELECT a.*, u.name as user_name, c.title as course_title, c.business_unit as course_business_unit
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN courses c ON c.id = a.course_id
      ORDER BY a.id DESC`
    )
    .all();
  if (req.user.role === ROLES.MANAGER) rows = rows.filter((r) => r.user_id !== req.user.id);
  res.json(rows);
});

module.exports = router;
