/**
 * Clear join dates that were auto-filled from account created_at (legacy backfill).
 * Usage: node scripts/sync-profile-celebration-dates.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

async function main() {
  const database = require("../src/config/database");
  await database.initDb();
  const { clearBackfilledJoinDates } = require("../src/services/profileCelebrationBackfill.service");
  const stats = await clearBackfilledJoinDates(database.db);
  console.log("Profile join-date cleanup complete:", stats);

  const { portalTodayParts } = require("../src/utils/portalDate");
  const today = portalTodayParts();
  console.log("Portal today:", today);

  const rows = await database.db
    .prepare(
      "SELECT id, name, email, birth_month, birth_day, join_month, join_day, join_year FROM users ORDER BY id"
    )
    .all();
  console.table(rows);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
