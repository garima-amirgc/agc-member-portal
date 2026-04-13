/**
 * Removes legacy seeded demo data (upcoming widgets, demo employees/manager, demo courses with sample MP4s).
 * Run from the backend folder:  node scripts/removePlaceholderContent.js
 * Uses .env (DATABASE_URL for PostgreSQL, or SQLite when DATABASE_URL is unset).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const DEMO_COURSE_TITLES = [
  "Safety Fundamentals",
  "Product Deep Dive",
  "Compliance & Ethics",
  "Quality Systems Overview",
  "Audit & CAPA Essentials",
  "Supply Chain Compliance",
  "Supplier Risk Basics",
  "Process Safety Essentials",
  "Incident Management Playbook",
];

const DEMO_USER_EMAILS = [
  "jordan.rivers@company.com",
  "alex.chen@company.com",
  "sam.patel@company.com",
  "priya.shah@company.com",
  "neha.verma@company.com",
];

const SAMPLE_VIDEO_LIKE = "%storage.googleapis.com/gtv-videos-bucket%";

async function main() {
  const dbModule = require("../src/config/db");
  await dbModule.initDb();
  const { db } = dbModule;

  const qMarks = (n) => Array.from({ length: n }, () => "?").join(", ");

  console.log("Removing all upcoming / facility events (none are re-seeded on boot anymore)…");
  await db.prepare("DELETE FROM facility_upcoming").run();

  console.log("Removing demo courses (known titles)…");
  if (DEMO_COURSE_TITLES.length > 0) {
    await db
      .prepare(`DELETE FROM courses WHERE title IN (${qMarks(DEMO_COURSE_TITLES.length)})`)
      .run(...DEMO_COURSE_TITLES);
  }

  console.log("Removing courses that still reference Google sample MP4s…");
  await db
    .prepare(
      `DELETE FROM courses WHERE id IN (SELECT DISTINCT course_id FROM lessons WHERE video_url LIKE ?)`
    )
    .run(SAMPLE_VIDEO_LIKE);

  console.log("Clearing manager_id pointers to demo accounts…");
  if (DEMO_USER_EMAILS.length > 0) {
    await db
      .prepare(
        `UPDATE users SET manager_id = NULL WHERE manager_id IN (SELECT id FROM users WHERE email IN (${qMarks(
          DEMO_USER_EMAILS.length
        )}))`
      )
      .run(...DEMO_USER_EMAILS);
  }

  console.log("Removing IT tickets tied to demo users (assignee/submitter)…");
  if (DEMO_USER_EMAILS.length > 0) {
    await db
      .prepare(
        `DELETE FROM it_tickets WHERE user_id IN (SELECT id FROM users WHERE email IN (${qMarks(
          DEMO_USER_EMAILS.length
        )})) OR assignee_id IN (SELECT id FROM users WHERE email IN (${qMarks(DEMO_USER_EMAILS.length)}))`
      )
      .run(...DEMO_USER_EMAILS, ...DEMO_USER_EMAILS);
  }

  console.log("Removing demo users…");
  if (DEMO_USER_EMAILS.length > 0) {
    await db
      .prepare(`DELETE FROM users WHERE email IN (${qMarks(DEMO_USER_EMAILS.length)})`)
      .run(...DEMO_USER_EMAILS);
  }

  console.log("Done. Restart the API and refresh the admin UI.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
