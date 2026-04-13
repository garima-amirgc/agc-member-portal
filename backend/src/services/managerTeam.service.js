const { db } = require("../config/db");
const { buildReportingHierarchy } = require("./reportingHierarchy.service");

/**
 * @param {number} managerUserId
 * @returns {Promise<Array<object>>}
 */
async function getTeamOverview(managerUserId) {
  const { chain } = await buildReportingHierarchy(managerUserId);
  const ancestorIds = new Set(chain.slice(0, -1).map((n) => n.id));

  const rows = await db
    .prepare(
      `SELECT id, name, email, role, business_unit
       FROM users WHERE manager_id = ?
       ORDER BY name COLLATE NOCASE ASC`
    )
    .all(managerUserId);

  const employees = rows.filter((e) => e.id !== managerUserId && !ancestorIds.has(e.id));

  const facStmt = db.prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC");
  const leaveStmt = db.prepare(
    `SELECT id, start_date, end_date, status, reason, created_at, decided_at
     FROM leave_requests WHERE employee_id = ?
     ORDER BY created_at DESC`
  );
  const assignStmt = db.prepare(
    `SELECT a.id, a.progress, a.status, a.course_id, c.title AS course_title, c.business_unit AS course_business_unit
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.user_id = ?
     ORDER BY c.title COLLATE NOCASE ASC`
  );

  const out = [];
  for (const emp of employees) {
    out.push({
      ...emp,
      facilities: (await facStmt.all(emp.id)).map((r) => r.business_unit),
      leave_requests: await leaveStmt.all(emp.id),
      assignments: await assignStmt.all(emp.id),
    });
  }
  return out;
}

module.exports = { getTeamOverview };
