import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import {
  NPD_REQUEST_STATUS_LABELS,
  npdRequestStatusBadgeClass,
} from "../constants/npd";

const FIELD =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/20";

function IconSearch({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconClipboard({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h6" />
    </svg>
  );
}

function IconRefresh({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4.5 10a8 8 0 0114-5.3L20 7M19.5 14a8 8 0 01-14 5.3L4 17" />
    </svg>
  );
}

function IconClock({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCheckCircle({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconTrash({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 4v8m4-8v8M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7" />
    </svg>
  );
}

function IconInbox({ className = "h-10 w-10" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 3h6l2-3h4M5 12L3 7.2A1 1 0 013.94 6h16.12a1 1 0 01.94 1.2L19 12m-14 0v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  );
}

function initialsFromName(name) {
  const source = String(name || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "?";
}

const STAT_FILTERS = [
  { key: "", label: "All requests", icon: IconClipboard },
  { key: "in_progress", label: "In progress", icon: IconRefresh },
  { key: "waiting_approval", label: "Waiting on approval", icon: IconClock },
  { key: "completed", label: "Completed", icon: IconCheckCircle },
];

export default function NpdDashboardPage() {
  const { user } = useAuth();
  const isAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);

  const [requests, setRequests] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [myApprovals, setMyApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [reqRes, tasksRes, approvalsRes] = await Promise.all([
        api.get("/npd/requests"),
        api.get("/npd/my-tasks"),
        api.get("/npd/my-approvals"),
      ]);
      setRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
      setMyTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
      setMyApprovals(Array.isArray(approvalsRes.data) ? approvalsRes.data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const deleteRequest = async (r) => {
    if (!window.confirm(`Are you sure you want to delete ${r.request_number}? It will be removed from this list.`)) return;
    setError("");
    setDeletingId(r.id);
    try {
      await api.delete(`/npd/requests/${r.id}`);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      window.dispatchEvent(new Event("agc-npd-changed"));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete that request."));
    } finally {
      setDeletingId(null);
    }
  };

  const statCounts = useMemo(() => {
    const counts = { "": requests.length, in_progress: 0, waiting_approval: 0, completed: 0 };
    for (const r of requests) {
      if (r.status === "in_progress") counts.in_progress += 1;
      else if (r.status === "waiting_approval") counts.waiting_approval += 1;
      else if (r.status === "completed") counts.completed += 1;
    }
    return counts;
  }, [requests]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (dateFrom || dateTo) {
        // Filter on the start date (created_at) — compare the YYYY-MM-DD
        // prefix directly so it lines up with the <input type="date"> value.
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
  }, [requests, filterStatus, query, dateFrom, dateTo]);

  const hasActiveFilters = Boolean(filterStatus || query || dateFrom || dateTo);
  const clearAllFilters = () => {
    setFilterStatus("");
    setQuery("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="New Product Development"
          subtitle="Track new-product and customer-modification requests from request to first shipment."
        />
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link to="/npd/admin" className="btn-outline">
              Manage access &amp; approvers
            </Link>
          ) : null}
          <Link to="/npd/new" className="btn-primary">
            + New Request
          </Link>
        </div>
      </div>

      {/* Stat cards — click a card to filter the table below */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STAT_FILTERS.map(({ key, label, icon: Icon }) => {
          const active = filterStatus === key;
          return (
            <button
              key={key || "all"}
              type="button"
              onClick={() => setFilterStatus(active && key !== "" ? "" : key)}
              className={[
                "card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5",
                active ? "ring-2 ring-[#0B3EAF] dark:ring-[#A7D344]" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                  "bg-[rgba(11,62,175,0.08)] text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]",
                ].join(" ")}
              >
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold leading-none text-[#000000] dark:text-white">
                  {statCounts[key] ?? 0}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {(myTasks.length > 0 || myApprovals.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {myTasks.length > 0 ? (
            <section className="card no-title-underline overflow-hidden border-l-4 border-l-[#0B3EAF] p-0 dark:border-l-[#A7D344]">
              <div className="flex items-center gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(11,62,175,0.08)] text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
                  <IconClipboard className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-semibold text-[#000000] dark:text-white">My tasks</h2>
                <span className="ml-auto rounded-full bg-[#0B3EAF] px-2.5 py-0.5 text-xs font-bold text-white dark:bg-[#A7D344] dark:text-[#0B3EAF]">
                  {myTasks.length}
                </span>
              </div>
              <ul className="space-y-2 p-4 sm:p-6">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/npd/requests/${t.request_id}`}
                      className="block rounded-xl border border-slate-200 p-3 text-sm transition hover:border-[#0B3EAF] hover:bg-[rgba(11,62,175,0.03)] dark:border-slate-800 dark:hover:border-[#A7D344] dark:hover:bg-[rgba(167,211,68,0.05)]"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100">{t.request_number}</span> —{" "}
                      {t.product_name} ({t.customer_name})
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">Step {t.step_number}: {t.step_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {myApprovals.length > 0 ? (
            <section className="card no-title-underline overflow-hidden border-l-4 border-l-[#A7D344] p-0">
              <div className="flex items-center gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(167,211,68,0.18)] text-[#5c7a1c] dark:bg-[rgba(167,211,68,0.15)] dark:text-[#A7D344]">
                  <IconCheckCircle className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Waiting for my approval</h2>
                <span className="ml-auto rounded-full bg-[#A7D344] px-2.5 py-0.5 text-xs font-bold text-[#1a3d00]">
                  {myApprovals.length}
                </span>
              </div>
              <ul className="space-y-2 p-4 sm:p-6">
                {myApprovals.map((t) => (
                  <li key={`${t.id}-${t.confirmation_area || ""}`}>
                    <Link
                      to={`/npd/requests/${t.request_id}`}
                      className="block rounded-xl border border-slate-200 p-3 text-sm transition hover:border-[#0B3EAF] hover:bg-[rgba(11,62,175,0.03)] dark:border-slate-800 dark:hover:border-[#A7D344] dark:hover:bg-[rgba(167,211,68,0.05)]"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100">{t.request_number}</span> —{" "}
                      {t.product_name} ({t.customer_name})
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Step {t.step_number}: {t.step_name}
                        {t.confirmation_area ? ` (${t.confirmation_area})` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <section className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-[rgba(11,62,175,0.08)] dark:ring-[rgba(167,211,68,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#082d82]/20 bg-gradient-to-r from-[rgba(167,211,68,0.35)] via-[rgba(167,211,68,0.2)] to-[rgba(11,62,175,0.08)] px-6 py-5 sm:px-8 sm:py-6 dark:from-[rgba(167,211,68,0.12)] dark:via-[rgba(11,62,175,0.2)] dark:to-transparent">
          <div>
            <h2 className="text-xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">All requests</h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Showing {filtered.length} of {requests.length} request{requests.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {error ? (
            <div className="mb-4 rounded-xl border-2 border-[#E02B20]/40 bg-red-50 px-4 py-3 text-sm font-medium text-[#E02B20] dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-white/5">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${FIELD} w-64 max-w-full pl-9`}
                placeholder="Search request #, customer, product…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select className={FIELD} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(NPD_REQUEST_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
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
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-14 text-center dark:border-slate-800">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(11,62,175,0.06)] text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.1)] dark:text-[#A7D344]">
                <IconInbox />
              </span>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {requests.length === 0 ? "No requests yet." : "No requests match your filters."}
              </p>
              {requests.length === 0 ? (
                <Link to="/npd/new" className="btn-primary">
                  + New Request
                </Link>
              ) : (
                <button type="button" onClick={clearAllFilters} className="btn-outline">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-white/5 dark:text-[#A7D344]">
                    <th className="py-3 pl-4 pr-4">Request #</th>
                    <th className="py-3 pr-4">Product</th>
                    <th className="py-3 pr-4">Customer</th>
                    <th className="py-3 pr-4">Step</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Start date</th>
                    <th className="py-3 pr-4">End date</th>
                    <th className="py-3 pr-4">Created by</th>
                    <th className="py-3 pr-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-[rgba(11,62,175,0.04)] dark:hover:bg-[rgba(167,211,68,0.05)]"
                    >
                      <td className="py-3 pl-4 pr-4">
                        <Link to={`/npd/requests/${r.id}`} className="font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
                          {r.request_number}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-700 dark:text-slate-200">{r.product_name}</td>
                      <td className="py-3 pr-4 text-slate-700 dark:text-slate-200">{r.customer_name}</td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {r.current_step} / 13
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${npdRequestStatusBadgeClass(r.status)}`}>
                          {NPD_REQUEST_STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                        {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(11,62,175,0.1)] text-[10px] font-bold text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.15)] dark:text-[#A7D344]">
                            {initialsFromName(r.created_by_name)}
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">{r.created_by_name || "—"}</span>
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          type="button"
                          onClick={() => deleteRequest(r)}
                          disabled={deletingId === r.id}
                          title={`Delete ${r.request_number}`}
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#E02B20]/40 px-3 py-1.5 text-xs font-semibold text-[#c4241a] transition hover:border-[#E02B20] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          {deletingId === r.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
