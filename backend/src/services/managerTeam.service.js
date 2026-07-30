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
  if (employees.length === 0) return [];

  const ids = employees.map((e) => e.id);
  const placeholders = ids.map(() => "?").join(",");

  // Batch all queries — one per data type instead of one per employee
  const [allFacilities, allAssignments, allLeave] = await Promise.all([
    db.prepare(
      `SELECT user_id, business_unit FROM user_facilities WHERE user_id IN (${placeholders}) ORDER BY business_unit ASC`
    ).all(...ids),
    db.prepare(
      `SELECT a.user_id, a.id, a.progress, a.status, a.course_id,
              c.title AS course_title, c.business_unit AS course_business_unit
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       WHERE a.user_id IN (${placeholders})
       ORDER BY c.title COLLATE NOCASE ASC`
    ).all(...ids),
    db.prepare(
      `SELECT employee_id, id, start_date, end_date, status, reason, created_at, decided_at
       FROM leave_requests WHERE employee_id IN (${placeholders})
       ORDER BY created_at DESC`
    ).all(...ids),
  ]);

  // Group by user_id
  const facilitiesByUser = new Map();
  for (const r of allFacilities) {
    const arr = facilitiesByUser.get(r.user_id) || [];
    arr.push(r.business_unit);
    facilitiesByUser.set(r.user_id, arr);
  }

  const assignmentsByUser = new Map();
  for (const r of allAssignments) {
    const arr = assignmentsByUser.get(r.user_id) || [];
    arr.push(r);
    assignmentsByUser.set(r.user_id, arr);
  }

  const leaveByUser = new Map();
  for (const r of allLeave) {
    const arr = leaveByUser.get(r.employee_id) || [];
    arr.push(r);
    leaveByUser.set(r.employee_id, arr);
  }

  // Fetch training summaries in parallel (one per employee, but all at once)
  const trainingSummaries = await Promise.all(
    employees.map((emp) => getTrainingSummary(emp.id))
  );

  return employees.map((emp, i) => {
    const facilities = facilitiesByUser.get(emp.id) || [];
    const effectiveFacilities = facilities.length > 0
      ? facilities
      : emp.business_unit ? [emp.business_unit] : [];
    const facilitySet = new Set(effectiveFacilities);

    const allEmpAssignments = assignmentsByUser.get(emp.id) || [];
    const assignments = allEmpAssignments.filter((a) => facilitySet.has(a.course_business_unit));

    return {
      ...emp,
      facilities: effectiveFacilities,
      leave_requests: leaveByUser.get(emp.id) || [],
      assignments,
      training_summary: trainingSummaries[i],
    };
  });
}

module.exports = { getTeamOverview, getAncestorIds };
