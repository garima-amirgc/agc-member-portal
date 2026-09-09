import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const TABS = [
  { key: "incident", label: "Incident Report" },
  { key: "slt", label: "SLT Tracker" },
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

function IncidentCards({ sheet }) {
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
    return <p className="text-sm italic text-slate-500 dark:text-slate-400">No incidents recorded.</p>;
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

function IncidentDashboard({ report }) {
  const sheets = report.sheets || [];

  const [facility, setFacility] = useState(() => {
    const firstAvailable = FACILITIES.find((f) => sheets.some((s) => f.match.test(s.name)));
    return firstAvailable ? firstAvailable.code : FACILITIES[0].code;
  });

  const activeSheet = useMemo(() => {
    const fac = FACILITIES.find((f) => f.code === facility);
    return (fac && sheets.find((s) => fac.match.test(s.name))) || null;
  }, [sheets, facility]);

  const summary = useMemo(() => (activeSheet ? buildIncidentSummary(activeSheet) : null), [activeSheet]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FACILITIES.map((f) => {
            const available = sheets.some((s) => f.match.test(s.name));
            const isActive = f.code === facility;
            return (
              <button
                key={f.code}
                type="button"
                disabled={!available}
                onClick={() => setFacility(f.code)}
                className={
                  isActive
                    ? "rounded-full bg-[#0B3EAF] px-4 py-1.5 text-sm font-semibold text-white dark:bg-[#A7D344] dark:text-slate-900"
                    : available
                    ? "rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                    : "cursor-not-allowed rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600"
                }
              >
                {f.code}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {report.fileName} · Last updated in SharePoint: {formatDate(report.lastModifiedDateTime)}
        </span>
      </div>

      {!activeSheet ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          No sheet found for {facility} in this workbook.
        </p>
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

          {summary.statuses ? (
            <div className="card p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">By status</h3>
              <StatusChips statuses={summary.statuses} />
            </div>
          ) : null}

          <div className="card p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              All incidents — {facility}
            </h3>
            <IncidentCards sheet={activeSheet} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────

export default function CfoReportsPage() {
  const [activeTab, setActiveTab] = useState(TABS[0].key);
  const [reportsByKey, setReportsByKey] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const [errorsByKey, setErrorsByKey] = useState({});

  const loadReport = useCallback(async (key) => {
    setLoadingKey(key);
    setErrorsByKey((prev) => ({ ...prev, [key]: "" }));
    try {
      const { data } = await api.get(`/cfo/report/${key}`);
      setReportsByKey((prev) => ({ ...prev, [key]: data }));
    } catch (err) {
      setErrorsByKey((prev) => ({
        ...prev,
        [key]: friendlyErrorMessage(err, "Could not load that report from SharePoint."),
      }));
    } finally {
      setLoadingKey((prev) => (prev === key ? null : prev));
    }
  }, []);

  useEffect(() => {
    if (!reportsByKey[activeTab] && !errorsByKey[activeTab]) {
      loadReport(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const report = reportsByKey[activeTab];
  const error = errorsByKey[activeTab];
  const isLoading = loadingKey === activeTab;

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

      <PageHeader title="CFO" subtitle="Incident Report and SLT Tracker, pulled live from SharePoint." />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((tab) => (
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

      <div className={activeTab === "incident" ? "" : "card p-4 sm:p-6"}>
        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
            <button type="button" onClick={() => loadReport(activeTab)} className="ml-3 font-semibold underline">
              Retry
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : report ? (
          activeTab === "incident" ? (
            <IncidentDashboard report={report} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{report.fileName}</span>
                <span>Last updated in SharePoint: {formatDate(report.lastModifiedDateTime)}</span>
              </div>
              {report.sheets.map((sheet, i) => (
                <ReportSheet key={i} sheet={sheet} />
              ))}
            </>
          )
        ) : !error ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}
