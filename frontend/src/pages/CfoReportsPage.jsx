import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api, { postIncidentAttachment } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAnyAdminGrant, isAdministrator } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { FORM_FIELD, FORM_LABEL } from "../utils/itTicketStyles";
import SltTrackerV2 from "./SltTrackerV2";

const TABS = [
  { key: "slt", label: "SLT Tracker" },
  { key: "incident", label: "Incident Report" },
];

// Each Incident Report sheet is named "<Facility> Incident Tracker" — match
// the facility code against the sheet name rather than an exact string, so
// small naming differences (e.g. "Sierra" for SCF) still resolve correctly.
const FACILITIES = [
  { code: "AQM", match: /\baqm\b/i },
  { code: "SCF", match: /\b(scf|sierra)\b/i },
  { code: "ASP", match: /\basp\b/i },
];

const SEVERITY_ORDER = ["L1", "L2", "L3", "L4"];
const SEVERITY_META = {
  L1: { label: "L1 — Minor", color: "var(--status-good)" },
  L2: { label: "L2 — Moderate", color: "var(--status-warning)" },
  L3: { label: "L3 — Serious", color: "var(--status-serious)" },
  L4: { label: "L4 — Critical", color: "var(--status-critical)" },
};

// Fixed-width tables need explicit column widths or every column ends up the
// same size regardless of content — give long free-text columns (Description,
// Notes, Comments, Action…) more room so the table fits without horizontal
// scrolling instead of forcing a wide, nowrap layout.
function computeColWidths(headers) {
  const wideRegex = /(descri|notes?|comment|action|summary|detail)/i;
  const wideIdx = new Set();
  headers.forEach((h, i) => {
    if (wideRegex.test(String(h || ""))) wideIdx.add(i);
  });
  const n = headers.length || 1;
  if (wideIdx.size === 0 || wideIdx.size === n) {
    const equal = 100 / n;
    return headers.map(() => equal);
  }
  const wideShare = 45; // total % given to all wide columns combined
  const narrowShare = 100 - wideShare;
  const wideEach = wideShare / wideIdx.size;
  const narrowEach = narrowShare / (n - wideIdx.size);
  return headers.map((_, i) => (wideIdx.has(i) ? wideEach : narrowEach));
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ─── generic sheet table (used for SLT Tracker, and as a fallback) ─────────

function ReportSheet({ sheet }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{sheet.name}</h3>
      {sheet.rows.length ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              {computeColWidths(sheet.headers).map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                {sheet.headers.map((h, i) => (
                  <th key={i} className="break-words py-2 px-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sheet.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {sheet.headers.map((_, ci) => (
                    <td key={ci} className="break-words py-2 px-3 align-top text-slate-700 dark:text-slate-200">
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">This sheet is empty.</p>
      )}
    </div>
  );
}

// ─── Incident Report dashboard ──────────────────────────────────────────────

function findCol(headers, regex) {
  return headers.findIndex((h) => regex.test(String(h || "")));
}

function normalizeSeverity(raw) {
  const m = String(raw || "").match(/L\s*([1-4])/i);
  return m ? `L${m[1]}` : null;
}

function monthKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function buildIncidentSummary(sheet) {
  const headers = sheet.headers;
  const deptIdx = findCol(headers, /depart/i);
  const dateIdx = findCol(headers, /date/i);
  const levelIdx = findCol(headers, /level/i);
  const statusIdx = findCol(headers, /status/i);

  const total = sheet.rows.length;
  const severityCounts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  let severityKnown = 0;
  const deptCounts = new Map();
  const monthCounts = new Map();
  const statusCounts = new Map();

  for (const row of sheet.rows) {
    if (levelIdx >= 0) {
      const sev = normalizeSeverity(row[levelIdx]);
      if (sev) {
        severityCounts[sev] += 1;
        severityKnown += 1;
      }
    }
    if (deptIdx >= 0) {
      const dept = String(row[deptIdx] || "").trim() || "Unspecified";
      deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
    }
    if (dateIdx >= 0) {
      const mk = monthKey(row[dateIdx]);
      if (mk) monthCounts.set(mk, (monthCounts.get(mk) || 0) + 1);
    }
    if (statusIdx >= 0) {
      const st = String(row[statusIdx] || "").trim() || "Unspecified";
      statusCounts.set(st, (statusCounts.get(st) || 0) + 1);
    }
  }

  const departments = [...deptCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topDepartments = departments.slice(0, 6);
  const otherDeptTotal = departments.slice(6).reduce((s, [, c]) => s + c, 0);
  if (otherDeptTotal > 0) topDepartments.push(["Other", otherDeptTotal]);

  const months = [...monthCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  // Only surface a status breakdown if the column looks like a real, small
  // set of states rather than free-text notes.
  const statuses =
    statusIdx >= 0 && statusCounts.size > 0 && statusCounts.size <= 6
      ? [...statusCounts.entries()].sort((a, b) => b[1] - a[1])
      : null;

  return { total, severityCounts, severityKnown, topDepartments, months, statuses, levelIdx };
}

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function SeverityBars({ counts, known, total }) {
  const max = Math.max(1, ...SEVERITY_ORDER.map((k) => counts[k]));
  return (
    <div className="space-y-2.5">
      {SEVERITY_ORDER.map((k) => {
        const meta = SEVERITY_META[k];
        const count = counts[k];
        const pct = Math.round((count / max) * 100);
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">{meta.label}</span>
            <div className="relative h-5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-5 rounded-full transition-all"
                style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%`, backgroundColor: meta.color }}
                title={`${count} incident${count === 1 ? "" : "s"}`}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
              {count}
            </span>
          </div>
        );
      })}
      {known < total ? (
        <p className="pt-1 text-xs italic text-slate-400 dark:text-slate-500">
          {total - known} incident{total - known === 1 ? "" : "s"} without a recognized level.
        </p>
      ) : null}
    </div>
  );
}

function DepartmentBars({ data }) {
  const max = Math.max(1, ...data.map(([, c]) => c));
  return (
    <div className="space-y-2.5">
      {data.map(([label, count]) => {
        const pct = Math.round((count / max) * 100);
        return (
          <div key={label} className="flex items-center gap-3">
            <span
              className="w-36 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300"
              title={label}
            >
              {label}
            </span>
            <div className="relative h-5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-5 rounded-full transition-all"
                style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%`, backgroundColor: "var(--series-1)" }}
                title={`${count} incident${count === 1 ? "" : "s"}`}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MonthColumns({ months }) {
  const max = Math.max(1, ...months.map(([, c]) => c));
  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1">
      {months.map(([key, count]) => {
        const heightPct = Math.max(Math.round((count / max) * 100), 6);
        return (
          <div key={key} className="flex w-12 shrink-0 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{count}</span>
            <div className="flex h-24 w-full items-end">
              <div
                className="w-full rounded-t-[4px]"
                style={{ height: `${heightPct}%`, backgroundColor: "var(--series-1)" }}
                title={`${monthLabel(key)}: ${count} incident${count === 1 ? "" : "s"}`}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{monthLabel(key)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusChips({ statuses }) {
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map(([label, count]) => (
        <span
          key={label}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {label}: <span className="font-semibold">{count}</span>
        </span>
      ))}
    </div>
  );
}

// The real Incident Report sheet has ~26 columns (root cause, corrective /
// preventive action, financial impact, approvals, closure dates…) — far too
// many to lay out as a table without either scrolling or squeezing headers
// into unreadable vertical text. Instead: one card per incident with the
// handful of fields that matter at a glance always visible, and the rest
// available behind a "view details" toggle.
const STATUS_META = {
  OPEN: { label: "Open", color: "var(--status-critical)" },
  "IN PROGRESS": { label: "In Progress", color: "var(--status-warning)" },
  CLOSED: { label: "Closed", color: "var(--status-good)" },
};

function normalizeStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  if (s.includes("CLOSED")) return "CLOSED";
  if (s.includes("PROGRESS")) return "IN PROGRESS";
  if (s.includes("OPEN")) return "OPEN";
  return null;
}

// Default view is Open — that's almost always what someone checking this
// report actually wants to see first. "All" still gets everything, including
// rows whose status text doesn't match a recognized bucket.
const STATUS_FILTER_OPTIONS = [
  { key: "OPEN", label: "Open" },
  { key: "IN PROGRESS", label: "In Progress" },
  { key: "CLOSED", label: "Closed" },
  { key: "ALL", label: "All" },
];

function IncidentCards({ sheet, emptyMessage }) {
  const headers = sheet.headers;

  const idx = useMemo(
    () => ({
      id: findCol(headers, /incident.*id|^id$/i),
      date: findCol(headers, /^date$/i),
      department: findCol(headers, /depart/i),
      level: findCol(headers, /incident\s*level|^level/i),
      status: findCol(headers, /^status/i),
      description: findCol(headers, /^description/i),
      financial: findCol(headers, /financial\s*impact/i),
    }),
    [headers]
  );

  const secondaryCols = useMemo(() => {
    const primarySet = new Set(Object.values(idx).filter((i) => i >= 0));
    return headers.map((_, i) => i).filter((i) => !primarySet.has(i));
  }, [headers, idx]);

  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (ri) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ri)) next.delete(ri);
      else next.add(ri);
      return next;
    });

  if (!sheet.rows.length) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        {emptyMessage || "No incidents recorded."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sheet.rows.map((row, ri) => {
        const sev = idx.level >= 0 ? normalizeSeverity(row[idx.level]) : null;
        const sevMeta = sev ? SEVERITY_META[sev] : null;
        const stat = idx.status >= 0 ? normalizeStatus(row[idx.status]) : null;
        const statMeta = stat ? STATUS_META[stat] : null;
        const isOpen = expanded.has(ri);

        return (
          <div
            key={ri}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {idx.id >= 0 && row[idx.id] ? row[idx.id] : `Incident ${ri + 1}`}
                </span>
                {sevMeta ? (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: sevMeta.color }}
                  >
                    {row[idx.level]}
                  </span>
                ) : null}
                {statMeta ? (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: statMeta.color }}
                  >
                    {statMeta.label}
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {[idx.date >= 0 ? row[idx.date] : null, idx.department >= 0 ? row[idx.department] : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>

            {idx.description >= 0 && row[idx.description] ? (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{row[idx.description]}</p>
            ) : null}

            {idx.financial >= 0 && row[idx.financial] ? (
              <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Financial impact:{" "}
                <span className="font-semibold text-slate-900 dark:text-white">{row[idx.financial]}</span>
              </p>
            ) : null}

            {secondaryCols.length ? (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => toggle(ri)}
                  className="text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
                >
                  {isOpen ? "Hide details" : "View full details"}
                </button>
                {isOpen ? (
                  <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {secondaryCols.map((ci) => {
                      const val = row[ci];
                      if (val === "" || val == null) return null;
                      return (
                        <div key={ci} className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            {headers[ci]}
                          </p>
                          <p className="break-words text-sm text-slate-700 dark:text-slate-200">{val}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function IncidentDashboard({ report, onRefresh, refreshing }) {
  const sheets = report.sheets || [];

  const [facility, setFacility] = useState(() => {
    const firstAvailable = FACILITIES.find((f) => sheets.some((s) => f.match.test(s.name)));
    return firstAvailable ? firstAvailable.code : FACILITIES[0].code;
  });

  const activeSheet = useMemo(() => {
    const fac = FACILITIES.find((f) => f.code === facility);
    return (fac && sheets.find((s) => fac.match.test(s.name))) || null;
  }, [sheets, facility]);

  const statusIdx = useMemo(() => (activeSheet ? findCol(activeSheet.headers, /^status/i) : -1), [activeSheet]);
  const hasStatusColumn = statusIdx >= 0;

  const statusCounts = useMemo(() => {
    if (!activeSheet || !hasStatusColumn) return null;
    const counts = { OPEN: 0, "IN PROGRESS": 0, CLOSED: 0 };
    for (const row of activeSheet.rows) {
      const st = normalizeStatus(row[statusIdx]);
      if (st) counts[st] += 1;
    }
    return counts;
  }, [activeSheet, hasStatusColumn, statusIdx]);

  const [statusFilter, setStatusFilter] = useState("OPEN");

  // Everything below — the stat tiles, both charts, the trend, and the list
  // — reflects whichever status is selected, so "Open" really means "just
  // the open ones" everywhere on the page, not only in the list at the
  // bottom.
  const filteredSheet = useMemo(() => {
    if (!activeSheet) return null;
    if (!hasStatusColumn || statusFilter === "ALL") return activeSheet;
    const rows = activeSheet.rows.filter((row) => normalizeStatus(row[statusIdx]) === statusFilter);
    return { ...activeSheet, rows };
  }, [activeSheet, hasStatusColumn, statusFilter, statusIdx]);

  const summary = useMemo(() => (filteredSheet ? buildIncidentSummary(filteredSheet) : null), [filteredSheet]);
  const filterLabel = STATUS_FILTER_OPTIONS.find((o) => o.key === statusFilter)?.label || "All";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap overflow-x-auto rounded-portal border border-slate-200 bg-white/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/25">
          {FACILITIES.map((f) => {
            const available = sheets.some((s) => f.match.test(s.name));
            const isActive = f.code === facility;
            return (
              <button
                key={f.code}
                type="button"
                disabled={!available}
                onClick={() => setFacility(f.code)}
                className={[
                  "shrink-0 rounded-[10px] px-4 py-1.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:focus-visible:ring-brand-green/30",
                  isActive
                    ? "bg-[#0B3EAF] text-white shadow-sm dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                    : available
                      ? "text-slate-700 hover:bg-white/80 dark:text-white/85 dark:hover:bg-white/5"
                      : "cursor-not-allowed text-slate-300 dark:text-slate-600",
                ].join(" ")}
              >
                {f.code}
              </button>
            );
          })}
        </div>
        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {report.fileName} · Last updated in SharePoint: {formatDate(report.lastModifiedDateTime)}
          {report.fetchedAt ? <> · Synced {formatDate(report.fetchedAt)}</> : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="font-semibold text-[#0B3EAF] underline disabled:opacity-50 dark:text-[#A7D344]"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </span>
      </div>

      {!activeSheet ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          No sheet found for {facility} in this workbook.
        </p>
      ) : (
        <>
          {hasStatusColumn ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Status
              </span>
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const isActive = statusFilter === opt.key;
                const count = opt.key === "ALL" ? activeSheet.rows.length : statusCounts?.[opt.key] ?? 0;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusFilter(opt.key)}
                    className={
                      isActive
                        ? "rounded-full bg-[#0B3EAF] px-3 py-1 text-xs font-semibold text-white dark:bg-[#A7D344] dark:text-slate-900"
                        : "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                    }
                  >
                    {opt.label} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total incidents" value={summary.total} />
            <StatTile label="Critical (L4)" value={summary.severityCounts.L4} accent="var(--status-critical)" />
            <StatTile label="Serious (L3)" value={summary.severityCounts.L3} accent="var(--status-serious)" />
            <StatTile label="Departments involved" value={summary.topDepartments.length} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By severity</h3>
              {summary.severityKnown > 0 ? (
                <SeverityBars counts={summary.severityCounts} known={summary.severityKnown} total={summary.total} />
              ) : (
                <p className="text-sm italic text-slate-500 dark:text-slate-400">No severity levels found.</p>
              )}
            </div>
            <div className="card p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By department</h3>
              {summary.topDepartments.length ? (
                <DepartmentBars data={summary.topDepartments} />
              ) : (
                <p className="text-sm italic text-slate-500 dark:text-slate-400">No department data found.</p>
              )}
            </div>
          </div>

          {summary.months.length ? (
            <div className="card p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Incidents over time</h3>
              <MonthColumns months={summary.months} />
            </div>
          ) : null}

          {/* Redundant once a single status is selected above — only useful
              when viewing "All", to see the split across every status. */}
          {statusFilter === "ALL" && summary.statuses ? (
            <div className="card p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By status</h3>
              <StatusChips statuses={summary.statuses} />
            </div>
          ) : null}

          <div className="card p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {filterLabel} incidents — {facility}
            </h3>
            <IncidentCards
              sheet={filteredSheet}
              emptyMessage={`No ${filterLabel.toLowerCase()} incidents for ${facility}.`}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── SLT Tracker: per-person performance ────────────────────────────────────

// The Action Register (20 columns) and Master Calendar (13 columns, several
// with long labels) hit the same problem the Incident Report table did —
// a fixed-width table with this many columns squeezes headers into
// unreadable vertical text. Card layouts (below) avoid that the same way
// IncidentCards does for the Incident Report.

const ACTION_STATUS_META = {
  COMPLETED: { label: "Completed", color: "var(--status-good)" },
  "IN PROGRESS": { label: "In Progress", color: "var(--status-warning)" },
  ASSIGNED: { label: "Assigned", color: "var(--series-1)" },
  "NOT STARTED": { label: "Not Started", color: "#94a3b8" },
};

function normalizeActionStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  return ACTION_STATUS_META[s] ? s : null;
}

function isPastDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Used to match a roster name (e.g. "Tom") against a free-text owner field
// (e.g. "Tom / Priya") without also matching a different name that happens
// to contain it as a substring.
function nameMatches(text, name) {
  if (!text || !name) return false;
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
  return re.test(String(text));
}

// Decisions come from two sheets (Decision Queue = still pending, Decision
// Register = archived/historical) with real-world statuses that don't
// reduce to a clean fixed set the way action statuses do (Completed, In
// Progress, Assigned, Deferred, Priority, Visibility Only, Gathering Info…),
// so the badge color is just "green if Completed, gray if Deferred, blue
// for anything else in flight" rather than a full lookup table.
function decisionStatusColor(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  if (s === "COMPLETED") return "var(--status-good)";
  if (s === "DEFERRED") return "#94a3b8";
  return "var(--series-1)";
}

// A single row from any of the three tables, normalized into the shape
// SltItemCard renders: a title, status/overdue badges, a one-line summary,
// an optional body paragraph, and the leftover columns for "view full
// details". Column matching reuses the same findCol() regex patterns the
// old per-type card components used, so behavior is unchanged — only the
// three render paths are now unified into one.
function extractSltItemView(type, headers, row) {
  if (type === "action") {
    const idx = {
      item: findCol(headers, /^item$/i),
      owner: findCol(headers, /^owner$/i),
      dueDate: findCol(headers, /^due date$/i),
      status: findCol(headers, /^status$/i),
      priority: findCol(headers, /^priority$/i),
      category: findCol(headers, /^category$/i),
      nextAction: findCol(headers, /next action/i),
    };
    const statusKey = idx.status >= 0 ? normalizeActionStatus(row[idx.status]) : null;
    const statusMeta = statusKey ? ACTION_STATUS_META[statusKey] : null;
    const dueDate = idx.dueDate >= 0 ? row[idx.dueDate] : null;
    const overdue = statusKey !== "COMPLETED" && isPastDate(dueDate);
    const badges = [];
    if (statusMeta) badges.push({ text: statusMeta.label, color: statusMeta.color });
    if (overdue) badges.push({ text: "Overdue", color: "var(--status-critical)" });
    if (idx.priority >= 0 && row[idx.priority]) badges.push({ text: `${row[idx.priority]} priority`, outline: true });
    return {
      idx,
      title: idx.item >= 0 && row[idx.item] ? row[idx.item] : "Action item",
      badges,
      metaLine: [
        idx.owner >= 0 ? row[idx.owner] : null,
        dueDate ? `Due ${dueDate}` : null,
        idx.category >= 0 ? row[idx.category] : null,
      ]
        .filter(Boolean)
        .join(" · "),
      body: idx.nextAction >= 0 ? row[idx.nextAction] : null,
    };
  }

  if (type === "calendar") {
    const idx = {
      title: findCol(headers, /^event \/ deadline$/i),
      eventDate: findCol(headers, /^event date$/i),
      owner: findCol(headers, /^owner \/ lead$/i),
      category: findCol(headers, /^category$/i),
      prepDeadline: findCol(headers, /^prep deadline$/i),
    };
    const eventDateRaw = idx.eventDate >= 0 ? row[idx.eventDate] : null;
    const isPast = isPastDate(eventDateRaw);
    const prepDeadlineRaw = idx.prepDeadline >= 0 ? row[idx.prepDeadline] : null;
    const prepAtRisk = !isPast && isPastDate(prepDeadlineRaw);
    const badges = [];
    if (isPast) badges.push({ text: "Past", outline: true });
    if (prepAtRisk) badges.push({ text: "Prep at risk", color: "var(--status-critical)" });
    return {
      idx,
      title: idx.title >= 0 && row[idx.title] ? row[idx.title] : "Calendar event",
      badges,
      metaLine: [
        eventDateRaw,
        idx.owner >= 0 ? row[idx.owner] : null,
        idx.category >= 0 ? row[idx.category] : null,
      ]
        .filter(Boolean)
        .join(" · "),
      body: null,
    };
  }

  // decision
  const idx = {
    decision: findCol(headers, /^decision required$/i),
    assignedTo: findCol(headers, /^assigned to$/i),
    deadline: findCol(headers, /^decision deadline$/i),
    status: findCol(headers, /^status$/i),
    workstream: findCol(headers, /^workstream$/i),
    decisionType: findCol(headers, /^decision type$/i),
    recommendation: findCol(headers, /^recommendation$/i),
    source: findCol(headers, /^source$/i),
  };
  const status = idx.status >= 0 ? row[idx.status] : null;
  const statusColor = decisionStatusColor(status);
  const isCompleted = String(status || "").trim().toUpperCase() === "COMPLETED";
  const deadline = idx.deadline >= 0 ? row[idx.deadline] : null;
  const overdue = !isCompleted && isPastDate(deadline);
  const badges = [];
  if (statusColor) badges.push({ text: status, color: statusColor });
  if (overdue) badges.push({ text: "Overdue", color: "var(--status-critical)" });
  if (idx.workstream >= 0 && row[idx.workstream]) badges.push({ text: row[idx.workstream], outline: true });
  return {
    idx,
    title: idx.decision >= 0 && row[idx.decision] ? row[idx.decision] : "Decision",
    badges,
    metaLine: [
      idx.source >= 0 ? row[idx.source] : null,
      idx.assignedTo >= 0 ? row[idx.assignedTo] : null,
      deadline ? `Due ${deadline}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    body: idx.recommendation >= 0 ? row[idx.recommendation] : null,
  };
}

// The date column used to sort the combined list chronologically — same
// column each type's card already shows in its metadata line. Items with
// no date (should be rare) sort to the end rather than to the top.
function sltSortDate(type, headers, row) {
  const pattern =
    type === "action" ? /^due date$/i : type === "calendar" ? /^event date$/i : /^decision deadline$/i;
  const i = findCol(headers, pattern);
  return i >= 0 ? row[i] : null;
}

const SLT_TYPE_LABELS = {
  action: { label: "Action", className: "bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/10 dark:text-[#A7D344]" },
  calendar: {
    label: "Event",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  decision: {
    label: "Decision",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

// One card shape for all three record types — a small colored type badge
// up front tells you what kind of item it is, since they now show up mixed
// together in a single list instead of under three separate headers.
function SltItemCard({ type, headers, row, id, canEdit, onEdit, onDelete }) {
  const view = useMemo(() => extractSltItemView(type, headers, row), [type, headers, row]);
  const typeMeta = SLT_TYPE_LABELS[type];

  const secondaryCols = useMemo(() => {
    const primarySet = new Set(Object.values(view.idx).filter((i) => i >= 0));
    return headers.map((_, i) => i).filter((i) => !primarySet.has(i));
  }, [headers, view.idx]);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeMeta.className}`}
          >
            {typeMeta.label}
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">{view.title}</span>
          {view.badges.map((b, bi) =>
            b.outline ? (
              <span
                key={bi}
                className="inline-flex items-center rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                {b.text}
              </span>
            ) : (
              <span
                key={bi}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: b.color }}
              >
                {b.text}
              </span>
            )
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{view.metaLine}</span>
          {canEdit ? (
            <span className="flex items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onEdit?.(type, id, row, headers)}
                className="text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(type, id)}
                className="text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </span>
          ) : null}
        </div>
      </div>

      {view.body ? (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{view.body}</p>
      ) : null}

      {secondaryCols.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            {isOpen ? "Hide details" : "View full details"}
          </button>
          {isOpen ? (
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {secondaryCols.map((ci) => {
                const val = row[ci];
                if (val === "" || val == null) return null;
                return (
                  <div key={ci} className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {headers[ci]}
                    </p>
                    <p className="break-words text-sm text-slate-700 dark:text-slate-200">{val}</p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// entries: [{ type, headers, row, id }, ...] already sorted by the caller.
function SltCombinedList({ entries, emptyMessage, canEdit, onEdit, onDelete }) {
  if (!entries.length) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        {emptyMessage || "No SLT items found yet."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <SltItemCard
          key={`${e.type}-${e.id}`}
          type={e.type}
          headers={e.headers}
          row={e.row}
          id={e.id}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function SltPersonRow({ person, selected, onSelect }) {
  const overdueBad = person.actionsOverdue > 0;
  const prepBad = person.eventsPrepAtRisk > 0;
  const decisionsBad = person.decisionsOverdue > 0;
  return (
    <tr
      onClick={onSelect}
      title={selected ? "Click to show all people again" : `Click to see everything for ${person.name}`}
      className={`cursor-pointer transition-colors ${
        selected ? "bg-[#0B3EAF]/10 dark:bg-[#A7D344]/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
      }`}
    >
      <td className="py-2 px-3 font-semibold text-[#0B3EAF] underline-offset-2 hover:underline dark:text-[#A7D344]">
        {person.name}
      </td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.actionsCompleted}</td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.actionsOpen}</td>
      <td
        className={`py-2 px-3 text-center font-semibold ${
          overdueBad ? "text-[var(--status-critical)]" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {person.actionsOverdue}
      </td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.eventsOwned}</td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.eventsUpcoming}</td>
      <td
        className={`py-2 px-3 text-center font-semibold ${
          prepBad ? "text-[var(--status-critical)]" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {person.eventsPrepAtRisk}
      </td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.decisionsCompleted}</td>
      <td className="py-2 px-3 text-center text-slate-700 dark:text-slate-200">{person.decisionsOpen}</td>
      <td
        className={`py-2 px-3 text-center font-semibold ${
          decisionsBad ? "text-[var(--status-critical)]" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {person.decisionsOverdue}
      </td>
    </tr>
  );
}

// ─── SLT Report — native, in-portal add/edit/delete ─────────────────────────
// Each of the three record types (action items, calendar events, decisions)
// shares one generic form modal, configured by SLT_FIELD_DEFS below — the
// same field keys/labels sltItems.service.js's ACTION_COLUMNS / CALENDAR_
// COLUMNS / DECISION_COLUMNS use, so editing an existing row just means
// reading its cells back out by header label (sltRowToFields, below).

const SLT_FIELD_DEFS = {
  action: [
    { key: "item", label: "Item", kind: "text", required: true },
    { key: "owner", label: "Owner", kind: "text", required: true },
    { key: "due_date", label: "Due Date", kind: "date" },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: ["NOT STARTED", "ASSIGNED", "IN PROGRESS", "COMPLETED"],
      default: "NOT STARTED",
    },
    { key: "priority", label: "Priority", kind: "select", options: ["", "Low", "Medium", "High"] },
    { key: "category", label: "Category", kind: "text" },
    { key: "next_action", label: "Next Action", kind: "textarea" },
    { key: "notes", label: "Notes", kind: "textarea" },
  ],
  calendar: [
    { key: "title", label: "Event / Deadline", kind: "text", required: true },
    { key: "event_date", label: "Event Date", kind: "date", required: true },
    { key: "owner", label: "Owner / Lead", kind: "text", required: true },
    { key: "category", label: "Category", kind: "text" },
    { key: "prep_deadline", label: "Prep Deadline", kind: "date" },
    { key: "notes", label: "Notes", kind: "textarea" },
  ],
  decision: [
    { key: "decision", label: "Decision Required", kind: "text", required: true },
    { key: "assigned_to", label: "Assigned To", kind: "text", required: true },
    { key: "deadline", label: "Decision Deadline", kind: "date" },
    {
      key: "status",
      label: "Status",
      kind: "select",
      options: ["Not Started", "In Progress", "Pending", "Deferred", "Completed"],
      default: "Not Started",
    },
    { key: "workstream", label: "Workstream", kind: "text" },
    { key: "decision_type", label: "Decision Type", kind: "text" },
    { key: "recommendation", label: "Recommendation", kind: "textarea" },
    { key: "source", label: "Source", kind: "text" },
    { key: "notes", label: "Notes", kind: "textarea" },
  ],
};

const SLT_TYPE_META = {
  action: { noun: "action item", endpoint: "/cfo/slt/action-items" },
  calendar: { noun: "calendar event", endpoint: "/cfo/slt/calendar-events" },
  decision: { noun: "decision", endpoint: "/cfo/slt/decisions" },
};

// Reconstructs the typed field values an edit form needs from a rendered
// {headers, row} pair — the inverse of the backend's toSheet(). Matches by
// the same header labels the Card components already key off of via
// findCol(), so this stays in sync with them automatically.
function sltRowToFields(type, headers, row) {
  const defs = SLT_FIELD_DEFS[type];
  const out = {};
  for (const def of defs) {
    const i = headers.indexOf(def.label);
    out[def.key] = i >= 0 && row[i] != null ? row[i] : "";
  }
  return out;
}

// One form for all three record types — which fields it shows, and where it
// submits, come entirely from SLT_FIELD_DEFS[type] / SLT_TYPE_META[type].
// When adding (not editing), a "What are you adding?" selector lets the
// user pick the type right here instead of needing three separate "+ Add"
// buttons out in the list — that selector is hidden while editing, since an
// existing row's type never changes.
function SltItemFormModal({ initialType, itemId, initialFields, onClose, onSaved }) {
  const isEdit = Boolean(itemId);

  const buildInitial = (forType, seedFields) => {
    const out = {};
    for (const def of SLT_FIELD_DEFS[forType]) {
      out[def.key] = seedFields?.[def.key] ?? (def.kind === "select" ? def.default || "" : "");
    }
    return out;
  };

  const [type, setType] = useState(initialType || "action");
  const defs = SLT_FIELD_DEFS[type];
  const meta = SLT_TYPE_META[type];

  const [fields, setFields] = useState(() => buildInitial(type, initialFields));
  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const changeType = (nextType) => {
    setType(nextType);
    setFields(buildInitial(nextType, null));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    for (const def of defs) {
      if (def.required && !String(fields[def.key] || "").trim()) {
        setError(`${def.label} is required.`);
        return;
      }
    }
    setSubmitting(true);
    setError("");
    const payload = {};
    for (const def of defs) {
      const v = typeof fields[def.key] === "string" ? fields[def.key].trim() : fields[def.key];
      payload[def.key] = v === "" ? null : v;
    }
    try {
      if (isEdit) await api.patch(`${meta.endpoint}/${itemId}`, payload);
      else await api.post(meta.endpoint, payload);
      onSaved();
    } catch (err) {
      setError(friendlyErrorMessage(err, `Could not save this ${meta.noun}.`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-[#141414]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? `Edit ${meta.noun}` : "Add SLT item"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          {!isEdit ? (
            <div>
              <label className={FORM_LABEL}>What are you adding?</label>
              <select className={FORM_FIELD} value={type} onChange={(e) => changeType(e.target.value)}>
                <option value="action">Action item</option>
                <option value="calendar">Calendar event</option>
                <option value="decision">Decision</option>
              </select>
            </div>
          ) : null}

          {defs.map((def) => (
            <div key={def.key}>
              <label className={FORM_LABEL}>
                {def.label}
                {def.required ? "" : " (optional)"}
              </label>
              {def.kind === "select" ? (
                <select
                  className={FORM_FIELD}
                  value={fields[def.key] || ""}
                  onChange={(e) => setField(def.key, e.target.value)}
                >
                  {def.options.map((o) => (
                    <option key={o || "blank"} value={o}>
                      {o || "—"}
                    </option>
                  ))}
                </select>
              ) : def.kind === "textarea" ? (
                <textarea
                  className={FORM_FIELD}
                  rows={3}
                  required={def.required}
                  value={fields[def.key] || ""}
                  onChange={(e) => setField(def.key, e.target.value)}
                />
              ) : (
                <input
                  type={def.kind === "date" ? "date" : "text"}
                  className={FORM_FIELD}
                  required={def.required}
                  value={fields[def.key] || ""}
                  onChange={(e) => setField(def.key, e.target.value)}
                />
              )}
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-white/12 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-[#A7D344] dark:text-slate-900"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Combines the three native SLT tables into one per-person view — see
// sltItems.service.js's buildSltPerformance() for how they get matched up
// server-side (ported from the old Excel version, same matching rules).
// People with the most overdue actions / at-risk prep sort to the top since
// that's what someone checking this report mainly wants to see first.
function SltPerformanceDashboard({ report, onRefresh, refreshing, canEdit }) {
  const performance = report.performance || { roster: [], unmatchedCalendarOwners: [], unmatchedDecisionAssignees: [] };
  const roster = useMemo(
    () =>
      [...performance.roster].sort(
        (a, b) =>
          b.actionsOverdue + b.eventsPrepAtRisk + b.decisionsOverdue - (a.actionsOverdue + a.eventsPrepAtRisk + a.decisionsOverdue)
      ),
    [performance.roster]
  );

  // Clicking a name in the roster table drills into just that person's
  // action items, calendar events, and decisions below, matched via the
  // same Owner / Owner-Lead / Assigned To columns the roster stats are
  // built from.
  const [selectedPerson, setSelectedPerson] = useState(null);
  const detailsRef = useRef(null);

  // Which "Add"/"Edit" form is open, if any — one modal shared by all three
  // record types (SltItemFormModal, above).
  const [formState, setFormState] = useState(null); // { type, itemId, initialFields } | null

  const actionHeaders = report.actionItems?.headers || [];
  const actionRows = report.actionItems?.rows || [];
  const actionIds = report.actionItems?.ids || [];
  const actionOwnerIdx = useMemo(() => findCol(actionHeaders, /^owner$/i), [actionHeaders]);
  const calendarHeaders = report.calendarEvents?.headers || [];
  const calendarRows = report.calendarEvents?.rows || [];
  const calendarIds = report.calendarEvents?.ids || [];
  const calendarOwnerIdx = useMemo(() => findCol(calendarHeaders, /^owner \/ lead$/i), [calendarHeaders]);
  const decisionHeaders = report.decisionItems?.headers || [];
  const decisionRows = report.decisionItems?.rows || [];
  const decisionIds = report.decisionItems?.ids || [];
  const decisionAssigneeIdx = useMemo(() => findCol(decisionHeaders, /^assigned to$/i), [decisionHeaders]);

  // Filters rows down to just the selected person while keeping the
  // parallel ids array in sync, so edit/delete still target the right row
  // after filtering.
  const filterByPerson = (rows, ids, ownerIdx, matches) => {
    if (!selectedPerson || ownerIdx < 0) return { rows, ids };
    const keepRows = [];
    const keepIds = [];
    rows.forEach((row, i) => {
      if (matches(row[ownerIdx])) {
        keepRows.push(row);
        keepIds.push(ids[i]);
      }
    });
    return { rows: keepRows, ids: keepIds };
  };

  const { rows: filteredActionRows, ids: filteredActionIds } = useMemo(
    () =>
      filterByPerson(
        actionRows,
        actionIds,
        actionOwnerIdx,
        (v) => String(v || "").trim().toLowerCase() === String(selectedPerson || "").toLowerCase()
      ),
    [actionRows, actionIds, actionOwnerIdx, selectedPerson]
  );
  const { rows: filteredCalendarRows, ids: filteredCalendarIds } = useMemo(
    () => filterByPerson(calendarRows, calendarIds, calendarOwnerIdx, (v) => nameMatches(v, selectedPerson)),
    [calendarRows, calendarIds, calendarOwnerIdx, selectedPerson]
  );
  const { rows: filteredDecisionRows, ids: filteredDecisionIds } = useMemo(
    () =>
      filterByPerson(
        decisionRows,
        decisionIds,
        decisionAssigneeIdx,
        (v) => String(v || "").trim().toLowerCase() === String(selectedPerson || "").toLowerCase()
      ),
    [decisionRows, decisionIds, decisionAssigneeIdx, selectedPerson]
  );

  const selectPerson = (name) => {
    setSelectedPerson((prev) => {
      const next = prev === name ? null : name;
      if (next) {
        // Wait a tick so the filtered lists have re-rendered before scrolling.
        requestAnimationFrame(() => {
          detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  };

  const openAdd = (presetType = "action") => setFormState({ type: presetType, itemId: null, initialFields: null });
  const openEdit = (type, itemId, row, headers) =>
    setFormState({ type, itemId, initialFields: sltRowToFields(type, headers, row) });
  const closeForm = () => setFormState(null);
  const handleSaved = () => {
    setFormState(null);
    onRefresh?.();
  };

  // All three filtered lists merged into one, sorted by date (undated items
  // last) — this is what renders as a single list instead of three
  // separately-headed sections.
  const combinedEntries = useMemo(() => {
    const items = [
      ...filteredActionRows.map((row, i) => ({ type: "action", row, id: filteredActionIds[i], headers: actionHeaders })),
      ...filteredCalendarRows.map((row, i) => ({
        type: "calendar",
        row,
        id: filteredCalendarIds[i],
        headers: calendarHeaders,
      })),
      ...filteredDecisionRows.map((row, i) => ({
        type: "decision",
        row,
        id: filteredDecisionIds[i],
        headers: decisionHeaders,
      })),
    ];
    return items
      .map((e) => ({ ...e, sortDate: sltSortDate(e.type, e.headers, e.row) }))
      .sort((a, b) => {
        if (!a.sortDate && !b.sortDate) return 0;
        if (!a.sortDate) return 1;
        if (!b.sortDate) return -1;
        return new Date(a.sortDate) - new Date(b.sortDate);
      });
  }, [
    filteredActionRows,
    filteredActionIds,
    actionHeaders,
    filteredCalendarRows,
    filteredCalendarIds,
    calendarHeaders,
    filteredDecisionRows,
    filteredDecisionIds,
    decisionHeaders,
  ]);

  const handleDelete = async (type, itemId) => {
    const meta = SLT_TYPE_META[type];
    if (!window.confirm(`Delete this ${meta.noun}? This cannot be undone.`)) return;
    try {
      await api.delete(`${meta.endpoint}/${itemId}`);
      onRefresh?.();
    } catch (err) {
      window.alert(friendlyErrorMessage(err, `Could not delete this ${meta.noun}.`));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Performance by person</h3>
        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {report.fetchedAt ? <>Loaded {formatDate(report.fetchedAt)}</> : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="font-semibold text-[#0B3EAF] underline disabled:opacity-50 dark:text-[#A7D344]"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </span>
      </div>

      {roster.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-1.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400" rowSpan={2}>
                  Person
                </th>
                <th className="py-1.5 px-3 text-center font-semibold" colSpan={3}>
                  Actions
                </th>
                <th className="border-l border-slate-200 py-1.5 px-3 text-center font-semibold dark:border-slate-800" colSpan={3}>
                  Calendar events
                </th>
                <th className="border-l border-slate-200 py-1.5 px-3 text-center font-semibold dark:border-slate-800" colSpan={3}>
                  Decisions
                </th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <th className="py-2 px-3 text-center font-semibold">Completed</th>
                <th className="py-2 px-3 text-center font-semibold">Open</th>
                <th className="py-2 px-3 text-center font-semibold">Overdue</th>
                <th className="border-l border-slate-200 py-2 px-3 text-center font-semibold dark:border-slate-800">
                  Owned
                </th>
                <th className="py-2 px-3 text-center font-semibold">Upcoming</th>
                <th className="py-2 px-3 text-center font-semibold">Prep at risk</th>
                <th className="border-l border-slate-200 py-2 px-3 text-center font-semibold dark:border-slate-800">
                  Completed
                </th>
                <th className="py-2 px-3 text-center font-semibold">Open</th>
                <th className="py-2 px-3 text-center font-semibold">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {roster.map((p) => (
                <SltPersonRow
                  key={p.name}
                  person={p}
                  selected={selectedPerson === p.name}
                  onSelect={() => selectPerson(p.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          No SLT owners found yet — add an action item below to get started.
        </p>
      )}

      {roster.length ? (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          Click a name to see everything for that person.
        </p>
      ) : null}

      {performance.unmatchedCalendarOwners && performance.unmatchedCalendarOwners.length ? (
        <p className="text-xs italic text-slate-500 dark:text-slate-400">
          Also on the calendar but not in the Action Items roster, so not counted above:{" "}
          {performance.unmatchedCalendarOwners.join(", ")}.
        </p>
      ) : null}

      {performance.unmatchedDecisionAssignees && performance.unmatchedDecisionAssignees.length ? (
        <p className="text-xs italic text-slate-500 dark:text-slate-400">
          Also assigned decisions but not in the Action Items roster, so not counted above:{" "}
          {performance.unmatchedDecisionAssignees.join(", ")}.
        </p>
      ) : null}

      <div ref={detailsRef} className="scroll-mt-4 space-y-6">
        {selectedPerson ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#0B3EAF]/30 bg-[#0B3EAF]/5 px-3 py-2 text-sm dark:border-[#A7D344]/30 dark:bg-[#A7D344]/10">
            <span className="text-slate-700 dark:text-slate-200">
              Showing action items, calendar events, and decisions for{" "}
              <span className="font-semibold">{selectedPerson}</span>.
            </span>
            <button
              type="button"
              onClick={() => setSelectedPerson(null)}
              className="ml-auto font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
            >
              Show all
            </button>
          </div>
        ) : null}

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              SLT items{selectedPerson ? ` — ${selectedPerson}` : ""}
            </h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => openAdd()}
                className="text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
              >
                + Add item
              </button>
            ) : null}
          </div>
          <SltCombinedList
            entries={combinedEntries}
            canEdit={canEdit}
            onEdit={openEdit}
            onDelete={handleDelete}
            emptyMessage={
              selectedPerson ? `No SLT items for ${selectedPerson}.` : "No SLT items found yet — add one to get started."
            }
          />
        </div>
      </div>

      {formState ? (
        <SltItemFormModal
          initialType={formState.type}
          itemId={formState.itemId}
          initialFields={formState.initialFields}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}

// ─── Incident Report — native, in-portal submission ─────────────────────────
// Reported directly on this page instead of editing the SharePoint Excel
// workbook. Viewing requires the CFO, incident_report_view, or
// incident_report_edit admin grant; adding/editing requires CFO or
// incident_report_edit (checked both here, for the UI, and on the server).
// The older Excel-sourced data is kept read-only, below, as history.

const NATIVE_STATUS_META = {
  open: { label: "Open", color: "var(--status-critical)" },
  in_progress: { label: "In Progress", color: "var(--status-warning)" },
  closed: { label: "Closed", color: "var(--status-good)" },
};

const NATIVE_STATUS_FILTER_OPTIONS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "closed", label: "Closed" },
  { key: "ALL", label: "All" },
];

// Same color treatment as the IT Ticket board's status filter tabs
// (itTicketStyles.js's IT_FILTER_TABS) — these sit on the same blue
// gradient header, so the "idle" state is translucent white rather than an
// outlined pill.
const NATIVE_STATUS_FILTER_TABS = [
  {
    key: "ALL",
    label: "All",
    active:
      "bg-white text-[#0B3EAF] shadow-md ring-2 ring-white/80 dark:bg-[#141414] dark:text-[#A7D344] dark:ring-[#A7D344]/40",
    idle: "bg-white/15 text-white hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20",
  },
  {
    key: "open",
    label: "Open",
    active: "bg-[#A7D344] text-[#0a0a0a] shadow-md ring-2 ring-[#A7D344]/60",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "in_progress",
    label: "In Progress",
    active: "bg-amber-300 text-amber-950 shadow-md ring-2 ring-amber-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "closed",
    label: "Closed",
    active: "bg-emerald-300 text-emerald-950 shadow-md ring-2 ring-emerald-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
];

function StatPill({ label, value, accent }) {
  return (
    <div
      className={`flex min-h-[3rem] min-w-[3.75rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-center ${accent}`}
    >
      <div className="text-base font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

const SEVERITY_OPTIONS = SEVERITY_ORDER.map((k) => ({ value: k, label: SEVERITY_META[k].label }));

const NATIVE_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

const MAX_INCIDENT_ATTACHMENTS = 5;
const INCIDENT_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp";

function isImageAttachment(a) {
  return /\.(jpe?g|png|gif|webp)$/i.test(String(a?.url || a?.name || ""));
}

function buildNativeIncidentSummary(incidents) {
  const total = incidents.length;
  const severityCounts = { L1: 0, L2: 0, L3: 0, L4: 0 };
  let severityKnown = 0;
  const deptCounts = new Map();
  const monthCounts = new Map();
  const statusCounts = new Map();

  for (const inc of incidents) {
    if (inc.severity && severityCounts[inc.severity] != null) {
      severityCounts[inc.severity] += 1;
      severityKnown += 1;
    }
    const dept = String(inc.department || "").trim() || "Unspecified";
    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
    const mk = monthKey(inc.incident_date);
    if (mk) monthCounts.set(mk, (monthCounts.get(mk) || 0) + 1);
    const statLabel = NATIVE_STATUS_META[inc.status]?.label || inc.status || "Unspecified";
    statusCounts.set(statLabel, (statusCounts.get(statLabel) || 0) + 1);
  }

  const departments = [...deptCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topDepartments = departments.slice(0, 6);
  const otherDeptTotal = departments.slice(6).reduce((s, [, c]) => s + c, 0);
  if (otherDeptTotal > 0) topDepartments.push(["Other", otherDeptTotal]);

  const months = [...monthCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const statuses = statusCounts.size > 0 && statusCounts.size <= 6 ? [...statusCounts.entries()].sort((a, b) => b[1] - a[1]) : null;

  return { total, severityCounts, severityKnown, topDepartments, months, statuses };
}

function NativeIncidentCard({ incident, canEdit, canDelete, onEdit, onDelete }) {
  const sevMeta = SEVERITY_META[incident.severity] || null;
  const statMeta = NATIVE_STATUS_META[incident.status] || null;
  const [open, setOpen] = useState(false);

  const secondary = [
    incident.root_cause ? ["Root cause", incident.root_cause] : null,
    incident.corrective_action ? ["Corrective action", incident.corrective_action] : null,
    incident.preventive_action ? ["Preventive action", incident.preventive_action] : null,
    incident.reported_by_name ? ["Reported by", incident.reported_by_name] : null,
    incident.status === "closed" && incident.closed_by_name ? ["Closed by", incident.closed_by_name] : null,
    incident.status === "closed" && incident.closed_at ? ["Closed on", formatDate(incident.closed_at)] : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">Incident #{incident.id}</span>
          {sevMeta ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: sevMeta.color }}
            >
              {incident.severity}
            </span>
          ) : null}
          {statMeta ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: statMeta.color }}
            >
              {statMeta.label}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {[incident.incident_date, incident.department].filter(Boolean).join(" · ")}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{incident.description}</p>

      {incident.financial_impact ? (
        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          Financial impact:{" "}
          <span className="font-semibold text-slate-900 dark:text-white">{incident.financial_impact}</span>
        </p>
      ) : null}

      {incident.attachments?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {incident.attachments.map((a, idx) => (
            <a
              key={`${a.url}-${idx}`}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-[#0B3EAF] hover:underline dark:border-slate-700 dark:bg-slate-800 dark:text-[#A7D344]"
              title={a.name}
            >
              <span className="rounded bg-[#0B3EAF]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">
                {isImageAttachment(a) ? "Photo" : "File"}
              </span>
              <span className="max-w-[12rem] truncate">{a.name}</span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        {secondary.length ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            {open ? "Hide details" : "View full details"}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(incident)}
            className="text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            Edit
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => onDelete(incident)}
            className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
          >
            Delete
          </button>
        ) : null}
      </div>

      {open && secondary.length ? (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {secondary.map(([label, val]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {label}
              </p>
              <p className="break-words text-sm text-slate-700 dark:text-slate-200">{val}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IncidentFormModal({ incident, onClose, onSaved }) {
  const isEdit = Boolean(incident);
  const [facility, setFacility] = useState(incident?.facility || FACILITIES[0].code);
  const [department, setDepartment] = useState(incident?.department || "");
  const [incidentDate, setIncidentDate] = useState(incident?.incident_date || new Date().toISOString().slice(0, 10));
  const [severity, setSeverity] = useState(incident?.severity || "L1");
  const [status, setStatus] = useState(incident?.status || "open");
  const [description, setDescription] = useState(incident?.description || "");
  const [financialImpact, setFinancialImpact] = useState(incident?.financial_impact || "");
  const [showMore, setShowMore] = useState(
    Boolean(incident?.root_cause || incident?.corrective_action || incident?.preventive_action)
  );
  const [rootCause, setRootCause] = useState(incident?.root_cause || "");
  const [correctiveAction, setCorrectiveAction] = useState(incident?.corrective_action || "");
  const [preventiveAction, setPreventiveAction] = useState(incident?.preventive_action || "");
  const [attachments, setAttachments] = useState(incident?.attachments || []);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onAttachmentFiles = async (fileList) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploadError("");
    const room = MAX_INCIDENT_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setUploadError(`You can attach up to ${MAX_INCIDENT_ATTACHMENTS} files.`);
      return;
    }
    const toUpload = files.slice(0, room);
    setUploadBusy(true);
    try {
      const next = [...attachments];
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("file", file);
        const data = await postIncidentAttachment(fd);
        const url = data?.file_url;
        if (!url) throw new Error("Upload did not return a file URL.");
        const name = String(data?.original_name || file.name || "attachment").slice(0, 200);
        next.push({ url, name });
      }
      setAttachments(next);
    } catch (err) {
      setUploadError(friendlyErrorMessage(err, "Upload failed."));
    } finally {
      setUploadBusy(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setSubmitting(true);
    setError("");
    const payload = {
      facility,
      department: department.trim() || null,
      incident_date: incidentDate,
      severity,
      description: description.trim(),
      financial_impact: financialImpact.trim() || null,
      root_cause: rootCause.trim() || null,
      corrective_action: correctiveAction.trim() || null,
      preventive_action: preventiveAction.trim() || null,
      attachments,
    };
    if (isEdit) payload.status = status;
    try {
      const { data } = isEdit
        ? await api.patch(`/cfo/incidents/${incident.id}`, payload)
        : await api.post("/cfo/incidents", payload);
      onSaved(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save this incident."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-[#141414]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? `Edit incident #${incident.id}` : "Report an incident"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FORM_LABEL}>Facility</label>
              <select className={FORM_FIELD} value={facility} onChange={(e) => setFacility(e.target.value)}>
                {FACILITIES.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FORM_LABEL}>Date of incident</label>
              <input
                type="date"
                className={FORM_FIELD}
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FORM_LABEL}>Department</label>
              <input
                type="text"
                className={FORM_FIELD}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Production"
              />
            </div>
            <div>
              <label className={FORM_LABEL}>Severity</label>
              <select className={FORM_FIELD} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isEdit ? (
            <div>
              <label className={FORM_LABEL}>Status</label>
              <select className={FORM_FIELD} value={status} onChange={(e) => setStatus(e.target.value)}>
                {NATIVE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={FORM_LABEL}>What happened?</label>
            <textarea
              className={FORM_FIELD}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the incident"
              required
            />
          </div>

          <div>
            <label className={FORM_LABEL}>Financial impact (optional)</label>
            <input
              type="text"
              className={FORM_FIELD}
              value={financialImpact}
              onChange={(e) => setFinancialImpact(e.target.value)}
              placeholder="e.g. $1,200 — leave blank if none"
            />
          </div>

          <div className="rounded-2xl border-2 border-dashed border-[rgba(11,62,175,0.2)] bg-[rgba(11,62,175,0.03)] p-5 dark:border-[rgba(167,211,68,0.25)] dark:bg-[rgba(167,211,68,0.04)]">
            <label className={FORM_LABEL}>Photos or documents (optional)</label>
            {uploadError ? (
              <p className="mb-2 text-sm text-[#E02B20] dark:text-red-300">{uploadError}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-outline inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-50">
                <input
                  type="file"
                  className="sr-only"
                  accept={INCIDENT_ATTACHMENT_ACCEPT}
                  multiple
                  disabled={uploadBusy || attachments.length >= MAX_INCIDENT_ATTACHMENTS}
                  onChange={(e) => {
                    void onAttachmentFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {uploadBusy ? "Uploading…" : "Choose files"}
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {attachments.length}/{MAX_INCIDENT_ATTACHMENTS} attached
              </span>
            </div>
            {attachments.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {attachments.map((a, idx) => (
                  <li
                    key={`${a.url}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[rgba(11,62,175,0.12)] bg-white px-3 py-2 dark:border-[rgba(167,211,68,0.2)] dark:bg-[#1a1a1a]"
                  >
                    <span className="min-w-0 truncate font-medium text-[#0B3EAF] dark:text-[#A7D344]" title={a.name}>
                      {a.name}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-[#E02B20] underline"
                      onClick={() => removeAttachment(idx)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {!showMore ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-sm font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
            >
              + Add root cause / corrective action
            </button>
          ) : (
            <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div>
                <label className={FORM_LABEL}>Root cause (optional)</label>
                <textarea
                  className={FORM_FIELD}
                  rows={2}
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                />
              </div>
              <div>
                <label className={FORM_LABEL}>Corrective action (optional)</label>
                <textarea
                  className={FORM_FIELD}
                  rows={2}
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                />
              </div>
              <div>
                <label className={FORM_LABEL}>Preventive action (optional)</label>
                <textarea
                  className={FORM_FIELD}
                  rows={2}
                  value={preventiveAction}
                  onChange={(e) => setPreventiveAction(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-white/12 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-[#A7D344] dark:text-slate-900"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Submit incident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NativeIncidentDashboard({ canEdit, canDelete }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [facility, setFacility] = useState(FACILITIES[0].code);
  const [statusFilter, setStatusFilter] = useState("open");
  const [showForm, setShowForm] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/incidents");
      setIncidents(data?.incidents || []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load incidents."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const facilityIncidents = useMemo(() => incidents.filter((i) => i.facility === facility), [incidents, facility]);
  const filteredIncidents = useMemo(() => {
    if (statusFilter === "ALL") return facilityIncidents;
    return facilityIncidents.filter((i) => i.status === statusFilter);
  }, [facilityIncidents, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { open: 0, in_progress: 0, closed: 0 };
    for (const i of facilityIncidents) if (counts[i.status] != null) counts[i.status] += 1;
    return counts;
  }, [facilityIncidents]);

  const summary = useMemo(() => buildNativeIncidentSummary(filteredIncidents), [filteredIncidents]);

  const openNewForm = () => {
    setEditingIncident(null);
    setShowForm(true);
  };
  const openEditForm = (incident) => {
    setEditingIncident(incident);
    setShowForm(true);
  };
  const closeForm = () => setShowForm(false);
  const handleSaved = (incident) => {
    setShowForm(false);
    setIncidents((prev) => {
      const idx = prev.findIndex((i) => i.id === incident.id);
      if (idx === -1) return [incident, ...prev];
      const next = [...prev];
      next[idx] = incident;
      return next;
    });
  };

  const handleDelete = async (incident) => {
    if (!window.confirm(`Delete incident #${incident.id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/cfo/incidents/${incident.id}`);
      setIncidents((prev) => prev.filter((i) => i.id !== incident.id));
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not delete this incident."));
    }
  };

  const filterLabel = statusFilter === "ALL" ? "All" : NATIVE_STATUS_META[statusFilter]?.label || statusFilter;

  return (
    <div className="space-y-6">
      <section className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-slate-200/80 dark:ring-white/10">
        {/* Gradient hero header — same treatment as the IT Ticket board
            (ItTicketsMonitorTable.jsx): title + stat pills on top, then the
            board's controls (here: facility, "Report an incident", status
            filter tabs) stacked below with white/15 dividers. */}
        <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white">
          <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="it-ticket-board-header min-w-0">
                <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">Incident Report</h2>
                <p className="mt-0.5 text-xs text-white/75">Reported and tracked right here in the portal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatPill label="Total" value={facilityIncidents.length} accent="bg-white/15 ring-1 ring-white/20" />
                <StatPill label="Open" value={statusCounts.open} accent="bg-[#A7D344] text-[#0a0a0a]" />
                <StatPill label="In progress" value={statusCounts.in_progress} accent="bg-amber-300 text-amber-950" />
                <StatPill label="Closed" value={statusCounts.closed} accent="bg-emerald-300 text-emerald-950" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3">
              <div className="inline-flex flex-wrap overflow-x-auto rounded-portal bg-white/10 p-1">
                {FACILITIES.map((f) => {
                  const isActive = f.code === facility;
                  return (
                    <button
                      key={f.code}
                      type="button"
                      onClick={() => setFacility(f.code)}
                      className={[
                        "shrink-0 rounded-[10px] px-4 py-1.5 text-sm font-bold transition",
                        isActive ? "bg-white text-[#0B3EAF] shadow-md" : "text-white/80 hover:bg-white/15",
                      ].join(" ")}
                    >
                      {f.code}
                    </button>
                  );
                })}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openNewForm}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-white/25"
                >
                  + Report an incident
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/15 pt-3">
              {NATIVE_STATUS_FILTER_TABS.map((opt) => {
                const isActive = statusFilter === opt.key;
                const count = opt.key === "ALL" ? facilityIncidents.length : statusCounts[opt.key] || 0;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusFilter(opt.key)}
                    className={["rounded-full px-3 py-1.5 text-xs font-bold transition", isActive ? opt.active : opt.idle].join(
                      " "
                    )}
                  >
                    {opt.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
              <button type="button" onClick={load} className="ml-3 font-semibold underline">
                Retry
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
              <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading incidents…</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Total incidents" value={summary.total} />
                <StatTile label="Critical (L4)" value={summary.severityCounts.L4} accent="var(--status-critical)" />
                <StatTile label="Serious (L3)" value={summary.severityCounts.L3} accent="var(--status-serious)" />
                <StatTile label="Departments involved" value={summary.topDepartments.length} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-4 sm:p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By severity</h3>
                  {summary.severityKnown > 0 ? (
                    <SeverityBars counts={summary.severityCounts} known={summary.severityKnown} total={summary.total} />
                  ) : (
                    <p className="text-sm italic text-slate-500 dark:text-slate-400">No incidents yet.</p>
                  )}
                </div>
                <div className="card p-4 sm:p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By department</h3>
                  {summary.topDepartments.length ? (
                    <DepartmentBars data={summary.topDepartments} />
                  ) : (
                    <p className="text-sm italic text-slate-500 dark:text-slate-400">No department data yet.</p>
                  )}
                </div>
              </div>

              {summary.months.length ? (
                <div className="card p-4 sm:p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Incidents over time</h3>
                  <MonthColumns months={summary.months} />
                </div>
              ) : null}

              <div className="card p-4 sm:p-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {filterLabel} incidents — {facility}
                </h3>
                {filteredIncidents.length ? (
                  <div className="space-y-3">
                    {filteredIncidents.map((incident) => (
                      <NativeIncidentCard
                        key={incident.id}
                        incident={incident}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onEdit={openEditForm}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-slate-500 dark:text-slate-400">
                    No {filterLabel.toLowerCase()} incidents for {facility}.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {showForm ? <IncidentFormModal incident={editingIncident} onClose={closeForm} onSaved={handleSaved} /> : null}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────

export default function CfoReportsPage() {
  const { user } = useAuth();
  const canSeeIncidents = hasAnyAdminGrant(user, [
    ADMIN_GRANT_KEYS.CFO,
    ADMIN_GRANT_KEYS.INCIDENT_REPORT_VIEW,
    ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT,
  ]);
  const canEditIncidents = hasAnyAdminGrant(user, [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT]);
  const canSeeSlt = hasAnyAdminGrant(user, [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_VIEW, ADMIN_GRANT_KEYS.SLT_EDIT]);
  const canEditSlt = hasAnyAdminGrant(user, [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_EDIT]);
  const canDeleteIncidents = isAdministrator(user);

  // Each tab needs its own grant check now that Incident Report and SLT
  // Report have separate view/edit grants — someone with only slt_view (and
  // no incident access) should see just the SLT tab, and vice versa.
  const visibleTabs = TABS.filter((t) => (t.key === "slt" ? canSeeSlt : canSeeIncidents));

  // "?tab=slt" comes from the Master Calendar "new event" notification
  // email (see email.service.js's sendCalendarEventCreatedEmail) so that
  // clicking the link opens straight to SLT Tracker instead of defaulting
  // to Incident Report. Only honored when the viewer actually has SLT
  // access — otherwise fall back to the normal first-visible-tab default.
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get("tab") === "slt" && canSeeSlt ? "slt" : visibleTabs[0].key
  );
  const [reportsByKey, setReportsByKey] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const [refreshingKey, setRefreshingKey] = useState(null);
  const [errorsByKey, setErrorsByKey] = useState({});

  const loadReport = useCallback(async (key, opts = {}) => {
    const isRefresh = Boolean(opts.refresh);
    // A background refresh keeps showing the current data (just disables the
    // Refresh button) instead of blanking the page back to "Loading…".
    if (isRefresh) setRefreshingKey(key);
    else setLoadingKey(key);
    setErrorsByKey((prev) => ({ ...prev, [key]: "" }));
    try {
      const { data } = await api.get(`/cfo/report/${key}${isRefresh ? "?refresh=1" : ""}`);
      setReportsByKey((prev) => ({ ...prev, [key]: data }));
    } catch (err) {
      setErrorsByKey((prev) => ({
        ...prev,
        [key]: friendlyErrorMessage(err, "Could not load that report from SharePoint."),
      }));
    } finally {
      if (isRefresh) setRefreshingKey((prev) => (prev === key ? null : prev));
      else setLoadingKey((prev) => (prev === key ? null : prev));
    }
  }, []);

  // The Incident Report tab's view is now entirely the native, in-portal
  // data (NativeIncidentDashboard, below) — the SharePoint Excel workbook
  // (legacy history) is no longer shown, so this only loads for the SLT
  // Tracker tab, which still has no native alternative.
  useEffect(() => {
    if (activeTab === "slt" && !reportsByKey[activeTab] && !errorsByKey[activeTab]) {
      loadReport(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const report = reportsByKey[activeTab];
  const error = errorsByKey[activeTab];
  const isLoading = loadingKey === activeTab;
  const isRefreshing = refreshingKey === activeTab;

  return (
    <div className={`${PAGE_SHELL} cfo-page`}>
      <style>{`
        .cfo-page {
          --status-good: #0ca30c;
          --status-warning: #fab219;
          --status-serious: #ec835a;
          --status-critical: #d03b3b;
          --series-1: #2a78d6;
        }
        .dark .cfo-page {
          --series-1: #3987e5;
        }
      `}</style>

      <PageHeader title="SLT and Incident Tracker" />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={
              tab.key === activeTab
                ? "border-b-2 border-[#0B3EAF] px-4 py-2 text-sm font-semibold text-[#0B3EAF] dark:border-[#A7D344] dark:text-[#A7D344]"
                : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={activeTab === "incident" || activeTab === "slt" ? "" : "card p-4 sm:p-6"}>
        {activeTab === "incident" ? (
          <NativeIncidentDashboard canEdit={canEditIncidents} canDelete={canDeleteIncidents} />
        ) : activeTab === "slt" ? (
          // SLT Tracker — placeholder pending rebuild. The previous build
          // (Action Register, Decision Queue + Register, 90-Day
          // Commitments, Executive Calendar, Dashboard, Weekly Review, and
          // the backend's /cfo/slt/v2/* routes/services) was removed on
          // request; see SltTrackerV2.jsx for details. The old
          // combined-list view above (SltPerformanceDashboard etc.) is
          // left in place, unused, rather than deleted, in case it's
          // needed for comparison.
          <SltTrackerV2 canEdit={canEditSlt} />
        ) : null}
      </div>
    </div>
  );
}
