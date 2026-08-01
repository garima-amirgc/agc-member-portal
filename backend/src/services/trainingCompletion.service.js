const { db } = require("../config/db");

const RESOURCE_CATEGORIES = ["finance", "sales", "hr", "safety", "production", "it"];

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

async function getFacilityScopedAssignments(userId, facilities = null) {
  const facs = facilities ?? (await getUserFacilities(userId));
  if (facs.length === 0) return [];

  const placeholders = facs.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT a.id, a.status, a.progress
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.user_id = ? AND c.business_unit IN (${placeholders})`
    )
    .all(userId, ...facs);
}

async function getResourceTrainingSummary(userId, facilities = null) {
  const facs = facilities ?? (await getUserFacilities(userId));
  if (facs.length === 0) {
    return { total: 0, completed: 0, allComplete: false, avgProgress: 0 };
  }

  const facPH  = facs.map(() => "?").join(",");
  const catPH  = RESOURCE_CATEGORIES.map(() => "?").join(",");

  // Replaced: 4 facilities × 6 categories × 2 queries (48 sequential) → 3 parallel queries
  const [progressRows, videos, docs] = await Promise.all([
    db.prepare(
      "SELECT business_unit, category, resource_kind, resource_id FROM resource_progress WHERE user_id = ?"
    ).all(userId),
    db.prepare(
      `SELECT l.id, c.business_unit, LOWER(TRIM(COALESCE(c.resource_category, ''))) AS category
       FROM lessons l
       INNER JOIN courses c ON c.id = l.course_id
       WHERE c.business_unit IN (${facPH})
         AND LOWER(TRIM(COALESCE(c.resource_category, ''))) IN (${catPH})`
    ).all(...facs, ...RESOURCE_CATEGORIES),
    db.prepare(
      `SELECT id, business_unit, LOWER(TRIM(COALESCE(category, ''))) AS category
       FROM resource_documents
       WHERE business_unit IN (${facPH})
         AND LOWER(TRIM(COALESCE(category, ''))) IN (${catPH})`
    ).all(...facs, ...RESOURCE_CATEGORIES),
  ]);

  const doneSet = new Set(
    progressRows.map((r) => `${r.business_unit}|${String(r.category || "").trim().toLowerCase()}|${r.resource_kind}|${r.resource_id}`)
  );

  const items = [
    ...videos.map((v) => ({ bu: v.business_unit, cat: v.category, kind: "lesson",   id: v.id })),
    ...docs.map((d)   => ({ bu: d.business_unit, cat: d.category, kind: "document", id: d.id })),
  ];

  const total     = items.length;
  const completed = items.filter((i) => doneSet.has(`${i.bu}|${i.cat}|${i.kind}|${i.id}`)).length;
  const avgProgress = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { total, completed, allComplete: total > 0 && completed === total, avgProgress };
}

async function getUserDocAssignments(userId) {
  const rows = await db
    .prepare("SELECT id, status FROM user_training_assignments WHERE user_id = ? AND resource_kind = 'document'")
    .all(userId);
  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed").length;
  return { total, completed, allComplete: total === 0 || completed === total };
}

async function getTrainingSummary(userId) {
  // Fetch facilities once, then run all three queries in parallel
  const facilities = await getUserFacilities(userId);
  const [assignments, resources, docAssignments] = await Promise.all([
    getFacilityScopedAssignments(userId, facilities),
    getResourceTrainingSummary(userId, facilities),
    getUserDocAssignments(userId),
  ]);

  const assignmentTotal = assignments.length;
  const assignmentCompleted = assignments.filter((a) => a.status === "completed").length;
  const assignmentAvg =
    assignmentTotal === 0
      ? 0
      : Math.round(assignments.reduce((s, a) => s + (a.progress ?? 0), 0) / assignmentTotal);

  const total = assignmentTotal + resources.total + docAssignments.total;
  const completed = assignmentCompleted + resources.completed + docAssignments.completed;
  const avgProgress = total === 0 ? 0 : Math.round((completed / total) * 100);

  const assignmentsDone = assignmentTotal === 0 || assignmentCompleted === assignmentTotal;
  const resourcesDone = resources.total === 0 || resources.allComplete;
  const docAssignmentsDone = docAssignments.allComplete;
  const allComplete = total > 0 && assignmentsDone && resourcesDone && docAssignmentsDone;

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
    docAssignments: {
      total: docAssignments.total,
      completed: docAssignments.completed,
      allComplete: docAssignments.allComplete,
    },
  };
}

async function clearAllTrainingMilestone(userId) {
  await db.prepare("DELETE FROM all_training_milestones WHERE employee_id = ?").run(userId);
}

module.exports = {
  getUserFacilities,
  getFacilityScopedAssignments,
  getResourceTrainingSummary,
  getUserDocAssignments,
  getTrainingSummary,
  clearAllTrainingMilestone,
};
