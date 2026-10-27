#!/usr/bin/env node
/**
 * One-time data fix for Master Calendar rows imported before the
 * event_date_raw bug (fixed in importMasterCalendarData.js) was caught.
 *
 * The bug: for a real-date Event Date cell, the importer did
 * `String(eventDateRaw)` on the JS Date object straight from ExcelJS,
 * which produces a full JS Date toString() — e.g.
 * "Tue Aug 18 2026 20:00:00 GMT-0400 (Eastern Daylight Time)" — instead of
 * a clean date. That full string got stored in event_date_raw and shown
 * as-is in the UI.
 *
 * The fix doesn't need to re-read the Excel file: for every affected row,
 * start_date was already computed correctly (via dateToIso()) at import
 * time, so this just copies start_date back into event_date_raw for any
 * row where is_text_date_range = 0 (a real date, not a text range like
 * "Oct 17-21, 2026") and event_date_raw isn't already a clean ISO date.
 *
 * Safe to re-run — rows that are already clean are left untouched, and
 * nothing is deleted.
 *
 * Usage (from the backend/ directory):
 *   node scripts/fixMasterCalendarEventDate.js            # applies the fix
 *   node scripts/fixMasterCalendarEventDate.js --dry-run  # preview only
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const dbModule = require("../src/config/db");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Master Calendar event_date_raw fix — ${dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);

  console.log("Connecting to database...");
  await dbModule.initDb();
  const db = dbModule.db;
  console.log("Database ready.");

  const rows = await db
    .prepare(
      `SELECT id, event_title, event_date_raw, start_date, is_text_date_range
       FROM slt_calendar
       WHERE is_text_date_range = 0`
    )
    .all();

  const broken = (rows || []).filter((r) => r.event_date_raw && !ISO_DATE_RE.test(String(r.event_date_raw).trim()));

  if (!broken.length) {
    console.log("No affected rows found — nothing to fix.");
    return;
  }

  console.log(`\nFound ${broken.length} affected row(s):`);
  for (const row of broken) {
    const fixedValue = row.start_date || null;
    console.log(
      `  #${row.id} "${row.event_title}": "${row.event_date_raw}" -> "${fixedValue ?? "(null — no start_date to fall back to)"}"`
    );
    if (!dryRun && fixedValue) {
      await db.prepare("UPDATE slt_calendar SET event_date_raw = ? WHERE id = ?").run(fixedValue, row.id);
    }
  }

  const noFallback = broken.filter((r) => !r.start_date).length;
  console.log("\n=== Summary ===");
  console.log(`  ${dryRun ? "would fix" : "fixed"}: ${broken.length - noFallback}`);
  if (noFallback) {
    console.log(`  skipped (no start_date to fall back to, left as-is): ${noFallback}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
