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
  slt: {
    key: "slt",
    label: "SLT Tracker",
    filePath: "SLT_Tracker/SLT_Action_Tracker_Board_Ready_Executive_v4_2026 Master.xlsx",
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

async function getReport(key) {
  const cfg = REPORTS[key];
  if (!cfg) throw httpError(404, "Unknown report.");
  if (!sp.isConfigured()) {
    throw httpError(503, "SharePoint isn't connected yet. Ask an administrator to add the SharePoint credentials.");
  }
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
  };
}

module.exports = { getReport, REPORTS };
