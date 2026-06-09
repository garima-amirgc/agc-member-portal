/**
 * Backfill users.join_* from account created_at when missing.
 * Birthdays come from user profiles only (Profile page).
 */

function createdAtParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = String(process.env.PORTAL_TIMEZONE || "America/Toronto").trim() || "America/Toronto";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    join_month: get("month"),
    join_day: get("day"),
    join_year: get("year"),
  };
}

/**
 * @param {object} db
 */
async function backfillProfileCelebrationDates(db) {
  const stats = { join_from_created: 0 };

  const users = await db
    .prepare("SELECT id, join_month, join_day, join_year, created_at FROM users")
    .all();

  for (const u of Array.isArray(users) ? users : []) {
    const missingJoin = u.join_month == null || u.join_day == null || u.join_year == null;
    if (!missingJoin || !u.created_at) continue;
    const jp = createdAtParts(u.created_at);
    if (!jp) continue;
    await db
      .prepare("UPDATE users SET join_month = ?, join_day = ?, join_year = ? WHERE id = ?")
      .run(jp.join_month, jp.join_day, jp.join_year, u.id);
    stats.join_from_created += 1;
  }

  return stats;
}

module.exports = { backfillProfileCelebrationDates };
