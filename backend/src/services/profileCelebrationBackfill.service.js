/**
 * Backfill users.birth_* and users.join_* from legacy birthday_list and account created_at.
 * Safe to run repeatedly (only fills missing profile fields).
 */

function parseDobMonthDay(dob) {
  const s = String(dob || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!Number.isFinite(mo) || !Number.isFinite(da) || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return { birth_month: mo, birth_day: da };
}

function nameMatches(userName, listName) {
  const u = String(userName || "").trim().toLowerCase();
  const l = String(listName || "").trim().toLowerCase();
  if (!u || !l) return false;
  if (u === l) return true;
  if (u.startsWith(l) || l.startsWith(u)) return true;
  const uFirst = u.split(/\s+/)[0];
  const lFirst = l.split(/\s+/)[0];
  return uFirst === lFirst || uFirst.startsWith(lFirst) || lFirst.startsWith(uFirst);
}

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
 * @param {import("../config/database/postgres").db | import("../config/database/sqlite").db} db
 */
async function backfillProfileCelebrationDates(db) {
  const stats = { birth_from_list: 0, join_from_created: 0 };

  const listRows = await db
    .prepare("SELECT id, name, dob FROM birthday_list WHERE dob IS NOT NULL AND TRIM(dob) <> ''")
    .all();
  const users = await db
    .prepare("SELECT id, name, birth_month, birth_day, join_month, join_day, join_year, created_at FROM users")
    .all();

  for (const u of Array.isArray(users) ? users : []) {
    const missingBirth = u.birth_month == null || u.birth_day == null;
    if (missingBirth) {
      for (const bl of Array.isArray(listRows) ? listRows : []) {
        if (!nameMatches(u.name, bl.name)) continue;
        const parts = parseDobMonthDay(bl.dob);
        if (!parts) continue;
        await db
          .prepare("UPDATE users SET birth_month = ?, birth_day = ? WHERE id = ?")
          .run(parts.birth_month, parts.birth_day, u.id);
        stats.birth_from_list += 1;
        break;
      }
    }

    const missingJoin = u.join_month == null || u.join_day == null || u.join_year == null;
    if (missingJoin && u.created_at) {
      const jp = createdAtParts(u.created_at);
      if (jp) {
        await db
          .prepare("UPDATE users SET join_month = ?, join_day = ?, join_year = ? WHERE id = ?")
          .run(jp.join_month, jp.join_day, jp.join_year, u.id);
        stats.join_from_created += 1;
      }
    }
  }

  return stats;
}

module.exports = { backfillProfileCelebrationDates, nameMatches, parseDobMonthDay };
