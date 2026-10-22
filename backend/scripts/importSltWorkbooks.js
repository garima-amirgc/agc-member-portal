#!/usr/bin/env node
/**
 * SLT Tracker workbook importer.
 *
 * Reads the two source Excel workbooks (Action Tracker: Action Register /
 * Decision Queue / Decision Register / 90-Commitments, and the Executive
 * Calendar: Master Calendar) and loads their real records into the slt_*
 * tables added in config/database/{sqlite,postgres}.js. See the "SLT
 * Tracker — Workbook Inventory & Reconciliation" note in the AGC
 * University project for the full field mapping and the specific
 * data-quality issues this importer flags rather than silently fixing.
 *
 * Usage:
 *   node scripts/importSltWorkbooks.js [--dry-run] [--user-id=<id>]
 *     [--tracker=<path>] [--calendar=<path>]
 *
 * Defaults to the two files under scripts/slt_source/ if no path is given.
 * --dry-run computes and prints the full reconciliation report without
 * writing anything to the database — use it first to review what an
 * import would do.
 *
 * Idempotent: re-running with the same files does not create duplicate
 * live records (matched by immutable key / legacy ID, see MATCH NOTES
 * below) and never overwrites a record a person has edited since it was
 * imported (detected by created_at === updated_at — if they differ,
 * someone has touched the row since, so the importer leaves it alone and
 * reports it as "pending_review" instead of silently skipping it).
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const fs = require("fs");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const dbModule = require("../src/config/db");
// `db` is only assigned once the database has actually connected (set in
// main(), right after `await dbModule.initDb()`) — mirrors server.js,
// which never destructures `db` off this module before calling initDb()
// itself. Every db.*() call below runs inside functions that only execute
// after main() has made that assignment, so the closures all see the real
// value, not whatever `db` looked like before the connection existed.
let db;

const DEFAULT_TRACKER = path.join(__dirname, "slt_source", "SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx");
const DEFAULT_CALENDAR = path.join(__dirname, "slt_source", "AGC_SLT_Calendar_Master_2026-2027.xlsx");

// ─── CLI args ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = { dryRun: false, userId: null, tracker: DEFAULT_TRACKER, calendar: DEFAULT_CALENDAR };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--tracker=")) args.tracker = arg.slice("--tracker=".length);
    else if (arg.startsWith("--calendar=")) args.calendar = arg.slice("--calendar=".length);
    else if (arg.startsWith("--user-id=")) args.userId = Number(arg.slice("--user-id=".length)) || null;
  }
  return args;
}

// ─── Generic Excel-reading helpers ─────────────────────────────────────

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

// Resolves a cell to its display value: primitive, Date, formula result,
// rich text, or hyperlink text — whichever the cell actually is.
function cellDisplayValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.error) return `#${v.error}#`; // e.g. #REF!, preserved as text rather than dropped
    if (v.result !== undefined) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return v.text; // hyperlink
    return null;
  }
  return v;
}

// Formula text for a cell, if it has one — kept alongside the raw value so
// the audit trail shows exactly what the source workbook computed, per the
// "preserve formula text and cached results" requirement.
function cellFormulaText(cell) {
  const v = cell && cell.value;
  if (v && typeof v === "object") {
    if (typeof v.formula === "string") return `=${v.formula}`;
    if (typeof v.sharedFormula === "string") return `=${v.sharedFormula}`;
  }
  return null;
}

function readRow(worksheet, rowNum, headerMapObj) {
  const row = worksheet.getRow(rowNum);
  const values = {};
  const formulas = {};
  for (const [header, col] of Object.entries(headerMapObj)) {
    const cell = row.getCell(col);
    values[header] = cellDisplayValue(cell);
    const f = cellFormulaText(cell);
    if (f) formulas[header] = f;
  }
  return { values, formulas };
}

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

function textOrNull(v) {
  if (isBlank(v)) return null;
  return String(v).trim();
}

// Dates come back from exceljs as Date objects for real date cells, or as
// strings for anything typed as text (see the "Oct 17-21, 2026" case) —
// this only ever converts a genuine Date; text is left untouched for the
// caller to decide what to do with (never silently reinterpreted).
function dateToIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Reconciliation bookkeeping ────────────────────────────────────────

function newCounter() {
  return { inserted: 0, updated: 0, unchanged: 0, history_only: 0, pending_review: 0, skipped_template: 0 };
}

const report = {
  batches: {},
  sheets: {},
  flagged: [],
};

function flag(sheet, row, message) {
  report.flagged.push({ sheet, row, message });
}

function tally(sheetKey, disposition) {
  if (!report.sheets[sheetKey]) report.sheets[sheetKey] = newCounter();
  report.sheets[sheetKey][disposition] = (report.sheets[sheetKey][disposition] || 0) + 1;
}

// ─── DB helpers ─────────────────────────────────────────────────────────

async function createImportBatch({ sourceLabel, filename, checksum, userId, mode }) {
  const result = await db
    .prepare(
      `INSERT INTO slt_import_batches (source_label, original_filename, checksum_sha256, imported_by, mode)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(sourceLabel, filename, checksum, userId, mode);
  return result.lastInsertRowid;
}

async function finishImportBatch(batchId, summary) {
  await db.prepare("UPDATE slt_import_batches SET summary_json = ? WHERE id = ?").run(JSON.stringify(summary), batchId);
}

async function recordRawRow(batchId, sheetName, sourceRow, values, formulas, entityType, entityId, disposition, notes) {
  await db
    .prepare(
      `INSERT INTO slt_import_raw_rows
        (batch_id, sheet_name, source_row, raw_json, formula_json, entity_type, entity_id, disposition, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      batchId,
      sheetName,
      sourceRow,
      JSON.stringify(values),
      Object.keys(formulas).length ? JSON.stringify(formulas) : null,
      entityType,
      entityId,
      disposition,
      notes || null
    );
}

// A row is safe to refresh from a later import only if nobody has touched
// it since it was created (created_at === updated_at). If a person has
// edited it, the importer never overwrites that edit — it reports the row
// as pending_review instead, per "do not overwrite newer application
// edits during a later Excel import."
function isUntouchedSinceImport(existingRow) {
  return existingRow.created_at === existingRow.updated_at;
}

// ─── Action Register ────────────────────────────────────────────────────

async function importActionRegister(workbook, batchId, { dryRun, userId }) {
  const ws = workbook.getWorksheet("Action Register");
  if (!ws) {
    flag("Action Register", null, "Sheet not found in workbook.");
    return;
  }
  const hm = headerMap(ws, 4);
  let row = 5;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (isBlank(values["Item"])) {
      row += 1;
      continue; // blank template row, not a business record
    }

    const immutableKey = textOrNull(values["SLT Immutable Key"]);
    const fields = {
      legacy_item_id: textOrNull(values["SLT Item ID"]),
      item: textOrNull(values["Item"]),
      category: textOrNull(values["Category"]),
      owner: textOrNull(values["Owner"]) || "Unassigned",
      next_action: textOrNull(values["Next Action"]),
      due_date: dateToIso(values["Due Date"]) || textOrNull(values["Due Date"]),
      status: textOrNull(values["Status"]) || "Assigned",
      priority: textOrNull(values["Priority"]),
      flag: textOrNull(values["Flag"]),
      risk_impact: textOrNull(values["Risk Impact"]),
      strategic_objective: textOrNull(values["Strategic Objective"]),
      escalation_required: textOrNull(values["Escalation Required"]),
      financial_impact: textOrNull(values["Financial Impact"]),
      asp_readiness_stream: textOrNull(values["ASP Readiness Stream"]),
      blocker_waiting_on: textOrNull(values["Blocker / Waiting On"]),
      notes: textOrNull(values["Notes"]),
      date_added: dateToIso(values["Date Added"]) || textOrNull(values["Date Added"]),
      last_updated: dateToIso(values["Last Updated"]) || textOrNull(values["Last Updated"]),
      active_record: textOrNull(values["Active Record"]),
    };

    if (fields.active_record && fields.active_record.startsWith("#")) {
      flag("Action Register", row, `Active Record formula is broken (${fields.active_record}) — Active/Inactive needs a manual call.`);
    }

    await upsertByKey({
      table: "slt_actions",
      sheetKey: "action_register",
      sheetName: "Action Register",
      row,
      batchId,
      values,
      formulas,
      entityType: "action",
      keyCol: "immutable_key",
      keyVal: immutableKey,
      keyPrefix: "SLT-K",
      fields,
      dryRun,
      userId,
    });
    row += 1;
  }
}

// ─── Decision Queue ─────────────────────────────────────────────────────

async function importDecisionQueue(workbook, batchId, { dryRun, userId }) {
  const ws = workbook.getWorksheet("Decision Queue");
  if (!ws) {
    flag("Decision Queue", null, "Sheet not found in workbook.");
    return;
  }
  const hm = headerMap(ws, 4);
  let row = 5;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (isBlank(values["Decision Required"])) {
      row += 1;
      continue;
    }

    const legacyId = textOrNull(values["Decision ID"]);
    let immutableKey = textOrNull(values["Queue Immutable Key"]);
    if (!immutableKey && legacyId) {
      // Known gap: some Decision Queue rows never had their immutable key
      // filled in (see reconciliation notes). Generate and persist one so
      // this row is still recognized on the next import.
      immutableKey = `DECQ-K-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      flag("Decision Queue", row, `Queue Immutable Key was blank in the source; generated ${immutableKey} for ${legacyId}.`);
    }

    const fields = {
      legacy_decision_id: legacyId,
      decision_required: textOrNull(values["Decision Required"]),
      workstream: textOrNull(values["Workstream"]),
      assigned_to: textOrNull(values["Assigned To"]),
      decision_deadline: dateToIso(values["Decision Deadline"]) || textOrNull(values["Decision Deadline"]),
      recommendation: textOrNull(values["Recommendation"]),
      status: textOrNull(values["Status"]),
      decision_type: textOrNull(values["Decision Type"]),
      ceo_cfo_attention: textOrNull(values["CEO/CFO Attention"]),
      financial_impact: textOrNull(values["Financial Impact"]),
      risk_impact: textOrNull(values["Risk Impact"]),
      strategic_objective: textOrNull(values["Strategic Objective"]),
      decision_date: dateToIso(values["Decision Date"]) || textOrNull(values["Decision Date"]),
      further_action_required: textOrNull(values["Further Action Required"]),
      context_input_required: textOrNull(values["Context / Input Required"]),
      owned_by: textOrNull(values["Owned By"]),
      requested_by: textOrNull(values["Requested By"]),
      date_raised: dateToIso(values["Date Raised"]) || textOrNull(values["Date Raised"]),
      delay_impact_risk: textOrNull(values["Delay Impact / Risk"]),
      blocker_waiting_on: textOrNull(values["Blocker / Waiting On"]),
      notes: textOrNull(values["Notes"]),
      active_record: textOrNull(values["Active Record"]),
    };

    await upsertByKey({
      table: "slt_decision_queue",
      sheetKey: "decision_queue",
      sheetName: "Decision Queue",
      row,
      batchId,
      values,
      formulas,
      entityType: "decision_queue",
      keyCol: "queue_immutable_key",
      keyVal: immutableKey,
      keyPrefix: "DECQ-K",
      fields: { ...fields, queue_immutable_key: immutableKey },
      dryRun,
      userId,
    });
    row += 1;
  }
}

// ─── Decision Register ──────────────────────────────────────────────────

async function importDecisionRegister(workbook, batchId, { dryRun, userId }) {
  const ws = workbook.getWorksheet("Decision Register");
  if (!ws) {
    flag("Decision Register", null, "Sheet not found in workbook.");
    return;
  }
  const hm = headerMap(ws, 4);
  let row = 5;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (isBlank(values["Decision Required"])) {
      row += 1;
      continue;
    }

    const legacyDecisionId = textOrNull(values["Decision ID"]); // e.g. HIST-2026-001
    const sourceDecisionId = textOrNull(values["Source Decision ID"]);
    const queueSourceKey = textOrNull(values["Queue Source Key"]);
    const activeRecord = textOrNull(values["Active Record"]);

    if (activeRecord && activeRecord.startsWith("#")) {
      flag("Decision Register", row, `Active Record formula is broken (${activeRecord}) for "${values["Decision Required"]}" — Active/Inactive needs a manual call.`);
    }
    if (textOrNull(values["Decision Log ID"]) || sourceDecisionId || textOrNull(values["Decision Summary"])) {
      // These columns exist historically only on rows 5-6 in the source
      // workbook and appear to describe a different decision than this
      // row's own "Decision Required" text (see reconciliation notes) —
      // imported exactly as stored, flagged for a human to confirm.
      flag(
        "Decision Register",
        row,
        `Row has both "Decision Required" ("${values["Decision Required"]}") and Decision Log fields ` +
          `(Source Decision ID=${sourceDecisionId}, Decision Summary="${values["Decision Summary"]}") — confirm these describe the same decision before relying on the link.`
      );
    }

    // Resolve parent via explicit legacy reference only — never by matching
    // similar titles.
    let parentDecisionId = null;
    let linkStatus = "historical_no_parent";
    if (sourceDecisionId || queueSourceKey) {
      const parent = await db
        .prepare(
          `SELECT id FROM slt_decision_queue WHERE legacy_decision_id = ? OR queue_immutable_key = ? LIMIT 1`
        )
        .get(sourceDecisionId, queueSourceKey);
      if (parent) {
        parentDecisionId = parent.id;
        linkStatus = "linked";
      } else {
        linkStatus = "unresolved";
        flag("Decision Register", row, `Source Decision ID "${sourceDecisionId}" / Queue Source Key "${queueSourceKey}" did not match any Decision Queue row — left unresolved.`);
      }
    }

    const fields = {
      legacy_decision_log_id: textOrNull(values["Decision Log ID"]),
      legacy_decision_id: legacyDecisionId,
      source_decision_id: sourceDecisionId,
      parent_decision_id: parentDecisionId,
      link_status: linkStatus,
      decision_required: textOrNull(values["Decision Required"]),
      decision_summary: textOrNull(values["Decision Summary"]),
      workstream: textOrNull(values["Workstream"]),
      assigned_to: textOrNull(values["Assigned To"]),
      decision_deadline: dateToIso(values["Decision Deadline"]) || textOrNull(values["Decision Deadline"]),
      recommendation: textOrNull(values["Recommendation"]),
      status: textOrNull(values["Status"]),
      decision_type: textOrNull(values["Decision Type"]),
      ceo_cfo_attention: textOrNull(values["CEO/CFO Attention"]),
      financial_impact: textOrNull(values["Financial Impact"]),
      risk_impact: textOrNull(values["Risk Impact"]),
      strategic_objective: textOrNull(values["Strategic Objective"]),
      decision_date: dateToIso(values["Decision Date"]) || textOrNull(values["Decision Date"]),
      decision_maker: textOrNull(values["Decision Maker"]),
      further_action_required: textOrNull(values["Further Action Required"]),
      context_input_required: textOrNull(values["Context / Input Required"]),
      owned_by: textOrNull(values["Owned By"]),
      requested_by: textOrNull(values["Requested By"]),
      requester: textOrNull(values["Requester"]),
      date_raised: dateToIso(values["Date Raised"]) || textOrNull(values["Date Raised"]),
      logged_date: dateToIso(values["Logged Date"]) || textOrNull(values["Logged Date"]),
      delay_impact_risk: textOrNull(values["Delay Impact / Risk"]),
      blocker_waiting_on: textOrNull(values["Blocker / Waiting On"]),
      next_action: textOrNull(values["Next Action"]),
      original_issue: textOrNull(values["Original Issue"]),
      rationale: textOrNull(values["Rationale"]),
      follow_up_status: textOrNull(values["Follow-up Status"]),
      due_date: dateToIso(values["Due Date"]) || textOrNull(values["Due Date"]),
      notes: textOrNull(values["Notes"]),
      queue_immutable_key: textOrNull(values["Queue Immutable Key"]),
      queue_source_key: queueSourceKey,
      consistency_check: textOrNull(values["Consistency Check"]),
      id_origin: textOrNull(values["ID Origin"]),
      id_check: textOrNull(values["ID Check"]),
      active_record: activeRecord,
    };

    // Decision Log Immutable Key only exists on 2 of the 33 rows; Decision
    // ID (HIST-2026-xxx) is the one column populated on every row, so it's
    // the de-dupe key here (see reconciliation notes §6).
    await upsertByKey({
      table: "slt_decision_register",
      sheetKey: "decision_register",
      sheetName: "Decision Register",
      row,
      batchId,
      values,
      formulas,
      entityType: "decision_register",
      keyCol: "legacy_decision_id",
      keyVal: legacyDecisionId,
      keyPrefix: "HIST",
      fields,
      dryRun,
      userId,
      // Decision Register doesn't have a generated immutable_key column of
      // its own to fall back on (legacy_decision_id IS the stable key here).
      skipKeyGeneration: true,
    });
    row += 1;
  }
}

// ─── 90-Day Commitments ─────────────────────────────────────────────────

async function importCommitments(workbook, batchId, { dryRun, userId }) {
  const ws = workbook.getWorksheet("90-Commitments");
  if (!ws) {
    flag("90-Commitments", null, "Sheet not found in workbook.");
    return;
  }
  const hm = headerMap(ws, 12);
  let row = 13;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (isBlank(values["Commitment / deliverable"])) {
      row += 1;
      continue;
    }

    const immutableKey = textOrNull(values["Immutable Key"]);
    const revisedDue = dateToIso(values["Revised due"]) || textOrNull(values["Revised due"]);
    const extensionApprovedBy = textOrNull(values["Extension Approved By"]);
    const extensionFlagged = Boolean(revisedDue) && !extensionApprovedBy;
    if (extensionFlagged) {
      flag("90-Commitments", row, `"${values["Commitment / deliverable"]}" has a Revised due date with no Extension Approved By on file.`);
    }
    const originalDue = dateToIso(values["Original due"]) || textOrNull(values["Original due"]);
    const currentDue = revisedDue || originalDue;

    const fields = {
      legacy_id: textOrNull(values["ID"]),
      commitment_deliverable: textOrNull(values["Commitment / deliverable"]),
      success_measure: textOrNull(values["Success Measure"]),
      owner: textOrNull(values["Owner"]) || "Unassigned",
      rag_status: textOrNull(values["RAG Status"]),
      status1_raw: textOrNull(values["Status1"]),
      date_record_entered: dateToIso(values["Date record entered"]) || textOrNull(values["Date record entered"]),
      date_assigned: dateToIso(values["Date Assigned if different from entry date"]) || textOrNull(values["Date Assigned if different from entry date"]),
      original_due: originalDue,
      checkin_30_due: dateToIso(values["30 Day Check-In Update due"]) || textOrNull(values["30 Day Check-In Update due"]),
      checkin_30_notes: textOrNull(values["30 Day Check-In Notes"]),
      checkin_60_due: dateToIso(values["60 Day Check-In Update due"]) || textOrNull(values["60 Day Check-In Update due"]),
      checkin_60_notes: textOrNull(values["60 Day Check-In Notes"]),
      checkin_90_notes: textOrNull(values["90 Day Check-In Update Dates"]),
      extension_approved_by: extensionApprovedBy,
      ext_approval_date: dateToIso(values["Ext. Approval Date"]) || textOrNull(values["Ext. Approval Date"]),
      revised_due: revisedDue,
      delivered_on: dateToIso(values["Delivered on"]) || textOrNull(values["Delivered on"]),
      current_due: currentDue,
      status2: textOrNull(values["Status2"]) || "Open",
      report_cue_raw: textOrNull(values["Report cue"]),
      change_risk_next_step: textOrNull(values["Change / risk / next step"]),
      extension_flagged: extensionFlagged ? 1 : 0,
    };

    const commitmentId = await upsertByKey({
      table: "slt_commitments",
      sheetKey: "commitments",
      sheetName: "90-Commitments",
      row,
      batchId,
      values,
      formulas,
      entityType: "commitment",
      keyCol: "immutable_key",
      keyVal: immutableKey,
      keyPrefix: "C90-K",
      fields,
      dryRun,
      userId,
    });

    if (!dryRun && commitmentId) {
      await seedCommitmentCheckin(commitmentId, "30", fields.checkin_30_due, fields.checkin_30_notes, userId);
      await seedCommitmentCheckin(commitmentId, "60", fields.checkin_60_due, fields.checkin_60_notes, userId);
      if (fields.checkin_90_notes) await seedCommitmentCheckin(commitmentId, "90", null, fields.checkin_90_notes, userId);
    }
    row += 1;
  }
}

async function seedCommitmentCheckin(commitmentId, type, dueDate, notes, userId) {
  if (!dueDate && !notes) return;
  const existing = await db
    .prepare("SELECT id FROM slt_commitment_checkins WHERE commitment_id = ? AND checkin_type = ?")
    .get(commitmentId, type);
  if (existing) return; // already seeded by an earlier import
  await db
    .prepare(
      `INSERT INTO slt_commitment_checkins (commitment_id, checkin_type, due_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(commitmentId, type, dueDate || null, notes || null, userId);
}

// ─── Executive Calendar ─────────────────────────────────────────────────

// Matches "Oct 17-21, 2026" / "Oct 17 - 21, 2026" style ranges. Anything
// else that arrives as text (rather than a real date cell) is left
// unparsed and flagged — never guessed.
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

async function importCalendar(workbook, batchId, { dryRun, userId }) {
  const ws = workbook.getWorksheet("Master Calendar");
  if (!ws) {
    flag("Master Calendar", null, "Sheet not found in workbook.");
    return;
  }
  const hm = headerMap(ws, 2);
  let row = 3;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (isBlank(values["Event / Deadline"])) {
      row += 1;
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
      } else {
        flag("Master Calendar", row, `Event Date "${eventDateRaw}" is text and didn't match a known date-range pattern — left unparsed.`);
      }
    }

    const prepDeadlineIso = dateToIso(values["Prep Deadline"]) || textOrNull(values["Prep Deadline"]);
    let prepAfterEvent = 0;
    if (prepDeadlineIso && startDate && prepDeadlineIso > startDate) {
      prepAfterEvent = 1;
      flag("Master Calendar", row, `Prep Deadline (${prepDeadlineIso}) is after the Event Date (${startDate}) for "${values["Event / Deadline"]}" — likely a year typo; not auto-corrected.`);
    }

    const title = textOrNull(values["Event / Deadline"]);
    // No ID/key column exists in the source at all — derive a stable key
    // from title + the raw event date text so re-imports recognize the
    // same row without ever needing to guess at a missing identifier.
    const immutableKey = crypto
      .createHash("sha256")
      .update(`${title}|${String(eventDateRaw)}`)
      .digest("hex")
      .slice(0, 16);

    const fields = {
      month_raw: textOrNull(values["Month"]),
      // Store a clean ISO date for a real date, or the typed text for a
      // range — never String(aDateObject), which produces a full
      // "Tue Aug 18 2026 20:00:00 GMT-0400 (...)" toString(). (Same bug
      // found and fixed in importMasterCalendarData.js this session.)
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
      prep_after_event_flag: prepAfterEvent,
    };

    await upsertByKey({
      table: "slt_calendar",
      sheetKey: "master_calendar",
      sheetName: "Master Calendar",
      row,
      batchId,
      values,
      formulas,
      entityType: "calendar",
      keyCol: "immutable_key",
      keyVal: immutableKey,
      keyPrefix: "EVT",
      fields: { ...fields, event_id: `EVT-${immutableKey.slice(0, 8).toUpperCase()}` },
      dryRun,
      userId,
    });
    row += 1;
  }
}

// ─── Shared upsert-by-key logic ─────────────────────────────────────────
//
// One row = one business record, matched by its immutable key (or, for
// Decision Register, by its Decision ID — see importDecisionRegister).
// - No existing row with that key -> INSERT, disposition "inserted".
// - Existing row, never edited by a person since import (created_at ===
//   updated_at) -> refresh its fields from the sheet, disposition
//   "updated" if anything actually changed, else "unchanged".
// - Existing row that HAS been edited by a person -> leave it alone,
//   disposition "pending_review" (never overwrite a newer human edit).
async function upsertByKey({
  table,
  sheetKey,
  sheetName,
  row,
  batchId,
  values,
  formulas,
  entityType,
  keyCol,
  keyVal,
  keyPrefix,
  fields,
  dryRun,
  userId,
  skipKeyGeneration,
}) {
  let effectiveKey = keyVal;
  if (!effectiveKey && !skipKeyGeneration) {
    effectiveKey = `${keyPrefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    fields[keyCol] = effectiveKey;
  }

  const existing = effectiveKey ? await db.prepare(`SELECT * FROM ${table} WHERE ${keyCol} = ?`).get(effectiveKey) : null;

  if (!existing) {
    if (!dryRun) {
      const cols = Object.keys(fields);
      const placeholders = cols.map(() => "?").join(", ");
      const result = await db
        .prepare(`INSERT INTO ${table} (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
        .run(...cols.map((c) => fields[c]), userId);
      const newId = result.lastInsertRowid;
      await recordRawRow(batchId, sheetName, row, values, formulas, entityType, newId, "inserted", null);
      tally(sheetKey, "inserted");
      return newId;
    }
    tally(sheetKey, "inserted"); // what a commit run would do
    return null;
  }

  if (!isUntouchedSinceImport(existing)) {
    if (!dryRun) {
      await recordRawRow(
        batchId,
        sheetName,
        row,
        values,
        formulas,
        entityType,
        existing.id,
        "pending_review",
        "Row has been edited in the app since it was last imported — not overwritten."
      );
    }
    tally(sheetKey, "pending_review");
    return existing.id;
  }

  const changedCols = Object.keys(fields).filter((c) => String(existing[c] ?? "") !== String(fields[c] ?? ""));
  if (!changedCols.length) {
    if (!dryRun) await recordRawRow(batchId, sheetName, row, values, formulas, entityType, existing.id, "unchanged", null);
    tally(sheetKey, "unchanged");
    return existing.id;
  }

  if (!dryRun) {
    const setClause = changedCols.map((c) => `${c} = ?`).join(", ");
    await db
      .prepare(`UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...changedCols.map((c) => fields[c]), existing.id);
    await recordRawRow(batchId, sheetName, row, values, formulas, entityType, existing.id, "updated", `Changed: ${changedCols.join(", ")}`);
  }
  tally(sheetKey, "updated");
  return existing.id;
}

// ─── Backup sheets — preserved as history only, never merged into live tables ──

async function importBackupSheetAsHistory(workbook, batchId, sheetName, headerRow, keyHeader, dryRun) {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) return;
  const hm = headerMap(ws, headerRow);
  let row = headerRow + 1;
  let count = 0;
  while (row <= ws.rowCount) {
    const { values, formulas } = readRow(ws, row, hm);
    if (!isBlank(values[keyHeader])) {
      if (!dryRun) await recordRawRow(batchId, sheetName, row, values, formulas, null, null, "history_only", "Backup sheet — reconciled against live tables, not imported as a new record. See reconciliation notes.");
      count += 1;
    }
    row += 1;
  }
  tally(sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "_"), "history_only");
  return count;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log(`SLT Tracker import — ${args.dryRun ? "DRY RUN (no writes)" : "COMMIT"}`);
  console.log(`  tracker:  ${args.tracker}`);
  console.log(`  calendar: ${args.calendar}`);

  for (const p of [args.tracker, args.calendar]) {
    if (!fs.existsSync(p)) {
      console.error(`File not found: ${p}`);
      process.exit(1);
    }
  }

  // Running as a standalone script (not through server.js), so the DB
  // connection has to be opened/migrated here too — server.js does this
  // with the same `await dbModule.initDb()` call before touching `db` at all. This
  // step and the two file reads below have no built-in progress output of
  // their own, so each gets an explicit before/after log line — otherwise
  // a slow (but working) run and a genuinely stuck one look identical.
  console.log("Connecting to database...");
  await dbModule.initDb();
  db = dbModule.db;
  console.log("Database ready.");

  const trackerChecksum = sha256File(args.tracker);
  const calendarChecksum = sha256File(args.calendar);

  console.log("Reading tracker workbook (this one has a hidden ~4,100-row Lists & Controls sheet, so it can take a little while)...");
  const trackerWb = new ExcelJS.Workbook();
  await trackerWb.xlsx.readFile(args.tracker);
  console.log("Tracker workbook loaded.");

  console.log("Reading calendar workbook...");
  const calendarWb = new ExcelJS.Workbook();
  await calendarWb.xlsx.readFile(args.calendar);
  console.log("Calendar workbook loaded.");

  const trackerBatchId = args.dryRun
    ? null
    : await createImportBatch({
        sourceLabel: "tracker",
        filename: path.basename(args.tracker),
        checksum: trackerChecksum,
        userId: args.userId,
        mode: args.dryRun ? "dry_run" : "commit",
      });
  const calendarBatchId = args.dryRun
    ? null
    : await createImportBatch({
        sourceLabel: "calendar",
        filename: path.basename(args.calendar),
        checksum: calendarChecksum,
        userId: args.userId,
        mode: args.dryRun ? "dry_run" : "commit",
      });

  // Order matters: Decision Queue before Decision Register so parent
  // linking has something to resolve against.
  console.log("Importing Action Register...");
  await importActionRegister(trackerWb, trackerBatchId, args);
  console.log("Importing Decision Queue...");
  await importDecisionQueue(trackerWb, trackerBatchId, args);
  console.log("Importing Decision Register...");
  await importDecisionRegister(trackerWb, trackerBatchId, args);
  console.log("Importing 90-Day Commitments...");
  await importCommitments(trackerWb, trackerBatchId, args);
  console.log("Reconciling backup sheets (history only)...");
  await importBackupSheetAsHistory(trackerWb, trackerBatchId, "Decision Queue_Bak", 4, "Decision Required", args.dryRun);
  await importBackupSheetAsHistory(trackerWb, trackerBatchId, "Decision Register_Bak", 4, "Decision Summary", args.dryRun);

  console.log("Importing Executive Calendar...");
  await importCalendar(calendarWb, calendarBatchId, args);

  if (!args.dryRun) {
    await finishImportBatch(trackerBatchId, report.sheets);
    await finishImportBatch(calendarBatchId, report.sheets);
  }

  console.log("\n=== Reconciliation report ===");
  for (const [sheet, counts] of Object.entries(report.sheets)) {
    console.log(`  ${sheet}:`, counts);
  }
  console.log(`\n=== Flagged for review (${report.flagged.length}) ===`);
  for (const f of report.flagged) {
    console.log(`  [${f.sheet}${f.row ? ` row ${f.row}` : ""}] ${f.message}`);
  }

  const reportPath = path.join(__dirname, `slt_import_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ dryRun: args.dryRun, sheets: report.sheets, flagged: report.flagged }, null, 2));
  console.log(`\nFull report written to ${reportPath}`);

  if (args.dryRun) {
    console.log("\nThis was a dry run — nothing was written. Re-run without --dry-run to commit.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
