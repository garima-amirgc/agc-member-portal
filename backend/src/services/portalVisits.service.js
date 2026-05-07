const { db } = require("../config/db");

async function recordPortalVisit(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) return { ok: false };

  // Ensure row exists, then increment.
  try {
    await db.prepare("INSERT OR IGNORE INTO portal_visits(user_id, visit_count, last_visit_at) VALUES (?, 0, ?)").run(uid, new Date().toISOString());
  } catch {
    // Postgres: "INSERT OR IGNORE" isn't valid; fall back to UPSERT.
  }

  try {
    // Works in SQLite. (Postgres path: sqlDialect rewrites, but not INSERT OR IGNORE.)
    await db.prepare("UPDATE portal_visits SET visit_count = COALESCE(visit_count, 0) + 1, last_visit_at = ? WHERE user_id = ?").run(new Date().toISOString(), uid);
    return { ok: true };
  } catch {
    // Postgres UPSERT.
    await db
      .prepare(
        `INSERT INTO portal_visits(user_id, visit_count, last_visit_at)
         VALUES (?, 1, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET visit_count = portal_visits.visit_count + 1, last_visit_at = NOW()`
      )
      .run(uid);
    return { ok: true };
  }
}

async function topPortalVisitors(limit = 5) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 5));
  const rows = await db
    .prepare(
      `SELECT
         u.id, u.name, u.email, u.role,
         pv.visit_count, pv.last_visit_at
       FROM portal_visits pv
       JOIN users u ON u.id = pv.user_id
       ORDER BY pv.visit_count DESC, pv.last_visit_at DESC
       LIMIT ?`
    )
    .all(lim);

  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: r.name,
    email: r.email,
    role: r.role,
    visit_count: Number(r.visit_count) || 0,
    last_visit_at: r.last_visit_at || null,
  }));
}

module.exports = {
  recordPortalVisit,
  topPortalVisitors,
};

