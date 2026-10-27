#!/usr/bin/env node
/**
 * One-time (re-runnable) loader for the Master Calendar sheet into the
 * live slt_calendar table — the real workbook data, not test rows.
 *
 * Reads only the "Master Calendar" sheet (same column mapping as
 * sltCalendar.service.js / the Master Calendar view in SltTrackerV2.jsx)
 * and inserts each event. This is a calendar-only sibling of
 * scripts/importSltWorkbooks.js's importCalendar() — same parsing logic,
 * but doesn't touch the Action Tracker workbook or its tables at all, so
 * it can run on its own.
 *
 * Idempotent: each row's immutable key is derived from its title + raw
 * event date (same scheme as importSltWorkbooks.js), so re-running this
 * after someone has already added/edited rows through the app won't
 * duplicate anything — existing rows (matched by key) are left alone.
 *
 * Usage (from the backend/ directory):
 *   node scripts/importMasterCalendarData.js            # imports
 *   node scripts/importMasterCalendarData.js --dry-run   # preview only, no writes
 *   node scripts/importMasterCalendarData.js --file=path/to/other.xlsx
 *
 * Defaults to scripts/slt_source/AGC_SLT_Calendar_Master_2026-2027.xlsx.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const fs = require("fs");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const dbModule = require("../src/config/db");
let db;

const DEFAULT_FILE = path.join(__dirname, "slt_source", "AGC_SLT_Calendar_Master_2026-2027.xlsx");

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
  return null;
}

// Same pattern as sltCalendar.service.js / importSltWorkbooks.js for text
// date ranges in the Event Date column: "Oct 17-21, 2026".
const TEXT_DATE_RANGE_RE = /^([A-Za-z]{3,})\s+(\d{1,2})\s*-\s*(\d{1,2}),\s*(\d{4})$/;

function parseTextDateRange(raw) {
  const m = TEXT_DATE_RANGE_RE.exec(String(raw).trim());
  if (!m) return null;
  const [, monthName, startDay, endDay, year] = m;
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) return null;
  const start = new Date(Number(year), monthIndex, Number(startDay));
  const end = new Date(Number(year), monthIndex, Number(endDay));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function main() {
  const args = parseArgs();
  console.log(`Master Calendar import — ${args.dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);
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
  const ws = wb.getWorksheet("Master Calendar");
  if (!ws) {
    console.error('Sheet "Master Calendar" not found in that file.');
    process.exit(1);
  }

  const hm = headerMap(ws, 2);
  let inserted = 0;
  let skippedExisting = 0;
  let skippedBlank = 0;

  let row = 3;
  while (row <= ws.rowCount) {
    const values = readRow(ws, row, hm);
    const title = textOrNull(values["Event / Deadline"]);
    if (!title) {
      row += 1;
      skippedBlank += 1;
      continue;
    }

    const eventDateRaw = values["Event Date"];
    let startDate = null;
    let endDate = null;
    let isTextDateRange = 0;
    if (eventDateRaw instanceof Date) {
      startDate = dateToIso(eventDateRaw);
      endDate = startDate;
    } else if (!isBlank(eventDateRaw)) {
      isTextDateRange = 1;
      const parsed = parseTextDateRange(eventDateRaw);
      if (parsed) {
        startDate = parsed.start;
        endDate = parsed.end;
      }
    }

    const immutableKey = crypto
      .createHash("sha256")
      .update(`${title}|${String(eventDateRaw)}`)
      .digest("hex")
      .slice(0, 16);

    const existing = await db.prepare("SELECT id FROM slt_calendar WHERE immutable_key = ?").get(immutableKey);
    if (existing) {
      skippedExisting += 1;
      row += 1;
      continue;
    }

    const prepDeadlineIso = dateToIso(values["Prep Deadline"]) || textOrNull(values["Prep Deadline"]);

    const fields = {
      event_id: `EVT-${immutableKey.slice(0, 8).toUpperCase()}`,
      immutable_key: immutableKey,
      month_raw: textOrNull(values["Month"]),
      // Store a clean ISO date for a real date, or the typed text for a
      // range — never String(aDateObject), which produces a full
      // "Tue Aug 18 2026 20:00:00 GMT-0400 (...)" toString().
      event_date_raw: eventDateRaw instanceof Date ? dateToIso(eventDateRaw) : textOrNull(eventDateRaw),
      is_text_date_range: isTextDateRange,
      start_date: startDate,
      end_date: endDate,
      event_title: title,
      category: textOrNull(values["Category"]),
      executives: textOrNull(values["Executive(s)"]),
      owner_lead: textOrNull(values["Owner / Lead"]),
      executive_action_required: textOrNull(values["Executive Action Required"]),
      prep_start_date: dateToIso(values["Prep Start Date"]) || textOrNull(values["Prep Start Date"]),
      prep_deadline: prepDeadlineIso,
      materials_needed: textOrNull(values["Materials Needed"]),
      notes: textOrNull(values["Notes"]),
    };

    if (!args.dryRun) {
      const cols = Object.keys(fields);
      const placeholders = cols.map(() => "?").join(", ");
      await db.prepare(`INSERT INTO slt_calendar (${cols.join(", ")}) VALUES (${placeholders})`).run(...cols.map((c) => fields[c]));
    }
    inserted += 1;
    console.log(`  ${args.dryRun ? "[dry-run] would insert" : "inserted"}: ${title} (${values["Event Date"]})`);
    row += 1;
  }

  console.log("\n=== Summary ===");
  console.log(`  ${args.dryRun ? "would insert" : "inserted"}: ${inserted}`);
  console.log(`  already present (skipped): ${skippedExisting}`);
  console.log(`  blank rows (skipped): ${skippedBlank}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
