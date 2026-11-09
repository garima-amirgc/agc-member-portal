#!/usr/bin/env node
/**
 * Re-runnable loader/syncer for the uploaded workbook's "Decision Queue"
 * AND "Decision Register" sheets into the live slt_decision_register table
 * — the real existing decisions from both sheets, not test rows. Same
 * conventions as scripts/importActionRegister.js (its header comment
 * explains the overall pattern this mirrors): idempotent, UPSERT by a
 * stable key, safe to re-run.
 *
 * Column mapping matches sltDecisionRegister.service.js /
 * SltDecisionBoard.jsx exactly — Decision Required, Workstream, Assigned
 * To, Decision Deadline, Recommendation, Status, Decision Type, CEO/CFO
 * Attention, Financial Impact, Risk Impact, Strategic Objective, Decision
 * Date, Further Action Required, Context / Input Required, Owned By,
 * Requested By, Date Raised, Delay Impact / Risk, Blocker / Waiting On,
 * Notes (columns A:U on both sheets — identical layout, confirmed
 * column-for-column). The sheets' legacy "Decision Log" columns (V:AN —
 * Queue Immutable Key, Active Record, Decision Log ID, and so on) are
 * never read, same reasoning as Action Register leaving out its own
 * computed columns: Active Record is derived here instead (see
 * mapDecision() in sltDecisionRegister.service.js), and the rest of V:AN
 * is a leftover sub-schema from an earlier workbook iteration that's
 * mostly blank/inconsistent in the real data (confirmed against the
 * uploaded file: "Queue Immutable Key" is empty on every single Decision
 * Register row, including ones that clearly originated from the Queue).
 *
 * TWO SHEETS, ONE TABLE: unlike Action Register, this reads BOTH sheets in
 * one run. In the source workbook, Decision Queue and Decision Register
 * are a manual two-sheet workflow — a decision lives in Decision Queue
 * while pending, and once decided someone copies the row into Decision
 * Register and clears it from the Queue (see Decision Queue!A3). The new
 * table replaces that manual copy/clear with one row per decision whose
 * Status alone determines whether it's shown in the app's Decision Queue
 * or Decision Register tab (see the longer design-deviation note at the
 * top of sltDecisionRegister.service.js). So this script simply imports
 * every populated row from BOTH sheets into the same table — a decision
 * still sitting in the source Decision Queue sheet with Status=Completed
 * that was never manually archived, for instance, lands in the app's
 * Decision Register automatically, which is the whole point.
 *
 * Matching key: unlike Action Register (which had to derive its own hash
 * key), both these sheets already have a real, literal unique value per
 * row — "Decision ID" (column A, e.g. "DEC-0001" from the Queue or
 * "HIST-2026-001" from the Register) — enforced unique across BOTH sheets
 * combined by the sheets' own "ID Check" formula (column AN). So that's
 * used directly as this table's immutable_key for matching: a row whose
 * key isn't in the DB yet is INSERTED; a row whose key already exists gets
 * its content fields UPDATED to match the sheet (archived is deliberately
 * left out of that update, same reasoning as Action Register's importer —
 * if someone archived an imported decision in the portal, re-running this
 * script must never silently bring it back). Confirmed against the
 * uploaded file: zero Decision IDs appear in both sheets at once, so there
 * is no real ordering dependency between the two passes below — but
 * Decision Queue is still read first, Decision Register second, so that if
 * the workbook's own data ever drifts (a row manually copied to Register
 * without being cleared from Queue), the Register copy — the one meant to
 * be final — wins.
 *
 * Unlike Action Register, there's no "Date Added"/"Last Updated" pair on
 * these sheets to backdate created_at/updated_at from — "Date Raised"
 * (column R) already has an honest home as this table's own date_raised
 * business field, so it's imported there, not repurposed as a database
 * audit timestamp. Imported decisions simply get created_at/updated_at of
 * "now", like any other row inserted through the API.
 *
 * Usage (from the backend/ directory):
 *   node scripts/importDecisions.js            # imports/updates
 *   node scripts/importDecisions.js --dry-run   # preview only, no writes
 *   node scripts/importDecisions.js --file=path/to/other.xlsx
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

// Shared counters across both sheets.
const totals = { inserted: 0, updated: 0, unchanged: 0, skippedBlank: 0 };

async function importSheet(wb, sheetName, args) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) {
    console.error(`Sheet "${sheetName}" not found in that file.`);
    process.exit(1);
  }

  const hm = headerMap(ws, 4);
  let row = 5;
  console.log(`\n--- ${sheetName} ---`);
  while (row <= ws.rowCount) {
    const values = readRow(ws, row, hm);
    const decisionId = textOrNull(values["Decision ID"]);
    const decisionRequired = textOrNull(values["Decision Required"]);
    if (!decisionId || !decisionRequired) {
      row += 1;
      totals.skippedBlank += 1;
      continue;
    }

    const immutableKey = decisionId;

    const contentFields = {
      decision_required: decisionRequired,
      workstream: textOrNull(values["Workstream"]),
      assigned_to: textOrNull(values["Assigned To"]),
      decision_deadline: dateToIso(values["Decision Deadline"]),
      recommendation: textOrNull(values["Recommendation"]),
      status: textOrNull(values["Status"]) || "Not Started",
      decision_type: textOrNull(values["Decision Type"]),
      ceo_cfo_attention: textOrNull(values["CEO/CFO Attention"]),
      financial_impact: textOrNull(values["Financial Impact"]),
      risk_impact: textOrNull(values["Risk Impact"]),
      strategic_objective: textOrNull(values["Strategic Objective"]),
      decision_date: dateToIso(values["Decision Date"]),
      further_action_required: textOrNull(values["Further Action Required"]) || "No",
      context_input_required: textOrNull(values["Context / Input Required"]),
      owned_by: textOrNull(values["Owned By"]),
      requested_by: textOrNull(values["Requested By"]),
      date_raised: dateToIso(values["Date Raised"]),
      delay_impact_risk: textOrNull(values["Delay Impact / Risk"]),
      blocker: textOrNull(values["Blocker / Waiting On"]),
      notes: textOrNull(values["Notes"]),
    };

    const existing = await db.prepare("SELECT * FROM slt_decision_register WHERE immutable_key = ?").get(immutableKey);

    if (!existing) {
      const fields = { immutable_key: immutableKey, ...contentFields };
      if (!args.dryRun) {
        const cols = Object.keys(fields);
        const placeholders = cols.map(() => "?").join(", ");
        await db.prepare(`INSERT INTO slt_decision_register (${cols.join(", ")}) VALUES (${placeholders})`).run(...cols.map((c) => fields[c]));
      }
      totals.inserted += 1;
      console.log(`  ${args.dryRun ? "[dry-run] would insert" : "inserted"}: ${decisionId} — ${decisionRequired}`);
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
        .prepare(`UPDATE slt_decision_register SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...changedCols.map((c) => contentFields[c]), existing.id);
    }
    totals.updated += 1;
    console.log(`  ${args.dryRun ? "[dry-run] would update" : "updated"}: ${decisionId} — ${decisionRequired} (${changedCols.join(", ")})`);
    row += 1;
  }
}

async function main() {
  const args = parseArgs();
  console.log(`Decision Queue / Decision Register import — ${args.dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);
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

  // Decision Queue first, Decision Register second — see the module
  // comment above for why (Register wins on the rare chance a Decision ID
  // somehow exists in both sheets; confirmed there are none in the
  // uploaded file today).
  await importSheet(wb, "Decision Queue", args);
  await importSheet(wb, "Decision Register", args);

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
