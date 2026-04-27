import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

function Stat({ label, value }) {
  return (
    <div className="rounded-portal border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/20">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function AdminSystemStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <>
      <PageHeader title="System status" subtitle="Admin-only health and quick metrics." />
      <main className={PAGE_SHELL}>
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
      </main>
    </>
  );
}

