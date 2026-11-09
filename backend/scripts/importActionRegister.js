#!/usr/bin/env node
/**
 * Re-runnable loader/syncer for the uploaded workbook's "Action Register"
 * sheet into the live slt_action_register table — the real existing data
 * from the sheet, not test rows. Same conventions as
 * scripts/importMasterCalendarData.js (its header comment explains the
 * overall pattern this mirrors): idempotent, UPSERT by a stable key, safe
 * to re-run.
 *
 * Column mapping matches sltActionRegister.service.js /
 * SltActionTrackerBoard.jsx exactly — Item, Category, Owner, Next Action,
 * Due Date, Status, Priority, Risk Impact, Strategic Objective, Escalation
 * Required, Financial Impact, ASP Readiness Stream, Blocker / Waiting On,
 * Notes. The sheet's three *computed* columns (SLT Item ID, Flag, Active
 * Record) are never read — the portal derives those itself (see
 * mapActionItem() in the service). Date Added / Last Updated ARE read,
 * though, and used for created_at/updated_at on a brand-new row, so an
 * imported item shows its real original history instead of "just now."
 *
 * Unlike Master Calendar (which had to derive its own hash key, since the
 * sheet had nothing stable), this sheet already has a real, literal unique
 * value per row — "SLT Immutable Key" (e.g. "SLT-K-0001", column S) — so
 * that's used directly as this table's immutable_key for matching: a row
 * whose key isn't in the DB yet is INSERTED; a row whose key already
 * exists gets its content fields UPDATED to match the sheet (archived is
 * deliberately left out of that update — if someone archived an imported
 * item in the portal, re-running this script must never silently bring it
 * back).
 *
 * Usage (from the backend/ directory):
 *   node scripts/importActionRegister.js            # imports/updates
 *   node scripts/importActionRegister.js --dry-run   # preview only, no writes
 *   node scripts/importActionRegister.js --file=path/to/other.xlsx
 *
 * Defaults to
 *   scripts/slt_source/SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const fs = require("fs");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const dbModule = require("../src/config/db");
let db;

const DEFAULT_FILE = path.join(
  __dirname,
  "slt_source",
  "SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx"
);

function parseArgs() {
  const args = { dryRun: false, file: DEFAULT_FILE };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
  }
  return args;
}

function cellDisplayValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.error) return `#${v.error}#`;
    if (v.result !== undefined) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return v.text;
    return null;
  }
  return v;
}

function headerMap(worksheet, headerRow) {
  const map = {};
  const row = worksheet.getRow(headerRow);
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const v = cell.value;
    if (v != null && String(v).trim() !== "") map[String(v).trim()] = colNumber;
  });
  return map;
}

function readRow(worksheet, rowNum, headerMapObj) {
  const row = worksheet.getRow(rowNum);
  const values = {};
  for (const [header, col] of Object.entries(headerMapObj)) {
    values[header] = cellDisplayValue(row.getCell(col));
  }
  return values;
}

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

function textOrNull(v) {
  if (isBlank(v)) return null;
  return String(v).trim();
}

function dateToIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return null;
}

function timestampIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
}

async function main() {
  const args = parseArgs();
  console.log(`Action Register import — ${args.dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);
  console.log(`  file: ${args.file}`);

  if (!fs.existsSync(args.file)) {
    console.error(`File not found: ${args.file}`);
    process.exit(1);
  }

  console.log("Connecting to database...");
  await dbModule.initDb();
  db = dbModule.db;
  console.log("Database ready.");

  console.log("Reading workbook...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.file);
  const ws = wb.getWorksheet("Action Register");
  if (!ws) {
    console.error('Sheet "Action Register" not found in that file.');
    process.exit(1);
  }

  const hm = headerMap(ws, 4);
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedBlank = 0;

  let row = 5;
  while (row <= ws.rowCount) {
    const values = readRow(ws, row, hm);
    const item = textOrNull(values["Item"]);
    if (!item) {
      row += 1;
      skippedBlank += 1;
      continue;
    }

    const sheetKey = textOrNull(values["SLT Immutable Key"]);
    // Fallback for the unlikely case a row has no key of its own — derived
    // the same way importMasterCalendarData.js derives one, so it's still
    // stable across re-runs.
    const immutableKey =
      sheetKey ||
      crypto.createHash("sha256").update(`${item}|${String(values["Due Date"])}`).digest("hex").slice(0, 16);

    const contentFields = {
      item,
      category: textOrNull(values["Category"]),
      owner: textOrNull(values["Owner"]),
      next_action: textOrNull(values["Next Action"]),
      due_date: dateToIso(values["Due Date"]),
      status: textOrNull(values["Status"]) || "Not Started",
      priority: textOrNull(values["Priority"]) || "Medium",
      risk_impact: textOrNull(values["Risk Impact"]),
      strategic_objective: textOrNull(values["Strategic Objective"]),
      escalation_required: textOrNull(values["Escalation Required"]) || "No",
      financial_impact: textOrNull(values["Financial Impact"]),
      asp_readiness_stream: textOrNull(values["ASP Readiness Stream"]),
      blocker: textOrNull(values["Blocker / Waiting On"]),
      notes: textOrNull(values["Notes"]),
    };

    const existing = await db.prepare("SELECT * FROM slt_action_register WHERE immutable_key = ?").get(immutableKey);

    if (!existing) {
      const dateAdded = timestampIso(values["Date Added"]);
      const lastUpdated = timestampIso(values["Last Updated"]) || dateAdded;
      const fields = { immutable_key: immutableKey, ...contentFields };
      if (dateAdded) fields.created_at = dateAdded;
      if (lastUpdated) fields.updated_at = lastUpdated;
      if (!args.dryRun) {
        const cols = Object.keys(fields);
        const placeholders = cols.map(() => "?").join(", ");
        await db.prepare(`INSERT INTO slt_action_register (${cols.join(", ")}) VALUES (${placeholders})`).run(...cols.map((c) => fields[c]));
      }
      inserted += 1;
      console.log(`  ${args.dryRun ? "[dry-run] would insert" : "inserted"}: ${item} (${immutableKey})`);
      row += 1;
      continue;
    }

    const changedCols = Object.keys(contentFields).filter((c) => String(existing[c] ?? "") !== String(contentFields[c] ?? ""));
    if (changedCols.length === 0) {
      unchanged += 1;
      row += 1;
      continue;
    }

    if (!args.dryRun) {
      const setClause = changedCols.map((c) => `${c} = ?`).join(", ");
      await db
        .prepare(`UPDATE slt_action_register SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...changedCols.map((c) => contentFields[c]), existing.id);
    }
    updated += 1;
    console.log(`  ${args.dryRun ? "[dry-run] would update" : "updated"}: ${item} (${immutableKey}) — ${changedCols.join(", ")}`);
    row += 1;
  }

  console.log("\n=== Summary ===");
  console.log(`  ${args.dryRun ? "would insert" : "inserted"}: ${inserted}`);
  console.log(`  ${args.dryRun ? "would update" : "updated"}: ${updated}`);
  console.log(`  already up to date (unchanged): ${unchanged}`);
  console.log(`  blank rows (skipped): ${skippedBlank}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
