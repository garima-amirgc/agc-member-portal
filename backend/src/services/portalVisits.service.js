const { db, isPostgres } = require("../config/db");

const PORTAL_VISIT_WINDOW_DAYS = 7;

async function recordPortalVisit(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) return { ok: false };

  const visitedAt = new Date().toISOString();

  if (isPostgres) {
    await db.prepare("INSERT INTO portal_visit_log (user_id, visited_at) VALUES (?, NOW())").run(uid);
  } else {
    await db.prepare("INSERT INTO portal_visit_log (user_id, visited_at) VALUES (?, ?)").run(uid, visitedAt);
  }

  try {
    if (isPostgres) {
      await db
        .prepare(
          `INSERT INTO portal_visits (user_id, visit_count, last_visit_at)
           VALUES (?, 1, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET
             visit_count = portal_visits.visit_count + 1,
             last_visit_at = NOW()`
        )
        .run(uid);
    } else {
      await db
        .prepare("INSERT OR IGNORE INTO portal_visits(user_id, visit_count, last_visit_at) VALUES (?, 0, ?)")
        .run(uid, visitedAt);
      await db
        .prepare(
          "UPDATE portal_visits SET visit_count = COALESCE(visit_count, 0) + 1, last_visit_at = ? WHERE user_id = ?"
        )
        .run(visitedAt, uid);
    }
  } catch {
  }

  return { ok: true };
}

async function topPortalVisitors(limit = 5, windowDays = PORTAL_VISIT_WINDOW_DAYS) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 5));
  const days = Math.max(1, Math.min(90, Number(windowDays) || PORTAL_VISIT_WINDOW_DAYS));

  const rows = isPostgres
    ? await db
        .prepare(
          `SELECT
             u.id, u.name, u.email, u.role,
             COUNT(*)::int AS visit_count,
             MAX(pvl.visited_at) AS last_visit_at
           FROM portal_visit_log pvl
           JOIN users u ON u.id = pvl.user_id
           WHERE pvl.visited_at >= NOW() - make_interval(days => ?)
           GROUP BY u.id, u.name, u.email, u.role
           HAVING COUNT(*) > 0
           ORDER BY visit_count DESC, last_visit_at DESC
           LIMIT ?`
        )
        .all(days, lim)
    : await db
        .prepare(
          `SELECT
             u.id, u.name, u.email, u.role,
             COUNT(*) AS visit_count,
             MAX(pvl.visited_at) AS last_visit_at
           FROM portal_visit_log pvl
           JOIN users u ON u.id = pvl.user_id
           WHERE datetime(pvl.visited_at) >= datetime('now', ?)
           GROUP BY u.id, u.name, u.email, u.role
           HAVING COUNT(*) > 0
           ORDER BY visit_count DESC, last_visit_at DESC
           LIMIT ?`
        )
        .all(`-${days} days`, lim);

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
  PORTAL_VISIT_WINDOW_DAYS,
  recordPortalVisit,
  topPortalVisitors,
};
