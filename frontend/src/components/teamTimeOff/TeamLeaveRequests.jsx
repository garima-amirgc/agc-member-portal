import { useMemo, useState } from "react";
import api from "../../services/api";
import { friendlyErrorMessage } from "../../services/friendlyError";
import ManagerLeaveCalendar from "../ManagerLeaveCalendar";

// Requests submitted directly through the portal (LeaveRequestPanel, on the
// employee's Profile page). This is intentionally separate from the
// ADP-synced TeamTimeOffBoard above it: ADP's API only ever returns
// time off that's already been approved, so it can never show the moment
// someone applies. This panel is the "who has applied" view — it reads
// straight off `leave_requests`, independent of the ADP sync, and nothing
// here is written back to ADP.
function pendingFromTeam(team) {
  const out = [];
  for (const emp of team || []) {
    for (const lr of emp.leave_requests || []) {
      if (lr.status !== "pending") continue;
      out.push({ ...lr, employee_id: emp.id, employee_name: emp.name });
    }
  }
  return out.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export default function TeamLeaveRequests({ team, onDecided, loading = false }) {
  const [decidingId, setDecidingId] = useState(null);
  const [error, setError] = useState("");

  const pending = useMemo(() => pendingFromTeam(team), [team]);

  const decide = async (id, status) => {
    setError("");
    setDecidingId(id);
    try {
      await api.patch(`/leave-requests/${id}`, { status });
      if (onDecided) await onDecided();
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not update this request."));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Vacation requests</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Submitted directly through the portal, so requests show up here the moment someone applies — before
          they're approved. This is separate from the ADP-synced board above.
        </p>
      </div>

      {error ? (
        <div className="rounded bg-rose-100 p-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">No pending requests right now.</div>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{r.employee_name}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {r.start_date} → {r.end_date}
                </div>
                {r.reason ? <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.reason}</div> : null}
                {r.created_at ? (
                  <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Applied {new Date(r.created_at).toLocaleString()}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={decidingId === r.id}
                  onClick={() => decide(r.id, "approved")}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={decidingId === r.id}
                  onClick={() => decide(r.id, "rejected")}
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ManagerLeaveCalendar team={team} />
    </section>
  );
}
