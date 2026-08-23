import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  NPD_DEPARTMENT_FILTERS,
  NPD_REQUEST_STATUS_LABELS,
  npdRequestStatusBadgeClass,
  npdStepDef,
  npdStepOwnerLabel,
  stepMatchesDepartmentFilter,
} from "../../constants/npd";

const FIELD =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/20";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_approval", label: "Waiting on approval" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "completed", label: "Completed" },
];

const TAB_ACTIVE = "bg-white text-[#0B3EAF] dark:bg-[#A7D344] dark:text-[#0a0a0a]";
const TAB_IDLE = "bg-white/10 text-white/85 hover:bg-white/20";

const TH_BASE =
  "px-2 py-3 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const TD = "px-2 py-3 align-middle";
const BADGE =
  "inline-flex max-w-full items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide";

function vline(isLast) {
  return isLast ? "" : "border-r border-slate-200 dark:border-slate-600/55";
}

const HEADER_COL_BG = {
  id: "bg-slate-200/70 dark:bg-slate-800",
  requester: "bg-[rgba(11,62,175,0.1)] dark:bg-[rgba(11,62,175,0.28)]",
  product: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  status: "bg-emerald-100/55 dark:bg-emerald-950/35",
  step: "bg-sky-100/55 dark:bg-sky-950/35",
  department: "bg-amber-100/50 dark:bg-amber-950/30",
  start: "bg-violet-100/45 dark:bg-violet-950/30",
  end: "bg-slate-200/55 dark:bg-slate-800/80",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

function bodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    id: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    requester: alt ? "bg-blue-50 dark:bg-blue-950/25" : "bg-blue-50/45 dark:bg-blue-950/15",
    product: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    status: alt ? "bg-emerald-50/90 dark:bg-emerald-950/20" : "bg-emerald-50/50 dark:bg-emerald-950/10",
    step: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    department: alt ? "bg-amber-50/85 dark:bg-amber-950/18" : "bg-amber-50/45 dark:bg-amber-950/10",
    start: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    end: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    actions: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
  };
  return `${map[col] || (alt ? "bg-[#eef3fa]" : "bg-white")} group-hover:brightness-[0.98] dark:group-hover:brightness-110`;
}

function thClass(col, extra = "", isLast = false) {
  return [TH_BASE, HEADER_COL_BG[col] || "", vline(isLast), extra].filter(Boolean).join(" ");
}

function tdClass(col, rowIdx, extra = "", isLast = false) {
  return [TD, bodyColBg(col, rowIdx), vline(isLast), extra].filter(Boolean).join(" ");
}

function initialsFromName(name) {
  const source = String(name || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "?";
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function StatPill({ label, value, accent }) {
  return (
    <div className={`flex min-h-[3rem] min-w-[3.75rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-center ${accent}`}>
      <div className="text-base font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

function FilterGroup({ label, children, align = "start" }) {
  return (
    <div className={align === "end" ? "text-right" : ""}>
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-white/70">{label}</p>
      <div className={["flex flex-wrap gap-1", align === "end" ? "justify-end" : ""].join(" ")}>{children}</div>
    </div>
  );
}

function RequesterCell({ name }) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#0B3EAF] to-[#1a5fd4] p-[2px]">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-[9px] font-bold text-[#0B3EAF] dark:bg-[#141414] dark:text-[#A7D344]">
          {initialsFromName(name)}
        </div>
      </div>
      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">{name || "—"}</span>
    </div>
  );
}

const DEPT_BADGE =
  "bg-amber-100 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800";
const STEP_BADGE =
  "bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800";

// Delete is shown to everyone (not just admins) because who's actually
// allowed to delete is a separate, admin-configured allowlist the frontend
// doesn't have visibility into (see canDeleteRequest on the backend) — the
// server is the real gate and rejects with a clear message if someone
// without permission clicks it. Matches the prior dashboard table's behavior.
function RowActions({ request, deletingId, onDelete }) {
  return (
    <div
      className="inline-flex max-w-full items-stretch overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]"
      role="group"
      aria-label={`Actions for ${request.request_number}`}
    >
      <Link
        to={`/npd/requests/${request.id}`}
        className="inline-flex h-8 shrink-0 items-center justify-center border-r border-slate-200/90 px-2.5 text-[10px] font-semibold text-[#0B3EAF] hover:bg-[#0B3EAF]/5 dark:border-white/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10"
      >
        Open
      </Link>
      <button
        type="button"
        disabled={deletingId === request.id}
        className="inline-flex h-8 shrink-0 items-center justify-center px-2.5 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={() => onDelete?.(request)}
      >
        {deletingId === request.id ? "…" : "Delete"}
      </button>
    </div>
  );
}

export default function NpdRequestBoardTable({ requests, loading, onDelete, deletingId = null }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const list = Array.isArray(requests) ? requests : [];

  const counts = useMemo(
    () => ({
      all: list.length,
      in_progress: list.filter((r) => r.status === "in_progress").length,
      waiting_approval: list.filter((r) => r.status === "waiting_approval").length,
      changes_requested: list.filter((r) => r.status === "changes_requested").length,
      completed: list.filter((r) => r.status === "completed").length,
    }),
    [list]
  );

  const deptCounts = useMemo(() => {
    const out = { all: list.length };
    for (const dept of NPD_DEPARTMENT_FILTERS) {
      out[dept] = list.filter((r) => stepMatchesDepartmentFilter(npdStepDef(r.current_step), dept)).length;
    }
    return out;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (deptFilter && !stepMatchesDepartmentFilter(npdStepDef(r.current_step), deptFilter)) return false;
      if (dateFrom || dateTo) {
        const startDate = r.created_at ? String(r.created_at).slice(0, 10) : null;
        if (!startDate) return false;
        if (dateFrom && startDate < dateFrom) return false;
        if (dateTo && startDate > dateTo) return false;
      }
      if (!q) return true;
      return (
        String(r.request_number || "").toLowerCase().includes(q) ||
        String(r.customer_name || "").toLowerCase().includes(q) ||
        String(r.product_name || "").toLowerCase().includes(q)
      );
    });
  }, [list, statusFilter, deptFilter, query, dateFrom, dateTo]);

  const hasActiveFilters = Boolean(statusFilter || deptFilter || query || dateFrom || dateTo);
  const clearAllFilters = () => {
    setStatusFilter("");
    setDeptFilter("");
    setQuery("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <section className="card no-title-underline min-w-0 overflow-hidden p-0 shadow-lg ring-1 ring-slate-200/80 dark:ring-white/10">
      <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white">
        <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="it-ticket-board-header min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">All Requests</h2>
              <p className="mt-0.5 text-xs text-white/75">Every NPD request and where it currently stands.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatPill label="Total" value={counts.all} accent="bg-white/15 ring-1 ring-white/20" />
              <StatPill label="In progress" value={counts.in_progress} accent="bg-amber-300 text-amber-950" />
              <StatPill label="Waiting on approval" value={counts.waiting_approval} accent="bg-sky-300 text-sky-950" />
              <StatPill label="Done" value={counts.completed} accent="bg-emerald-300 text-emerald-950" />
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/15 pt-3 sm:grid-cols-2 sm:[&>*:last-child]:justify-self-end">
            <FilterGroup label="Status">
              {STATUS_TABS.map((tab) => {
                const count = tab.key ? counts[tab.key] ?? 0 : counts.all;
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key || "all"}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setStatusFilter(tab.key)}
                    className={["rounded px-2 py-1 text-[11px] font-semibold transition", isActive ? TAB_ACTIVE : TAB_IDLE].join(" ")}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </FilterGroup>

            <FilterGroup label="Department" align="end">
              <button
                type="button"
                role="tab"
                aria-selected={!deptFilter}
                onClick={() => setDeptFilter("")}
                className={["rounded px-2 py-1 text-[11px] font-semibold transition", !deptFilter ? TAB_ACTIVE : TAB_IDLE].join(" ")}
              >
                All ({deptCounts.all})
              </button>
              {NPD_DEPARTMENT_FILTERS.map((dept) => {
                const isActive = deptFilter === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setDeptFilter(dept)}
                    className={["rounded px-2 py-1 text-[11px] font-semibold transition", isActive ? TAB_ACTIVE : TAB_IDLE].join(" ")}
                  >
                    {dept} ({deptCounts[dept] ?? 0})
                  </button>
                );
              })}
            </FilterGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-white/5">
        <input
          className={`${FIELD} w-64 max-w-full`}
          placeholder="Search request #, customer, product…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          From
          <input type="date" className={FIELD} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          To
          <input type="date" className={FIELD} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-auto text-sm font-semibold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 px-6 py-16">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
          <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading requests…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-5 my-12 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-base font-semibold text-slate-800 dark:text-white">
            {hasActiveFilters ? "Nothing in this filter" : "No requests yet"}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {hasActiveFilters ? "Try another status, department, or search term." : "Start one with “+ New Request” above."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Mobile card list (< md) ─────────────────────────────────── */}
          <div className="md:hidden divide-y divide-slate-200/80 dark:divide-white/10">
            {filtered.map((r, rowIdx) => {
              const stepDef = npdStepDef(r.current_step);
              return (
                <div key={r.id} className={`${bodyColBg("product", rowIdx)} px-3 py-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/npd/requests/${r.id}`} className="font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
                      {r.request_number}
                    </Link>
                    <span className={`${BADGE} ${npdRequestStatusBadgeClass(r.status)}`}>
                      {NPD_REQUEST_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-900 dark:text-white">{r.product_name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{r.customer_name}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className={`${BADGE} ${STEP_BADGE}`}>
                      Step {r.current_step}/13: {stepDef?.name || "—"}
                    </span>
                    <span className={`${BADGE} ${DEPT_BADGE}`}>{npdStepOwnerLabel(stepDef)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <RequesterCell name={r.created_by_name} />
                    <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{formatDate(r.created_at)}</span>
                  </div>
                  <div className="mt-2">
                    <RowActions request={r} deletingId={deletingId} onDelete={onDelete} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop / tablet table (md and above) ───────────────────── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse border border-slate-200 text-xs dark:border-slate-600/50">
              <thead className="sticky top-0 z-10 border-b-2 border-slate-300 backdrop-blur-sm dark:border-slate-600">
                <tr>
                  <th className={thClass("id", "w-[8%]")}>Request #</th>
                  <th className={thClass("requester", "w-[12%]")}>Created by</th>
                  <th className={thClass("product", "w-[18%]")}>Product / Customer</th>
                  <th className={thClass("status", "w-[10%]")}>Status</th>
                  <th className={thClass("step", "w-[16%]")}>Step</th>
                  <th className={thClass("department", "hidden lg:table-cell w-[10%]")}>Department</th>
                  <th className={thClass("start", "hidden lg:table-cell w-[8%]")}>Start date</th>
                  <th className={thClass("end", "w-[8%]")}>End date</th>
                  <th className={thClass("actions", "text-center w-[10%]", true)}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                {filtered.map((r, rowIdx) => {
                  const stepDef = npdStepDef(r.current_step);
                  return (
                    <tr key={r.id} className="group border-b border-slate-200/80 transition-colors dark:border-slate-700/50">
                      <td className={tdClass("id", rowIdx)}>
                        <Link to={`/npd/requests/${r.id}`} className="font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
                          {r.request_number}
                        </Link>
                      </td>
                      <td className={tdClass("requester", rowIdx, "overflow-hidden")}>
                        <RequesterCell name={r.created_by_name} />
                      </td>
                      <td className={tdClass("product", rowIdx, "align-top")}>
                        <div className="min-w-0 overflow-hidden">
                          <div className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-900 dark:text-white" title={r.product_name}>
                            {r.product_name}
                          </div>
                          <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{r.customer_name}</div>
                        </div>
                      </td>
                      <td className={tdClass("status", rowIdx)}>
                        <span className={`${BADGE} ${npdRequestStatusBadgeClass(r.status)}`}>
                          {NPD_REQUEST_STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className={tdClass("step", rowIdx)}>
                        <span className={`${BADGE} truncate ${STEP_BADGE}`} title={stepDef?.name}>
                          {r.current_step}/13: {stepDef?.name || "—"}
                        </span>
                      </td>
                      <td className={`${tdClass("department", rowIdx)} hidden lg:table-cell`}>
                        <span className={`${BADGE} truncate ${DEPT_BADGE}`}>{npdStepOwnerLabel(stepDef)}</span>
                      </td>
                      <td className={`${tdClass("start", rowIdx)} hidden lg:table-cell`}>
                        <span className="text-[10px] font-medium text-slate-800 dark:text-slate-200">{formatDate(r.created_at)}</span>
                      </td>
                      <td className={tdClass("end", rowIdx)}>
                        <span className="text-[10px] font-medium text-slate-800 dark:text-slate-200">{formatDate(r.completed_at)}</span>
                      </td>
                      <td className={tdClass("actions", rowIdx, "", true)}>
                        <div className="flex justify-end">
                          <RowActions request={r} deletingId={deletingId} onDelete={onDelete} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
