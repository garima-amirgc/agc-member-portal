const { db } = require("../config/db");
const { ROLES } = require("../config/constants");

function parseDateOnly(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

async function submitLeaveRequest(userId, body) {
  const { start_date, end_date, reason = "" } = body || {};
  const start = parseDateOnly(start_date);
  const end = parseDateOnly(end_date);
  if (!start || !end) {
    throw httpError(400, "start_date and end_date are required (YYYY-MM-DD)");
  }
  if (start > end) throw httpError(400, "end_date must be on or after start_date");

  const employee = await db.prepare("SELECT id, manager_id FROM users WHERE id = ?").get(userId);
  if (!employee?.manager_id) {
    throw httpError(400, "No manager assigned. Ask an admin to assign a manager.");
  }

  const manager = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(employee.manager_id);
  if (!manager || manager.role !== ROLES.MANAGER) {
    throw httpError(400, "Assigned manager is invalid. Ask an admin to update your manager.");
  }

  const result = await db
    .prepare(
      `INSERT INTO leave_requests(employee_id, manager_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .run(userId, employee.manager_id, start, end, String(reason).trim() || null);

  return { id: result.lastInsertRowid, message: "Leave request sent to your manager" };
}

async function listLeaveRequestsForEmployee(userId) {
  return db
    .prepare(
      `SELECT lr.*, m.name AS manager_name
       FROM leave_requests lr
       JOIN users m ON m.id = lr.manager_id
       WHERE lr.employee_id = ?
       ORDER BY lr.created_at DESC`
    )
    .all(userId);
}

async function listLeaveInboxForManager(managerId) {
  return db
    .prepare(
      `SELECT lr.*, e.name AS employee_name, e.email AS employee_email
       FROM leave_requests lr
       JOIN users e ON e.id = lr.employee_id
       WHERE lr.manager_id = ?
       ORDER BY lr.status = 'pending' DESC, lr.created_at DESC`
    )
    .all(managerId);
}

async function decideLeaveRequest(managerId, requestId, status) {
  if (status !== "approved" && status !== "rejected") {
    throw httpError(400, "status must be approved or rejected");
  }

  const row = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(requestId);
  if (!row) throw httpError(404, "Request not found");
  if (row.manager_id !== managerId) throw httpError(403, "Forbidden");
  if (row.status !== "pending") throw httpError(400, "This request was already decided");

  await db.prepare(`UPDATE leave_requests SET status = ?, decided_at = ? WHERE id = ?`).run(
    status,
    new Date().toISOString(),
    row.id
  );
  return { message: `Leave request ${status}` };
}

module.exports = {
  submitLeaveRequest,
  listLeaveRequestsForEmployee,
  listLeaveInboxForManager,
  decideLeaveRequest,
};
