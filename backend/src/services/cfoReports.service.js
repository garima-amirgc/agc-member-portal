"use strict";

/**
 * CFO Reports — pulls two known Excel files from SharePoint (Incident Report,
 * SLT Tracker) and parses them into a generic { headers, rows } shape per
 * sheet so the frontend can render a table today. The exact layout/columns
 * of each report will likely be reshaped later once the CFO describes how
 * each one should actually be presented — this is the "get the data flowing"
 * first step.
 *
 * Reuses sharepoint.service.js's app-only Graph auth — no new env vars.
 */

const ExcelJS = require("exceljs");
const sp = require("./sharepoint.service");

// Resolved by name via Graph's site search (same lookup the SharePoint Files
// browser uses) rather than a hardcoded hostname + server-relative path,
// since the exact URL segment is easy to get wrong from a screenshot.
const SITE_NAME = "Reporting_AGCF";

const REPORTS = Object.freeze({
  incident: {
    key: "incident",
    label: "Incident Report",
    filePath: "Incident_Report/AGC_Incident_Dashboard_V3.xlsx",
  },
  // The SLT tab combines two separate SharePoint files: the action tracker
  // (who owns what action item, its status/due date, plus its Decision
  // Queue/Register sheets — who is assigned which decision) and the SLT
  // calendar (who owns which upcoming event/deadline). Both workbooks have
  // other sheets too (backups, pre-built exec dashboards, viewer/summary
  // tabs) that are either derived from the sheets above or aren't per-person
  // data, so those are left out — see fetchAndParseSlt().
  slt: {
    key: "slt",
    label: "SLT Tracker",
    actionFilePath: "SLT_Tracker/SLT_Action_Tracker_Board_Ready_Executive_v4_2026 Master.xlsx",
    calendarFilePath: "SLT_Tracker/AGC_SLT_Calendar_Master 2026-2027.xlsx",
  },
});

function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

// ExcelJS cell values can be primitives, Dates, or rich objects (formulas,
// hyperlinks, rich text) — flatten everything down to a plain display value.
function cellToValue(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    // Some spreadsheet date cells parse into an invalid Date (bad/blank
    // serial value) — toISOString() throws "Invalid time value" on those.
    if (Number.isNaN(v.getTime())) return "";
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text || "").join("");
    if (v.result !== undefined) return cellToValue(v.result); // formula cell
    if (v.text != null) return v.text; // hyperlink cell
    if (v.error != null) return `#${v.error}`;
    return "";
  }
  return v;
}

async function parseWorkbookBuffer(buffer) {
  if (!buffer || buffer.length < 100) {
    throw httpError(502, `The downloaded file was empty or too small to be a real Excel file (${buffer?.length || 0} bytes).`);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    throw httpError(
      502,
      `Could not read that file as an Excel workbook (it may be a different format, password-protected, or corrupted): ${e.message}`
    );
  }
  const sheets = [];
  wb.eachSheet((worksheet) => {
    const colCount = Math.max(worksheet.columnCount || 0, worksheet.actualColumnCount || 0) || 1;
    const allRows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      for (let col = 1; col <= colCount; col += 1) {
        let raw = null;
        try {
          // Reading one cell at a time so a single malformed cell (e.g. an
          // out-of-range date ExcelJS can't convert) can't blow up the whole
          // row via row.values, which computes every cell in the row at once.
          raw = row.getCell(col).value;
        } catch {
          raw = null;
        }
        let display = "";
        try {
          display = cellToValue(raw);
        } catch {
          display = "";
        }
        values.push(display);
      }
      allRows.push(values);
    });
    const headers = (allRows[0] || []).map((h, i) => (h === "" || h == null ? `Column ${i + 1}` : String(h)));
    const rows = allRows.slice(1);
    sheets.push({ name: worksheet.name, headers, rows });
  });
  return sheets;
}

// ─── SLT Tracker: combine the Action Tracker + Calendar files ─────────────
//
// Both workbooks have a title/description preamble above their real header
// row (unlike the Incident Report file, where row 1 is already the header),
// so parseWorkbookBuffer's "first row = header" assumption doesn't work
// here. Instead we scan for the sheet by name and the header row by a
// distinctive column label, then read everything below it into one object
// per record, keyed by header name.

function findWorksheetByName(workbook, nameRegex) {
  let match = null;
  workbook.eachSheet((ws) => {
    if (!match && nameRegex.test(ws.name)) match = ws;
  });
  return match;
}

// Scans the first `maxScan` rows for one whose cells contain `token`
// (case-insensitive, exact match after trimming) — that's the header row.
function findHeaderRowNumber(worksheet, token, maxScan = 15) {
  const colCount = Math.max(worksheet.columnCount || 0, worksheet.actualColumnCount || 0) || 30;
  const scanRows = Math.min(maxScan, worksheet.rowCount || maxScan);
  for (let r = 1; r <= scanRows; r += 1) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= colCount; c += 1) {
      let raw;
      try {
        raw = row.getCell(c).value;
      } catch {
        raw = null;
      }
      const s = String(cellToValue(raw) || "").trim().toLowerCase();
      if (s === token) return r;
    }
  }
  return -1;
}

// Reads every row below the header row into { headerName: value } objects.
// A row only counts as a real record if `anchorHeader` (the sheet's
// primary-key-like column — e.g. "SLT Item ID") is non-empty; without that
// gate, stray formatting on otherwise-blank rows (common in these
// board-maintained workbooks — a leftover date stamp, a lone note) gets
// counted as data. Checked against the real files: without the anchor this
// pulled in 100 "action" rows and 34 "calendar" rows for what are actually
// 28 and 21 real records.
function extractRecords(worksheet, headerRowNumber, anchorHeader) {
  const colCount = Math.max(worksheet.columnCount || 0, worksheet.actualColumnCount || 0) || 1;
  const headerRow = worksheet.getRow(headerRowNumber);
  const headers = [];
  for (let c = 1; c <= colCount; c += 1) {
    let raw;
    try {
      raw = headerRow.getCell(c).value;
    } catch {
      raw = null;
    }
    headers.push(String(cellToValue(raw) || "").trim());
  }
  const anchorIdx = Math.max(0, headers.indexOf(anchorHeader));
  const records = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    let anchorRaw;
    try {
      anchorRaw = row.getCell(anchorIdx + 1).value;
    } catch {
      anchorRaw = null;
    }
    const anchorVal = cellToValue(anchorRaw);
    if (anchorVal === "" || anchorVal == null) return;
    const obj = {};
    for (let c = 1; c <= colCount; c += 1) {
      const h = headers[c - 1];
      if (!h) continue;
      let raw;
      try {
        raw = row.getCell(c).value;
      } catch {
        raw = null;
      }
      let val;
      try {
        val = cellToValue(raw);
      } catch {
        val = "";
      }
      obj[h] = val;
    }
    records.push(obj);
  });
  return { headers, records };
}

// The Decision Queue and Decision Register sheets share the same column
// schema (Register just has one extra blank trailing column) and both use
// "Decision ID" as their anchor/primary-key column. Tagging each record with
// which sheet it came from keeps that distinction visible even once the two
// are merged into one list.
function extractDecisionRecords(sheet, sourceLabel) {
  if (!sheet) return { headers: [], records: [] };
  const headerRow = findHeaderRowNumber(sheet, "decision id");
  if (headerRow < 0) return { headers: [], records: [] };
  const { headers, records } = extractRecords(sheet, headerRow, "Decision ID");
  const cleanHeaders = headers.filter(Boolean);
  const tagged = records.map((rec) => ({ Source: sourceLabel, ...rec }));
  return { headers: cleanHeaders, records: tagged };
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The Action Register's Owner column is a clean single name per row (Gene,
// Sherry, Tom, …), so that's the roster. The Calendar's "Owner / Lead"
// column is messier — sometimes several names, sometimes a name plus a
// title or team ("Colin & Coldbox", "Tatiana - Plant Manager") — so instead
// of trying to parse it, we just check whether each roster name appears in
// it as a whole word. A calendar owner that never matches anyone on the
// roster (e.g. someone with no action items) is reported separately rather
// than silently dropped.
function buildSltPerformance(actionRecords, calendarRecords, decisionRecords = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const roster = [];
  const rosterSet = new Set();
  for (const rec of actionRecords) {
    const owner = String(rec["Owner"] || "").trim();
    if (owner && !rosterSet.has(owner)) {
      rosterSet.add(owner);
      roster.push(owner);
    }
  }

  const statsByName = new Map(
    roster.map((name) => [
      name,
      {
        name,
        actionsTotal: 0,
        actionsCompleted: 0,
        actionsOpen: 0,
        actionsOverdue: 0,
        eventsOwned: 0,
        eventsUpcoming: 0,
        eventsPrepAtRisk: 0,
        decisionsTotal: 0,
        decisionsCompleted: 0,
        decisionsOpen: 0,
        decisionsOverdue: 0,
      },
    ])
  );

  for (const rec of actionRecords) {
    const owner = String(rec["Owner"] || "").trim();
    const s = statsByName.get(owner);
    if (!s) continue;
    // Note: "Active Record" here means "still archived as done" rather than
    // "currently relevant" — every Completed row in this workbook is marked
    // INACTIVE. So completion is read from Status, not this flag; it isn't
    // used as a filter at all.
    const status = String(rec["Status"] || "").trim().toLowerCase();
    const dueDate = toDate(rec["Due Date"]);
    s.actionsTotal += 1;
    if (status === "completed") {
      s.actionsCompleted += 1;
    } else {
      s.actionsOpen += 1;
      if (dueDate && dueDate < today) s.actionsOverdue += 1;
    }
  }

  const rosterRegexes = roster.map((name) => ({ name, re: new RegExp(`\\b${escapeRegExp(name)}\\b`, "i") }));
  const unmatchedCalendarOwners = new Set();

  for (const rec of calendarRecords) {
    const raw = String(rec["Owner / Lead"] || "").trim();
    if (!raw) continue;
    const eventDate = toDate(rec["Event Date"]);
    const prepDeadline = toDate(rec["Prep Deadline"]);
    const isUpcoming = eventDate ? eventDate >= today : false;
    // Prep deadline already passed, but the event itself hasn't happened
    // yet — a real "behind schedule" signal, computed from the live dates
    // rather than the sheet's own pre-computed day-count columns (which go
    // stale between edits).
    const isPrepAtRisk = Boolean(prepDeadline && prepDeadline < today && isUpcoming);

    let matchedAny = false;
    for (const { name, re } of rosterRegexes) {
      if (re.test(raw)) {
        matchedAny = true;
        const s = statsByName.get(name);
        s.eventsOwned += 1;
        if (isUpcoming) s.eventsUpcoming += 1;
        if (isPrepAtRisk) s.eventsPrepAtRisk += 1;
      }
    }
    if (!matchedAny) unmatchedCalendarOwners.add(raw);
  }

  // "Assigned To" on both Decision sheets is a clean single name, same as
  // the Action Register's Owner column, so this matches by exact name
  // rather than the word-boundary scan used for the messier calendar field.
  const unmatchedDecisionAssignees = new Set();
  for (const rec of decisionRecords) {
    const assignee = String(rec["Assigned To"] || "").trim();
    if (!assignee) continue;
    const s = statsByName.get(assignee);
    if (!s) {
      unmatchedDecisionAssignees.add(assignee);
      continue;
    }
    const status = String(rec["Status"] || "").trim().toLowerCase();
    const dueDate = toDate(rec["Decision Deadline"]);
    s.decisionsTotal += 1;
    if (status === "completed") {
      s.decisionsCompleted += 1;
    } else {
      s.decisionsOpen += 1;
      if (dueDate && dueDate < today) s.decisionsOverdue += 1;
    }
  }

  return {
    roster: roster.map((name) => statsByName.get(name)),
    unmatchedCalendarOwners: [...unmatchedCalendarOwners],
    unmatchedDecisionAssignees: [...unmatchedDecisionAssignees],
  };
}

async function fetchAndParseSlt(cfg) {
  const [actionDl, calendarDl] = await Promise.all([
    sp.downloadFileBySiteName({ siteName: SITE_NAME, filePath: cfg.actionFilePath }),
    sp.downloadFileBySiteName({ siteName: SITE_NAME, filePath: cfg.calendarFilePath }),
  ]);

  const actionWb = new ExcelJS.Workbook();
  try {
    await actionWb.xlsx.load(actionDl.buffer);
  } catch (e) {
    throw httpError(502, `Could not read the SLT Action Tracker as an Excel workbook: ${e.message}`);
  }
  const calendarWb = new ExcelJS.Workbook();
  try {
    await calendarWb.xlsx.load(calendarDl.buffer);
  } catch (e) {
    throw httpError(502, `Could not read the SLT Calendar as an Excel workbook: ${e.message}`);
  }

  const actionSheet = findWorksheetByName(actionWb, /action register/i);
  if (!actionSheet) throw httpError(502, 'Could not find an "Action Register" sheet in the SLT Action Tracker file.');
  const calendarSheet = findWorksheetByName(calendarWb, /master calendar/i);
  if (!calendarSheet) throw httpError(502, 'Could not find a "Master Calendar" sheet in the SLT Calendar file.');

  const actionHeaderRow = findHeaderRowNumber(actionSheet, "slt item id");
  if (actionHeaderRow < 0) throw httpError(502, "Could not find the header row in the Action Register sheet.");
  const calendarHeaderRow = findHeaderRowNumber(calendarSheet, "event / deadline");
  if (calendarHeaderRow < 0) throw httpError(502, "Could not find the header row in the Master Calendar sheet.");

  const { headers: actionHeaders, records: actionRecords } = extractRecords(actionSheet, actionHeaderRow, "SLT Item ID");
  const { headers: calendarHeaders, records: calendarRecords } = extractRecords(
    calendarSheet,
    calendarHeaderRow,
    "Event Date"
  );

  // Decisions live in the same Action Tracker workbook, on two sheets with
  // an anchored, exact name match (unlike "Decision Queue_Bak" etc., which
  // we deliberately don't touch). Missing either sheet isn't fatal — the
  // rest of the SLT tab still works, just without decision stats.
  const decisionQueueSheet = findWorksheetByName(actionWb, /^decision queue$/i);
  const decisionRegisterSheet = findWorksheetByName(actionWb, /^decision register$/i);
  const decisionQueue = extractDecisionRecords(decisionQueueSheet, "Decision Queue");
  const decisionRegister = extractDecisionRecords(decisionRegisterSheet, "Decision Register");
  const decisionHeaders = ["Source", ...(decisionQueue.headers.length ? decisionQueue.headers : decisionRegister.headers)];
  const decisionRecords = [...decisionQueue.records, ...decisionRegister.records];

  const performance = buildSltPerformance(actionRecords, calendarRecords, decisionRecords);

  // Row shape the frontend already knows how to render as a table — matches
  // the {headers, rows} shape parseWorkbookBuffer produces for other reports.
  const toRows = (headers, records) => records.map((rec) => headers.map((h) => rec[h] ?? ""));

  return {
    key: cfg.key,
    label: cfg.label,
    files: [
      {
        role: "Action Tracker",
        fileName: actionDl.meta.name || null,
        lastModifiedDateTime: actionDl.meta.lastModifiedDateTime || null,
        webUrl: actionDl.meta.webUrl || null,
      },
      {
        role: "Calendar",
        fileName: calendarDl.meta.name || null,
        lastModifiedDateTime: calendarDl.meta.lastModifiedDateTime || null,
        webUrl: calendarDl.meta.webUrl || null,
      },
    ],
    performance,
    actionItems: { headers: actionHeaders, rows: toRows(actionHeaders, actionRecords) },
    calendarEvents: { headers: calendarHeaders, rows: toRows(calendarHeaders, calendarRecords) },
    decisionItems: { headers: decisionHeaders, rows: toRows(decisionHeaders, decisionRecords) },
    fetchedAt: Date.now(),
  };
}

// Downloading + parsing the whole workbook from SharePoint on every page
// load is the slow part (a network round trip plus ExcelJS parsing a
// multi-sheet file). Cache the parsed result in memory for a few minutes so
// repeat visits (switching tabs back, reloading the page, a second person
// opening the CFO page) are served instantly instead of re-doing that work
// every time. A manual "Refresh" bypasses this when someone wants the very
// latest SharePoint content right away.
const CACHE_TTL_MS = Number(process.env.CFO_REPORT_CACHE_TTL_MS) || 10 * 60 * 1000; // 10 minutes
const _cache = new Map(); // key -> { data, fetchedAt }
const _inFlight = new Map(); // key -> Promise, dedupes simultaneous cold loads

async function fetchAndParse(cfg) {
  if (cfg.key === "slt") return fetchAndParseSlt(cfg);
  const { buffer, meta } = await sp.downloadFileBySiteName({
    siteName: SITE_NAME,
    filePath: cfg.filePath,
  });
  const sheets = await parseWorkbookBuffer(buffer);
  return {
    key: cfg.key,
    label: cfg.label,
    fileName: meta.name || null,
    lastModifiedDateTime: meta.lastModifiedDateTime || null,
    webUrl: meta.webUrl || null,
    sheets,
    // When this copy was actually pulled from SharePoint — lets the
    // frontend show "Synced …" so a cached response doesn't look stale
    // without explanation.
    fetchedAt: Date.now(),
  };
}

async function getReport(key, { forceRefresh = false } = {}) {
  const cfg = REPORTS[key];
  if (!cfg) throw httpError(404, "Unknown report.");

  if (!forceRefresh) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // Several people opening the CFO page around the same time (or one person
  // double-clicking Refresh) shouldn't each trigger their own SharePoint
  // download — share the one already in progress.
  if (_inFlight.has(key)) return _inFlight.get(key);

  if (!sp.isConfigured()) {
    throw httpError(503, "SharePoint isn't connected yet. Ask an administrator to add the SharePoint credentials.");
  }

  const promise = fetchAndParse(cfg)
    .then((data) => {
      _cache.set(key, { data, fetchedAt: data.fetchedAt });
      return data;
    })
    .finally(() => {
      _inFlight.delete(key);
    });
  _inFlight.set(key, promise);
  return promise;
}

module.exports = { getReport, REPORTS };
