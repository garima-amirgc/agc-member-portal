/**
 * Join dates for work anniversaries must be set explicitly on the Profile page.
 * Do not infer them from account created_at.
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
 * Remove join dates that were auto-copied from created_at (legacy backfill).
 * @param {object} db
 */
async function clearBackfilledJoinDates(db) {
  const stats = { cleared: 0 };

  const users = await db
    .prepare("SELECT id, join_month, join_day, join_year, created_at FROM users")
    .all();

  for (const u of Array.isArray(users) ? users : []) {
    if (u.join_month == null || u.join_day == null || u.join_year == null) continue;
    const jp = createdAtParts(u.created_at);
    if (!jp) continue;
    const sameAsCreated =
      jp.join_month === Number(u.join_month) &&
      jp.join_day === Number(u.join_day) &&
      jp.join_year === Number(u.join_year);
    if (!sameAsCreated) continue;
    await db
      .prepare("UPDATE users SET join_month = NULL, join_day = NULL, join_year = NULL WHERE id = ?")
      .run(u.id);
    stats.cleared += 1;
  }

  return stats;
}

/** @deprecated Join dates are no longer backfilled from created_at. */
async function backfillProfileCelebrationDates() {
  return { join_from_created: 0 };
}

module.exports = { backfillProfileCelebrationDates, clearBackfilledJoinDates, createdAtParts };
