import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { leaveJson } from "../services/leaveClient";

const statusClass = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function LeaveRequestPanel({ className = "", embedded = false }) {
  const { user, refreshMe } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await leaveJson("/auth/my-leave-requests", { method: "GET" });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await leaveJson("/auth/leave-request", {
        method: "POST",
        body: JSON.stringify({ start_date: startDate, end_date: endDate, reason }),
      });
      setMsg("Request sent to your manager.");
      setStartDate("");
      setEndDate("");
      setReason("");
      await refreshMe();
      load();
    } catch (e) {
      setErr(e?.message || "Could not submit");
    }
  };

  const hasManager = user?.manager_id != null && user.manager_id !== "";

  return (
    <div className={className}>
      {!embedded && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Leave requests</h2>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Submit a request so your manager can see it on their Manager dashboard.
          </p>
        </>
      )}
      {embedded && (
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Your manager sees requests on the Manager dashboard.
        </p>
      )}

      {!hasManager && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          You don&apos;t have a manager assigned yet. Ask an admin to edit your user and choose a manager; then you can
          submit leave here.
        </div>
      )}

      {hasManager && (
        <form className="agc-form mb-6 space-y-2" onSubmit={submit}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Start date</label>
              <input
                type="date"
                required
                className="w-full rounded border p-2 dark:bg-slate-700"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">End date</label>
              <input
                type="date"
                required
                className="w-full rounded border p-2 dark:bg-slate-700"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Reason (optional)</label>
            <textarea
              className="w-full rounded border p-2 dark:bg-slate-700"
              rows={3}
              placeholder="e.g. Annual leave, appointment…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {err && <div className="text-sm text-rose-600 dark:text-rose-400">{err}</div>}
          {msg && <div className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</div>}
          <button type="submit" className="btn-primary">
            Send to manager
          </button>
        </form>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Your requests</h3>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No requests yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border p-3 text-sm dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {r.start_date} → {r.end_date}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass[r.status] || ""}`}>
                  {r.status}
                </span>
              </div>
              {r.reason ? <p className="mt-1 text-slate-600 dark:text-slate-300">{r.reason}</p> : null}
              <div className="mt-1 text-xs text-slate-500">
                Manager: {r.manager_name}
                {r.created_at ? ` · Submitted ${new Date(r.created_at).toLocaleString()}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
