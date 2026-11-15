import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

/**
 * Shared export helpers for the SLT Tracker boards (Action Register,
 * Decisions, 90 Day Commitments) — built so every board's Export button
 * produces the SAME filtered row set in CSV, Excel, PDF, or PowerPoint,
 * instead of duplicating per-format logic three times. Every function here
 * takes the same shape:
 *   - columns: [{ key, label, format?: (row) => string }]
 *   - rows: the board's current FILTERED array — callers must pass
 *     whatever their filters/search/tab already narrowed it down to, not
 *     the full unfiltered list, so the exported file always matches what's
 *     actually on screen (the explicit ask this was built for).
 *   - filenameBase: file name without extension or date (a date stamp is
 *     appended automatically so repeated exports don't overwrite one
 *     another on disk).
 *   - title: optional heading shown in the PDF/PowerPoint output.
 */

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function withDateStamp(filenameBase) {
  const safe = String(filenameBase || "export").trim() || "export";
  return `${safe}_${todayStamp()}`;
}

function buildRows(columns, rows) {
  return rows.map((row) => columns.map((c) => (c.format ? c.format(row) : (row[c.key] ?? ""))));
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to actually start the download before the
  // object URL is revoked out from under it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv({ columns, rows, filenameBase }) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = buildRows(columns, rows)
    .map((r) => r.map(csvEscape).join(","))
    .join("\n");
  // Leading BOM so Excel opens UTF-8 CSVs (names/notes with special
  // characters) without mangling them.
  const blob = new Blob(["﻿", `${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${withDateStamp(filenameBase)}.csv`);
}

export function exportToXlsx({ columns, rows, filenameBase, sheetName = "Sheet1" }) {
  const aoa = [columns.map((c) => c.label), ...buildRows(columns, rows)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable default column widths so the sheet isn't unreadable on
  // first open — based on the longer of the header label or a modest cap,
  // since cell content length varies wildly (short status words vs. long
  // notes).
  ws["!cols"] = columns.map((c) => ({ wch: Math.min(40, Math.max(10, String(c.label).length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).slice(0, 31) || "Sheet1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(new Blob([out], { type: "application/octet-stream" }), `${withDateStamp(filenameBase)}.xlsx`);
}

export function exportToPdf({ columns, rows, filenameBase, title }) {
  // Wide boards (most of these — Decisions alone has 20+ fields once every
  // form field is included) read better landscape; narrower ones stay
  // portrait.
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt" });
  if (title) {
    doc.setFontSize(14);
    doc.text(title, 24, 28);
  }
  autoTable(doc, {
    startY: title ? 40 : 20,
    head: [columns.map((c) => c.label)],
    body: buildRows(columns, rows),
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [11, 62, 175] },
    margin: { left: 20, right: 20 },
  });
  doc.save(`${withDateStamp(filenameBase)}.pdf`);
}

// Measures how wide each column needs to be (header label vs. every cell in
// that column, capped so one long Notes-style field doesn't blow the whole
// image out) using the SAME canvas context the final image is drawn with,
// so the widths measured here line up exactly with what gets drawn.
function measureColumnWidths(ctx, columns, bodyRows, { headerFont, cellFont, paddingX, minWidth = 70, maxWidth = 280 }) {
  ctx.font = headerFont;
  const widths = columns.map((c) => ctx.measureText(String(c.label ?? "")).width);
  ctx.font = cellFont;
  for (const row of bodyRows) {
    row.forEach((cell, i) => {
      const w = ctx.measureText(String(cell ?? "")).width;
      if (w > widths[i]) widths[i] = w;
    });
  }
  return widths.map((w) => Math.min(maxWidth, Math.max(minWidth, Math.ceil(w) + paddingX * 2)));
}

// Canvas text doesn't wrap on its own, and giving every cell real multi-line
// wrapping (like the PDF export gets from jspdf-autotable) would need a lot
// more layout code for an export whose whole point is a quick, shareable
// snapshot — so a long value is truncated with an ellipsis instead, the
// same tradeoff a narrow spreadsheet column makes. Anyone who needs the
// full, un-truncated text already has the row's own "view details" popup.
function truncateToWidth(ctx, text, maxWidth) {
  const str = String(text ?? "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  const ellipsis = "…";
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(str.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return str.slice(0, lo) + ellipsis;
}

export function exportToPng({ columns, rows, filenameBase, title }) {
  const bodyRows = buildRows(columns, rows);
  const scale = 2; // drawn at 2x and scaled back down via CSS-less canvas sizing, so the PNG stays crisp when viewed zoomed in or printed
  const paddingX = 10;
  const rowHeight = 26;
  const headerHeight = 30;
  const titleHeight = title ? 34 : 0;
  const outerPad = 16;
  const headerFont = "bold 13px Arial, sans-serif";
  const cellFont = "12px Arial, sans-serif";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const colWidths = measureColumnWidths(ctx, columns, bodyRows, { headerFont, cellFont, paddingX });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const width = outerPad * 2 + tableWidth;
  const height = outerPad * 2 + titleHeight + headerHeight + rowHeight * bodyRows.length;

  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = outerPad;
  if (title) {
    ctx.fillStyle = "#0B3EAF";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(title, outerPad, y);
    y += titleHeight;
  }

  // Header row
  ctx.fillStyle = "#0B3EAF";
  ctx.fillRect(outerPad, y, tableWidth, headerHeight);
  ctx.font = headerFont;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  let hx = outerPad;
  columns.forEach((c, i) => {
    const w = colWidths[i];
    ctx.fillText(truncateToWidth(ctx, c.label, w - paddingX * 2), hx + paddingX, y + headerHeight / 2);
    hx += w;
  });
  y += headerHeight;

  // Body rows, alternating tint like the on-screen table
  ctx.font = cellFont;
  const tableTop = y;
  bodyRows.forEach((row, rowIdx) => {
    ctx.fillStyle = rowIdx % 2 === 1 ? "#F1F5F9" : "#FFFFFF";
    ctx.fillRect(outerPad, y, tableWidth, rowHeight);
    ctx.fillStyle = "#1E293B";
    let cx = outerPad;
    row.forEach((cell, i) => {
      const w = colWidths[i];
      ctx.fillText(truncateToWidth(ctx, cell, w - paddingX * 2), cx + paddingX, y + rowHeight / 2);
      cx += w;
    });
    y += rowHeight;
  });

  // Outer border + column separators
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1;
  const tableHeight = headerHeight + rowHeight * bodyRows.length;
  ctx.strokeRect(outerPad + 0.5, tableTop - headerHeight + 0.5, tableWidth, tableHeight);
  let sepX = outerPad;
  colWidths.slice(0, -1).forEach((w) => {
    sepX += w;
    ctx.beginPath();
    ctx.moveTo(sepX + 0.5, tableTop - headerHeight);
    ctx.lineTo(sepX + 0.5, tableTop - headerHeight + tableHeight);
    ctx.stroke();
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${withDateStamp(filenameBase)}.png`);
      resolve();
    }, "image/png");
  });
}

export async function exportToPptx({ columns, rows, filenameBase, title }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SLT_EXPORT_WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "SLT_EXPORT_WIDE";

  const ROWS_PER_SLIDE = 14;
  const headerCells = columns.map((c) => ({
    text: c.label,
    options: { bold: true, fill: { color: "0B3EAF" }, color: "FFFFFF", fontSize: 8 },
  }));
  const bodyRows = buildRows(columns, rows);
  const slideCount = Math.max(1, Math.ceil(bodyRows.length / ROWS_PER_SLIDE));

  for (let i = 0; i < slideCount; i++) {
    const slide = pptx.addSlide();
    if (title) {
      slide.addText(slideCount > 1 ? `${title} (${i + 1}/${slideCount})` : title, {
        x: 0.3,
        y: 0.2,
        w: 12.7,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: "0B3EAF",
      });
    }
    const chunk = bodyRows.slice(i * ROWS_PER_SLIDE, (i + 1) * ROWS_PER_SLIDE);
    const tableRows = [
      headerCells,
      ...chunk.map((r) => r.map((cell) => ({ text: String(cell ?? ""), options: { fontSize: 7 } }))),
    ];
    slide.addTable(tableRows, {
      x: 0.3,
      y: title ? 0.8 : 0.3,
      w: 12.7,
      autoPage: false,
      border: { type: "solid", color: "CCCCCC", pt: 0.5 },
    });
  }

  const blob = await pptx.write({ outputType: "blob" });
  triggerDownload(blob, `${withDateStamp(filenameBase)}.pptx`);
}
