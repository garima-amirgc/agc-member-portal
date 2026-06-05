/**
 * One-off diagnostic: training progress for a user by email.
 * Usage: node scripts/debug-training-progress.js garima.singh@amirgc.com
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

async function main() {
  const email = (process.argv[2] || "garima.singh@amirgc.com").toLowerCase().trim();
  const database = require("../src/config/database");
  await database.initDb();
  const { db } = database;

  const user = await db
    .prepare("SELECT id, name, email, business_unit, manager_id FROM users WHERE LOWER(email) = ?")
    .get(email);
  if (!user) {
    console.log("User not found:", email);
    process.exit(1);
  }

  const manager = user.manager_id
    ? await db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(user.manager_id)
    : null;

  const facilities = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(user.id);

  const progressRows = await db
    .prepare(
      `SELECT business_unit, category, resource_kind, resource_id, completed_at
       FROM resource_progress WHERE user_id = ? ORDER BY business_unit, category`
    )
    .all(user.id);

  const assignments = await db
    .prepare(
      `SELECT a.id, a.progress, a.status, c.title, c.business_unit, c.resource_category
       FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.user_id = ?`
    )
    .all(user.id);

  const { getTrainingSummary } = require("../src/services/trainingCompletion.service");
  const summary = await getTrainingSummary(user.id);

  console.log("\n=== User ===");
  console.log(user);
  console.log("\n=== Manager ===");
  console.log(manager || "(none)");
  console.log("\n=== user_facilities ===");
  console.log(facilities);
  console.log("\n=== resource_progress count ===", progressRows.length);
  console.log(progressRows.slice(0, 20));
  if (progressRows.length > 20) console.log("... and", progressRows.length - 20, "more");

  console.log("\n=== assignments ===");
  console.log(assignments);

  const RESOURCE_CATEGORIES = ["finance", "sales", "hr", "safety", "production", "it"];
  const facList =
    facilities.length > 0
      ? facilities.map((r) => r.business_unit)
      : user.business_unit
        ? [user.business_unit]
        : [];

  console.log("\n=== Content in DB per facility/category ===");
  for (const facility of facList) {
    for (const category of RESOURCE_CATEGORIES) {
      const videos = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM lessons l JOIN courses c ON c.id = l.course_id
           WHERE c.business_unit = ? AND LOWER(TRIM(COALESCE(c.resource_category, ''))) = ?`
        )
        .get(facility, category);
      const docs = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM resource_documents
           WHERE business_unit = ? AND LOWER(TRIM(COALESCE(category, ''))) = ?`
        )
        .get(facility, category);
      const vn = Number(videos?.n ?? 0);
      const dn = Number(docs?.n ?? 0);
      if (vn || dn) console.log(`  ${facility}/${category}: ${vn} videos, ${dn} docs`);
    }
  }

  const coursesNoCategory = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM courses c
       WHERE c.business_unit IN (${facList.map(() => "?").join(",") || "NULL"})
         AND (c.resource_category IS NULL OR TRIM(c.resource_category) = '')`
    )
    .get(...facList);
  console.log("\n=== Courses in facilities WITHOUT resource_category ===", coursesNoCategory?.n);

  console.log("\n=== getTrainingSummary() ===");
  console.log(JSON.stringify(summary, null, 2));

  if (database.isPostgres) {
    const c = await database.getPool().connect();
    try {
      for (const t of ["employee_notifications", "manager_all_training_alerts", "all_training_milestones"]) {
        const r = await c.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
          [t]
        );
        console.log(`\n=== columns: ${t} ===`, r.rows.map((x) => x.column_name).join(", "));
      }
    } finally {
      c.release();
    }
  }

  if (manager) {
    const { getTeamOverview } = require("../src/services/managerTeam.service");
    try {
      const team = await getTeamOverview(manager.id);
      const emp = team.find((e) => e.id === user.id);
      console.log("\n=== manager team training_summary ===");
      console.log(JSON.stringify(emp?.training_summary, null, 2));
    } catch (e) {
      console.error("\n=== getTeamOverview FAILED ===", e.message);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
