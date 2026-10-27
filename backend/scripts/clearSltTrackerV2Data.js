#!/usr/bin/env node
/**
 * One-time SLT Tracker v2 data wipe.
 *
 * Deletes every row from the 11 tables that back the live "SLT Tracker"
 * tab (SltTrackerV2.jsx + its 6 services, routes under /cfo/slt/v2/*).
 * The feature itself — code, routes, UI, and the empty table schema — is
 * left fully intact so the tab keeps working; only the data is cleared,
 * ready for a step-by-step rebuild.
 *
 * Also clears the three old/legacy v1 tables (slt_action_items,
 * slt_calendar_events, slt_decisions). Those back a dead code path that
 * CfoReportsPage.jsx no longer renders (confirmed: activeTab === "slt"
 * always renders <SltTrackerV2 />) — nothing in the current UI reads
 * them — but Garima asked for them to be cleared too, so this wipes all
 * 14 tables.
 *
 * No backup is taken, per explicit instruction — this is NOT reversible.
 *
 * IMPORTANT — run this with the backend server STOPPED, then start the
 * server again afterward. The sqlite backend here is sql.js (an in-memory
 * database that's written back to disk on every write): if the server is
 * still running while this script runs, the server's own next save will
 * overwrite this script's deletes with its still-in-memory (undeleted)
 * copy, and the wipe will appear to silently fail.
 *
 * Usage (from the backend/ directory):
 *   node scripts/clearSltTrackerV2Data.js            # deletes the data
 *   node scripts/clearSltTrackerV2Data.js --dry-run   # only prints row counts, deletes nothing
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const dbModule = require("../src/config/db");

const TABLES = [
  // Live v2 tables (back the SltTrackerV2.jsx feature / "SLT Tracker" tab)
  "slt_actions",
  "slt_action_status_history",
  "slt_decision_queue",
  "slt_decision_register",
  "slt_commitments",
  "slt_commitment_checkins",
  "slt_calendar",
  "slt_links",
  "slt_audit_log",
  "slt_import_batches",
  "slt_import_raw_rows",
  // Legacy v1 tables (dead code path, no longer rendered anywhere, but
  // cleared too per explicit instruction)
  "slt_action_items",
  "slt_calendar_events",
  "slt_decisions",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  await dbModule.initDb();
  const db = dbModule.db;

  console.log(`Backend: ${dbModule.isPostgres ? "Postgres" : "SQLite"} (${dbModule.dbPath || "n/a"})`);
  console.log(dryRun ? "DRY RUN — no data will be deleted.\n" : "LIVE RUN — this will permanently delete data. No backup is taken.\n");

  const counts = {};
  for (const table of TABLES) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    counts[table] = Number(row?.n || 0);
  }

  const totalBefore = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log("Current row counts:");
  for (const table of TABLES) {
    console.log(`  ${table.padEnd(28)} ${counts[table]}`);
  }
  console.log(`  TOTAL: ${totalBefore}\n`);

  if (dryRun) {
    console.log("Dry run only — nothing was deleted. Re-run without --dry-run to actually clear this data.");
    return;
  }

  if (totalBefore === 0) {
    console.log("Nothing to delete — all 14 tables are already empty.");
    return;
  }

  for (const table of TABLES) {
    await db.exec(`DELETE FROM ${table};`);
  }

  console.log("Done. Verifying...\n");
  let totalAfter = 0;
  for (const table of TABLES) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    const n = Number(row?.n || 0);
    totalAfter += n;
    console.log(`  ${table.padEnd(28)} ${n}`);
  }

  if (totalAfter === 0) {
    console.log(`\nAll ${totalBefore} rows deleted across all 14 tables. The SLT Tracker tab and its schema are untouched.`);
  } else {
    console.log(`\nWARNING: ${totalAfter} rows remain across these tables — investigate before assuming the wipe is complete.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
