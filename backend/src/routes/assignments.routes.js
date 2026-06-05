const express = require("express");
const { db } = require("../config/db");
const { ROLES } = require("../config/constants");
const { hasDirectReports } = require("../services/supervisor.service");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");
const { notifyManagerCourseCompletion, maybeNotifyAllTrainingComplete } = require("../services/notification.service");
const { parsePositiveInt } = require("../utils/ids");
const { clearAllTrainingMilestone, getTrainingSummary } = require("../services/trainingCompletion.service");
const { recalculateAssignmentProgress } = require("../services/assignmentProgress.service");
const { syncUserAssignmentsForFacilities } = require("../services/assignmentSync.service");

const router = express.Router();
router.use(authRequired);

router.get("/me", async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    await syncUserAssignmentsForFacilities(req.user.id);
  }

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

router.post("/", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
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
    await clearAllTrainingMilestone(user_id);
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
  const canAdminEditOthers = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.LEARNING_ADMIN);
  if (!canAdminEditOthers && req.user.id !== assignment.user_id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (completed) {
    await db.prepare("INSERT OR IGNORE INTO lesson_completions(assignment_id, lesson_id) VALUES (?, ?)").run(
      assignment.id,
      lesson_id
    );
    await db.prepare("UPDATE assignments SET last_watched_lesson = ? WHERE id = ?").run(lesson_id, assignment.id);
  }

  const { progress, status, courseJustCompleted } = await recalculateAssignmentProgress(assignment.id);

  let allTrainingComplete = false;
  let allTrainingJustNotified = false;

  const summaryAfter = await getTrainingSummary(assignment.user_id);
  if (!summaryAfter.allComplete) {
    await clearAllTrainingMilestone(assignment.user_id);
  }

  if (courseJustCompleted) {
    const user = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(assignment.user_id);
    const course = await db.prepare("SELECT id, title FROM courses WHERE id = ?").get(assignment.course_id);
    void notifyManagerCourseCompletion({
      managerId: user?.manager_id || null,
      employeeId: assignment.user_id,
      courseId: course?.id,
      courseTitle: course?.title || "Unknown course",
    });

    const allTraining = await maybeNotifyAllTrainingComplete(assignment.user_id);
    allTrainingComplete = allTraining.allComplete;
    allTrainingJustNotified = allTraining.notified;
  }

  let message = "Progress updated";
  if (status === "completed") {
    message = allTrainingJustNotified
      ? "Congratulations! You have completed all of your assigned training."
      : "You have completed the training";
  }

  return res.json({
    message,
    progress,
    status,
    all_training_complete: allTrainingComplete,
    all_training_just_notified: allTrainingJustNotified,
  });
});

router.get("/", async (req, res) => {
  const canListAll = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.LEARNING_ADMIN);
  const isSupervisor = await hasDirectReports(req.user.id);
  if (!canListAll && !isSupervisor) {
    return res.status(403).json({ message: "You do not have access to this administration area." });
  }
  let rows = await db
    .prepare(
      `SELECT a.*, u.name as user_name, c.title as course_title, c.business_unit as course_business_unit
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN courses c ON c.id = a.course_id
      ORDER BY a.id DESC`
    )
    .all();
  if (!canListAll && isSupervisor) {
    const team = await db.prepare("SELECT id FROM users WHERE manager_id = ?").all(req.user.id);
    const teamIds = new Set(team.map((r) => r.id));
    rows = rows.filter((r) => teamIds.has(r.user_id));
  }
  res.json(rows);
});

module.exports = router;
