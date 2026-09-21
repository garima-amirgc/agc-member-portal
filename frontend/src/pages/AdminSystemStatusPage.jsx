import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "U";
}

function Stat({ label, value }) {
  return (
    <div className="rounded-portal border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/20">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtHours(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(1) : "—";
}

export default function AdminSystemStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topVisitors, setTopVisitors] = useState([]);
  const [topVisitorsLoading, setTopVisitorsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/admin/metrics")
      .then((r) => setData(r.data))
      .catch((e) => setError(friendlyErrorMessage(e, "Could not load system status.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runSyncNow = () => {
    setSyncing(true);
    setSyncMessage("");
    api
      .post("/admin/sync-time-off")
      .then((r) => {
        const result = r.data?.result;
        if (result?.skipped) {
          setSyncMessage(
            result.reason === "already running"
              ? "A sync was already running in the background — showing its result once it finishes."
              : "Nothing to sync — ADP isn't configured on this server."
          );
        } else if (result) {
          setSyncMessage(
            `Synced ${result.synced}/${result.total} employees` +
              (result.failed ? `, ${result.failed} failed` : "") +
              "."
          );
        }
        load();
      })
      .catch((e) => setSyncMessage(friendlyErrorMessage(e, "Sync failed — check the server logs.")))
      .finally(() => setSyncing(false));
  };

  useEffect(() => {
    setTopVisitorsLoading(true);
    api
      .get("/reports/admin/top-portal-visitors", { params: { days: 7, limit: 50 } })
      .then((r) => {
        const payload = r.data;
        const list = Array.isArray(payload?.visitors) ? payload.visitors : Array.isArray(payload) ? payload : [];
        setTopVisitors(list);
      })
      .catch(() => setTopVisitors([]))
      .finally(() => setTopVisitorsLoading(false));
  }, []);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="System status" subtitle="Admin-only health and quick metrics." />
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Overview</div>
            <button type="button" className="btn-outline" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-portal border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : data ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="API" value={data.ok ? "OK" : "Unknown"} />
              <Stat label="DB" value={data.database?.ok ? `OK (${data.database.kind})` : "Error"} />
              <Stat label="DB latency" value={data.database?.latency_ms != null ? `${data.database.latency_ms} ms` : "—"} />
              <Stat label="Uptime" value={data.server?.uptime_s != null ? `${data.server.uptime_s}s` : "—"} />
              <Stat label="Users" value={String(data.counts?.users ?? "—")} />
              <Stat label="Reports" value={String(data.counts?.reports ?? "—")} />
              <Stat label="Report access rows" value={String(data.counts?.report_access_rows ?? "—")} />
              <Stat label="Courses" value={String(data.counts?.courses ?? "—")} />
              <Stat label="Assignments" value={String(data.counts?.assignments ?? "—")} />
              <Stat label="IT tickets" value={String(data.counts?.tickets ?? "—")} />
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">No data.</div>
          )}
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">ADP time off sync</div>
            <div className="flex items-center gap-3">
              {data?.adp_time_off?.synced_at ? (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Last synced {fmtDateTime(data.adp_time_off.synced_at)}
                </span>
              ) : (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  Time off hasn't synced from ADP yet — this runs automatically shortly after the server starts.
                </span>
              )}
              <button
                type="button"
                className="btn-outline"
                onClick={runSyncNow}
                disabled={syncing || !data?.adp_time_off?.configured}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
          </div>
          {syncMessage ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{syncMessage}</p> : null}

          {!loading && data && !data.adp_time_off?.configured ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              ADP isn't configured on this server, so there's nothing to sync yet.
            </div>
          ) : !loading && data ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Employees linked to ADP" value={String(data.adp_time_off?.linked_employees ?? "—")} />
                <Stat label="Balance rows synced" value={String(data.adp_time_off?.balance_rows ?? "—")} />
                <Stat label="Request rows synced" value={String(data.adp_time_off?.request_rows ?? "—")} />
                <Stat
                  label="Last sync result"
                  value={
                    data.adp_time_off?.last_sync
                      ? `${data.adp_time_off.last_sync.synced}/${data.adp_time_off.last_sync.total} synced`
                      : "No sync yet"
                  }
                />
              </div>

              {data.adp_time_off?.last_sync ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Stat label="Balances not authorized" value={String(data.adp_time_off.last_sync.balancesUnauthorized ?? 0)} />
                  <Stat label="Requests not authorized" value={String(data.adp_time_off.last_sync.requestsUnauthorized ?? 0)} />
                  <Stat label="Failed" value={String(data.adp_time_off.last_sync.failed ?? 0)} />
                </div>
              ) : null}

              {data.adp_time_off?.sync_window ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Synced window: {data.adp_time_off.sync_window.from} to {data.adp_time_off.sync_window.to}
                </p>
              ) : null}

              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Real balances from ADP (most recently synced, up to 10)
                </div>
                {(data.adp_time_off?.sample_balances || []).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    No balance rows have synced yet — either no employees have an ADP time-off policy on record,
                    or a sync hasn't run yet.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="py-1 pr-4">Employee</th>
                          <th className="py-1 pr-4">Policy</th>
                          <th className="py-1 pr-4">Entitlement</th>
                          <th className="py-1 pr-4">Carried over</th>
                          <th className="py-1 pr-4">Used</th>
                          <th className="py-1 pr-4">Scheduled</th>
                          <th className="py-1 pr-4">Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.adp_time_off.sample_balances.map((row, idx) => (
                          <tr key={idx} className="border-t border-slate-200/70 dark:border-slate-700">
                            <td className="py-1.5 pr-4 font-medium text-slate-900 dark:text-white">{row.employee_name || "—"}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{row.policy_name || "—"}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{fmtHours(row.entitlement)}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{fmtHours(row.carried_over)}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{fmtHours(row.used)}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{fmtHours(row.scheduled)}</td>
                            <td className="py-1.5 pr-4 text-slate-600 dark:text-slate-300">{fmtHours(row.available)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          )}
        </div>

        <div className="card relative overflow-hidden rounded-2xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Top portal visitors
            </h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Last 7 days</span>
          </div>

          <div className="mt-3 space-y-2">
            {topVisitorsLoading ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
            ) : topVisitors.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No home visits in the last 7 days yet.
              </p>
            ) : (
              topVisitors.map((u, idx) => {
                const img = u.profile_image_url ? resolvePublicMediaUrl(u.profile_image_url) : "";
                return (
                  <div
                    key={u.id || idx}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 ring-1 ring-[#0B3EAF]/15 dark:bg-white/10 dark:ring-white/15">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                            {initialsFromName(u.name)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{u.name || "—"}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email || ""}</div>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#0B3EAF]/10 px-3 py-1.5 dark:bg-white/10">
                      <span className="text-sm font-extrabold text-[#0B3EAF] dark:text-[#A7D344]">{Number(u.visit_count) || 0}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">visits</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
    </main>
  );
}

