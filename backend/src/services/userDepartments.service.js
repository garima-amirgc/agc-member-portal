const { db } = require("../config/db");
const { DEPARTMENTS } = require("../config/constants");

async function fallbackFromUserColumn(userId) {
  const u = await db
    .prepare("SELECT COALESCE(NULLIF(TRIM(department), ''), 'Production') AS d FROM users WHERE id = ?")
    .get(userId);
  const raw = u?.d != null ? String(u.d).trim() : "";
  const d = DEPARTMENTS.includes(raw) ? raw : "Production";
  return [d];
}

async function listForUser(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id < 1) return ["Production"];
  const rows = await db
    .prepare("SELECT department FROM user_departments WHERE user_id = ? ORDER BY department ASC")
    .all(id);
  if (rows.length > 0) return rows.map((r) => r.department);
  return fallbackFromUserColumn(id);
}

async function hasDepartment(userId, dept) {
  const list = await listForUser(userId);
  return list.includes(dept);
}

function validateAndNormalize(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const d = String(x ?? "").trim();
    if (!DEPARTMENTS.includes(d)) return null;
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  if (out.length === 0) return null;
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function syncForUser(userId, list) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id < 1) return;
  await db.prepare("DELETE FROM user_departments WHERE user_id = ?").run(id);
  const ins = db.prepare("INSERT OR IGNORE INTO user_departments(user_id, department) VALUES (?, ?)");
  for (const d of list) await ins.run(id, d);
  await db.prepare("UPDATE users SET department = ? WHERE id = ?").run(list[0] || "Production", id);
}

module.exports = {
  listForUser,
  hasDepartment,
  validateAndNormalize,
  syncForUser,
};
