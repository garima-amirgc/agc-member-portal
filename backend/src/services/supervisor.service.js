const { db } = require("../config/db");

/**
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function countDirectReports(userId) {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE manager_id = ?").get(userId);
  return Number(row?.c ?? 0);
}

/**
 * True when at least one user has manager_id = this user (team lead / supervisor).
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function hasDirectReports(userId) {
  return (await countDirectReports(userId)) > 0;
}

/**
 * Assigning supervisorId as manager of employeeId would create a cycle.
 * @param {number|null} employeeId null when creating a new user
 * @param {number} supervisorId
 * @returns {Promise<boolean>}
 */
async function wouldCreateReportingCycle(employeeId, supervisorId) {
  if (supervisorId == null || supervisorId === "") return false;
  const sid = Number(supervisorId);
  if (!Number.isFinite(sid) || sid < 1) return false;
  if (employeeId != null && Number(employeeId) === sid) return true;

  const seen = new Set();
  let current = sid;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (employeeId != null && Number(employeeId) === current) return true;
    const row = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(current);
    if (!row) break;
    current = row.manager_id;
  }
  return false;
}

/**
 * Normalize manager_id from API body; validate user exists, no self-report, no cycles.
 * @param {number|null} employeeId
 * @param {unknown} manager_id
 * @returns {Promise<{ ok: true, managerId: number|null } | { ok: false, message: string }>}
 */
async function resolveReportsToId(employeeId, manager_id) {
  if (manager_id === undefined) {
    return { ok: true, managerId: undefined };
  }
  if (manager_id === null || manager_id === "") {
    return { ok: true, managerId: null };
  }
  const mid = Number(manager_id);
  if (!Number.isFinite(mid) || mid < 1) {
    return { ok: true, managerId: null };
  }
  if (employeeId != null && mid === Number(employeeId)) {
    return { ok: false, message: "A user cannot report to themselves." };
  }
  const sup = await db.prepare("SELECT id FROM users WHERE id = ?").get(mid);
  if (!sup) {
    return { ok: false, message: "Invalid reports-to user." };
  }
  if (await wouldCreateReportingCycle(employeeId, mid)) {
    return { ok: false, message: "That reporting line would create a circular hierarchy." };
  }
  return { ok: true, managerId: mid };
}

module.exports = {
  countDirectReports,
  hasDirectReports,
  wouldCreateReportingCycle,
  resolveReportsToId,
};
