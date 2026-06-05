const { db } = require("../config/db");

const RESOURCE_CATEGORIES = ["finance", "sales", "hr", "safety", "production", "it"];

/**
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
async function getUserFacilities(userId) {
  const facilityRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(userId);
  const facilities = facilityRows.map((r) => r.business_unit);

  if (facilities.length === 0) {
    const user = await db.prepare("SELECT business_unit FROM users WHERE id = ?").get(userId);
    if (user?.business_unit) facilities.push(user.business_unit);
  }
  return facilities;
}

/**
 * Facility-scoped assignments for an employee (same rules as GET /assignments/me).
 * @param {number} userId
 * @returns {Promise<Array<{ id: number, status: string, progress: number }>>}
 */
async function getFacilityScopedAssignments(userId) {
  const facilities = await getUserFacilities(userId);
  if (facilities.length === 0) return [];

  const placeholders = facilities.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT a.id, a.status, a.progress
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.user_id = ? AND c.business_unit IN (${placeholders})`
    )
    .all(userId, ...facilities);
}

/**
 * Progress from facility Resources (videos + documents marked complete).
 * @param {number} userId
 */
async function getResourceTrainingSummary(userId) {
  const facilities = await getUserFacilities(userId);
  if (facilities.length === 0) {
    return { total: 0, completed: 0, allComplete: false, avgProgress: 0 };
  }

  let total = 0;
  let completed = 0;

  const videoStmt = db.prepare(
    `SELECT l.id
     FROM lessons l
     INNER JOIN courses c ON c.id = l.course_id
     WHERE c.business_unit = ?
       AND LOWER(TRIM(COALESCE(c.resource_category, ''))) = ?`
  );
  const docStmt = db.prepare(
    `SELECT id
     FROM resource_documents
     WHERE business_unit = ?
       AND LOWER(TRIM(COALESCE(category, ''))) = ?`
  );
  const doneStmt = db.prepare(
    `SELECT 1 AS ok FROM resource_progress
     WHERE user_id = ? AND business_unit = ? AND category = ? AND resource_kind = ? AND resource_id = ?
     LIMIT 1`
  );

  for (const facility of facilities) {
    for (const category of RESOURCE_CATEGORIES) {
      const videos = await videoStmt.all(facility, category);
      const docs = await docStmt.all(facility, category);
      const items = [
        ...videos.map((v) => ({ resource_kind: "lesson", resource_id: v.id })),
        ...docs.map((d) => ({ resource_kind: "document", resource_id: d.id })),
      ];
      if (items.length === 0) continue;

      total += items.length;
      for (const item of items) {
        const row = await doneStmt.get(userId, facility, category, item.resource_kind, item.resource_id);
        if (row) completed += 1;
      }
    }
  }

  const avgProgress = total === 0 ? 0 : Math.round((completed / total) * 100);
  return {
    total,
    completed,
    allComplete: total > 0 && completed === total,
    avgProgress,
  };
}

/**
 * Combined course assignments + facility resource progress (what employees see in the portal).
 * @param {number} userId
 */
async function getTrainingSummary(userId) {
  const assignments = await getFacilityScopedAssignments(userId);
  const assignmentTotal = assignments.length;
  const assignmentCompleted = assignments.filter((a) => a.status === "completed").length;
  const assignmentAvg =
    assignmentTotal === 0
      ? 0
      : Math.round(assignments.reduce((s, a) => s + (a.progress ?? 0), 0) / assignmentTotal);

  const resources = await getResourceTrainingSummary(userId);

  const total = assignmentTotal + resources.total;
  const completed = assignmentCompleted + resources.completed;
  const avgProgress = total === 0 ? 0 : Math.round((completed / total) * 100);

  const assignmentsDone = assignmentTotal === 0 || assignmentCompleted === assignmentTotal;
  const resourcesDone = resources.total === 0 || resources.allComplete;
  const allComplete = total > 0 && assignmentsDone && resourcesDone;

  return {
    total,
    completed,
    allComplete,
    avgProgress,
    assignments: {
      total: assignmentTotal,
      completed: assignmentCompleted,
      avgProgress: assignmentAvg,
      allComplete: assignmentTotal > 0 && assignmentCompleted === assignmentTotal,
    },
    resources: {
      total: resources.total,
      completed: resources.completed,
      avgProgress: resources.avgProgress,
      allComplete: resources.allComplete,
    },
  };
}

/**
 * Clears the all-training milestone when new assignments are added so employees
 * can be notified again after completing newly assigned courses.
 * @param {number} userId
 */
async function clearAllTrainingMilestone(userId) {
  await db.prepare("DELETE FROM all_training_milestones WHERE employee_id = ?").run(userId);
}

module.exports = {
  getUserFacilities,
  getFacilityScopedAssignments,
  getResourceTrainingSummary,
  getTrainingSummary,
  clearAllTrainingMilestone,
};
