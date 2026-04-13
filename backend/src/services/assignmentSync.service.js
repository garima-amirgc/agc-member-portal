const { db } = require("../config/db");

/**
 * Ensures the user has an `assignments` row for every course in their facilities.
 */
async function syncUserAssignmentsForFacilities(userId) {
  const facilityRows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(userId);
  const facilities = facilityRows.map((r) => r.business_unit);

  const effectiveFacilities =
    facilities.length > 0
      ? facilities
      : [
          (await db.prepare("SELECT business_unit FROM users WHERE id = ?").get(userId))?.business_unit,
        ].filter(Boolean);

  for (const facility of effectiveFacilities) {
    const courses = await db.prepare("SELECT id FROM courses WHERE business_unit = ?").all(facility);
    for (const course of courses) {
      await db.prepare("INSERT OR IGNORE INTO assignments(user_id, course_id) VALUES (?, ?)").run(userId, course.id);
    }
  }
}

module.exports = { syncUserAssignmentsForFacilities };
