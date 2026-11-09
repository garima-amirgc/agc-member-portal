#!/usr/bin/env node
/**
 * Re-runnable loader/syncer for the uploaded workbook's "90-Commitments"
 * sheet into the live slt_commitment_register table — the real existing
 * commitments from that sheet, not test rows. Same conventions as
 * scripts/importDecisions.js (its header comment explains the overall
 * pattern this mirrors): idempotent, UPSERT by a stable key, safe to re-run.
 *
 * UNLIKE the other import scripts, this sheet's real data does NOT start at
 * row 4/5 — it lives inside an Excel Table named "CommitmentsTable" whose
 * header row is row 12 and whose data starts row 13 (confirmed via
 * ws.tables["CommitmentsTable"].ref === "A12:W1418"). Everything below row
 * 13 through the table's full 1418-row extent is template/blank — only
 * rows with a non-blank "Commitment / deliverable" (column B) are real.
 *
 * Column mapping matches sltCommitmentRegister.service.js /
 * SltCommitmentBoard.jsx exactly. Columns I, J, L, S, U (Original Due,
 * 30-Day Due, 60-Day Due, Current Due, Report Cue) are the table's own
 * calculated columns and are never read here — they're derived server-side
 * in mapCommitment(), same reasoning as the other importers leaving out
 * their sheets' computed columns.
 *
 * Matching key: column W ("Immutable Key", e.g. "C90-K-xxxxxxxx") is a
 * real, literal, already-unique value per row in the sheet itself — used
 * directly as this table's immutable_key for matching, same as Action
 * Register's/Decisions' own stable sheet-provided keys. A row whose key
 * isn't in the DB yet is INSERTED; a row whose key already exists gets its
 * content fields UPDATED to match the sheet (archived is deliberately left
 * out of that update — if someone archived an imported commitment in the
 * portal, re-running this script must never silently bring it back).
 *
 * Usage (from the backend/ directory):
 *   node scripts/importCommitments.js            # imports/updates
 *   node scripts/importCommitments.js --dry-run   # preview only, no writes
 *   node scripts/importCommitments.js --file=path/to/other.xlsx
 *
 * Defaults to
 *   scripts/slt_source/SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const fs = require("fs");
const ExcelJS = require("exceljs");
const dbModule = require("../src/config/db");
let db;

const DEFAULT_FILE = path.join(
  __dirname,
  "slt_source",
  "SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx"
);

const SHEET_NAME = "90-Commitments";
const HEADER_ROW = 12;
const FIRST_DATA_ROW = 13;

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

// RAG Status in the sheet carries a leading emoji ("🔴 Not Started/ At
// Risk", "🟡 In Progress/Carried Forward", "🟢 Met/On Track") — stripped
// here to the plain text the app stores and the UI badges from, with
// spacing normalized around the slash to match
// sltCommitmentRegister.service.js's RAG_STATUS_OPTIONS exactly.
function normalizeRag(v) {
  const s = textOrNull(v);
  if (!s) return null;
  const stripped = s.replace(/^[^\w]+/u, "").trim();
  if (/not started/i.test(stripped)) return "Not Started / At Risk";
  if (/in progress/i.test(stripped)) return "In Progress / Carried Forward";
  if (/met/i.test(stripped)) return "Met / On Track";
  return stripped;
}

const totals = { inserted: 0, updated: 0, unchanged: 0, skippedBlank: 0 };

async function main() {
  const args = parseArgs();
  console.log(`90-Commitments import — ${args.dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);
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

  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) {
    console.error(`Sheet "${SHEET_NAME}" not found in that file.`);
    process.exit(1);
  }

  const hm = headerMap(ws, HEADER_ROW);
  let row = FIRST_DATA_ROW;
  console.log(`\n--- ${SHEET_NAME} ---`);
  while (row <= ws.rowCount) {
    const values = readRow(ws, row, hm);
    // Exact header strings confirmed directly against the uploaded
    // workbook's "90-Commitments" row 12 (openpyxl dump) — these are NOT
    // guesses; several (e.g. "Ext. Approval Date", "Date Assigned if
    // different from entry date") have idiosyncratic wording that a
    // plausible-sounding label would miss entirely.
    const commitmentText = textOrNull(values["Commitment / deliverable"]);
    const immutableKey = textOrNull(values["Immutable Key"]);

    if (!commitmentText) {
      row += 1;
      totals.skippedBlank += 1;
      continue;
    }

    // Every real row in this sheet already carries its own Immutable Key
    // (column W) — fall back to a generated one only in the unexpected case
    // a populated row is missing it, so the import never crashes on that.
    const key = immutableKey || `c90-gen-${row}`;

    const contentFields = {
      commitment: commitmentText,
      success_measure: textOrNull(values["Success Measure"]),
      owner: textOrNull(values["Owner"]),
      rag_status: normalizeRag(values["RAG Status"]) || "Not Started / At Risk",
      status_note: textOrNull(values["Status1"]),
      date_entered: dateToIso(values["Date record entered"]),
      date_assigned: dateToIso(values["Date Assigned if different from entry date"]),
      checkin_30_notes: textOrNull(values["30 Day Check-In Notes"]),
      checkin_60_notes: textOrNull(values["60 Day Check-In Notes"]),
      checkin_90_update_dates: textOrNull(values["90 Day Check-In Update Dates"]),
      extension_approved_by: textOrNull(values["Extension Approved By"]),
      ext_approval_date: dateToIso(values["Ext. Approval Date"]),
      revised_due: dateToIso(values["Revised due"]),
      delivered_on: dateToIso(values["Delivered on"]),
      completion_status: textOrNull(values["Status2"]) || "Open",
      change_risk_next_step: textOrNull(values["Change / risk / next step"]),
    };

    const existing = await db.prepare("SELECT * FROM slt_commitment_register WHERE immutable_key = ?").get(key);

    if (!existing) {
      const fields = { immutable_key: key, ...contentFields };
      if (!args.dryRun) {
        const cols = Object.keys(fields);
        const placeholders = cols.map(() => "?").join(", ");
        await db
          .prepare(`INSERT INTO slt_commitment_register (${cols.join(", ")}) VALUES (${placeholders})`)
          .run(...cols.map((c) => fields[c]));
      }
      totals.inserted += 1;
      console.log(`  ${args.dryRun ? "[dry-run] would insert" : "inserted"}: ${key} — ${commitmentText.slice(0, 60)}`);
      row += 1;
      continue;
    }

    const changedCols = Object.keys(contentFields).filter((c) => String(existing[c] ?? "") !== String(contentFields[c] ?? ""));
    if (changedCols.length === 0) {
      totals.unchanged += 1;
      row += 1;
      continue;
    }

    if (!args.dryRun) {
      const setClause = changedCols.map((c) => `${c} = ?`).join(", ");
      await db
        .prepare(`UPDATE slt_commitment_register SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...changedCols.map((c) => contentFields[c]), existing.id);
    }
    totals.updated += 1;
    console.log(`  ${args.dryRun ? "[dry-run] would update" : "updated"}: ${key} — ${commitmentText.slice(0, 60)} (${changedCols.join(", ")})`);
    row += 1;
  }

  console.log("\n=== Summary ===");
  console.log(`  ${args.dryRun ? "would insert" : "inserted"}: ${totals.inserted}`);
  console.log(`  ${args.dryRun ? "would update" : "updated"}: ${totals.updated}`);
  console.log(`  already up to date (unchanged): ${totals.unchanged}`);
  console.log(`  blank rows (skipped): ${totals.skippedBlank}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
