/**
 * Backfill users.join_* from account created_at when missing.
 * Usage: node scripts/sync-profile-celebration-dates.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

async function main() {
  const database = require("../src/config/database");
  await database.initDb();
  const { backfillProfileCelebrationDates } = require("../src/services/profileCelebrationBackfill.service");
  const stats = await backfillProfileCelebrationDates(database.db);
  console.log("Profile celebration backfill complete:", stats);

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
