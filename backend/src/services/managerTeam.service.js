const { db } = require("../config/db");
const { getTrainingSummary } = require("./trainingCompletion.service");

async function getAncestorIds(userId) {
  const ancestorIds = new Set();
  let id = userId;
  const seen = new Set();

  while (id != null && !seen.has(id)) {
    seen.add(id);
    const row = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(id);
    if (!row) break;
    const mgr = row.manager_id;
    if (mgr == null) break;
    ancestorIds.add(mgr);
    id = mgr;
  }

  return ancestorIds;
}

async function getTeamOverview(managerUserId) {
  const ancestorIds = await getAncestorIds(managerUserId);

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
  const assignAllStmt = db.prepare(
    `SELECT a.id, a.progress, a.status, a.course_id, c.title AS course_title, c.business_unit AS course_business_unit
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.user_id = ?
     ORDER BY c.title COLLATE NOCASE ASC`
  );

  return Promise.all(
    employees.map(async (emp) => {
      const facilities = (await facStmt.all(emp.id)).map((r) => r.business_unit);
      const effectiveFacilities =
        facilities.length > 0 ? facilities : emp.business_unit ? [emp.business_unit] : [];
      const facilitySet = new Set(effectiveFacilities);

      const [allAssignments, leave_requests, training_summary] = await Promise.all([
        assignAllStmt.all(emp.id),
        leaveStmt.all(emp.id),
        getTrainingSummary(emp.id),
      ]);
      const assignments = allAssignments.filter((a) => facilitySet.has(a.course_business_unit));

      return {
        ...emp,
        facilities: effectiveFacilities,
        leave_requests,
        assignments,
        training_summary,
      };
    })
  );
}

module.exports = { getTeamOverview, getAncestorIds };
