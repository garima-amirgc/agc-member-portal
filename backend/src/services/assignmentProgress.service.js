const { db } = require("../config/db");
const { syncUserAssignmentsForFacilities } = require("./assignmentSync.service");

/**
 * Recalculate assignment progress from lesson_completions.
 * @param {number} assignmentId
 * @returns {Promise<{ progress: number, status: string, courseJustCompleted: boolean }>}
 */
async function recalculateAssignmentProgress(assignmentId) {
  const assignment = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(assignmentId);
  if (!assignment) {
    return { progress: 0, status: "in_progress", courseJustCompleted: false };
  }

  const wasCompleted = assignment.status === "completed";

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

  return {
    progress,
    status,
    courseJustCompleted: !wasCompleted && status === "completed",
    assignment,
  };
}

/**
 * When a resource video (lesson) is marked complete, mirror it on the user's course assignment.
 * @param {number} userId
 * @param {number} lessonId
 */
async function syncAssignmentFromResourceLesson(userId, lessonId) {
  await syncUserAssignmentsForFacilities(userId);

  const lesson = await db.prepare("SELECT id, course_id FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson?.course_id) return null;

  const assignment = await db
    .prepare("SELECT * FROM assignments WHERE user_id = ? AND course_id = ?")
    .get(userId, lesson.course_id);
  if (!assignment) return null;

  await db
    .prepare("INSERT OR IGNORE INTO lesson_completions(assignment_id, lesson_id) VALUES (?, ?)")
    .run(assignment.id, lesson.id);
  await db.prepare("UPDATE assignments SET last_watched_lesson = ? WHERE id = ?").run(lesson.id, assignment.id);

  const result = await recalculateAssignmentProgress(assignment.id);
  return { ...result, assignment };
}

module.exports = { recalculateAssignmentProgress, syncAssignmentFromResourceLesson };
