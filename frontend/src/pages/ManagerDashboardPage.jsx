import { useEffect, useState } from "react";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import { leaveJson, managerInboxWithTeamJson } from "../services/leaveClient";
import { useAuth } from "../context/AuthContext";
import ManagerLeaveCalendar from "../components/ManagerLeaveCalendar";
import ManagerTeamGraph from "../components/ManagerTeamGraph";
import { friendlyErrorMessage } from "../services/friendlyError";

const leaveStatusClass = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [leaveInbox, setLeaveInbox] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [teamError, setTeamError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/notifications/me");
      setNotifications(res.data);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  };

  const loadManagerSection = async () => {
    setLeaveLoading(true);
    setTeamLoading(true);
    setLeaveError("");
    setTeamError("");
    try {
      const { inbox, team, teamError } = await managerInboxWithTeamJson();
      setLeaveInbox(inbox);
      setTeam(team);
      if (teamError) setTeamError(teamError);
    } catch (e) {
      const msg = e?.message || "Failed to load manager data";
      setLeaveError(msg);
      setTeamError(msg);
      setLeaveInbox([]);
      setTeam([]);
    } finally {
      setLeaveLoading(false);
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadManagerSection();
  }, []);

  const dismiss = async (id) => {
    try {
      await api.post(`/notifications/${id}/dismiss`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to dismiss"));
    }
  };

  const decideLeave = async (id, status) => {
    try {
      await leaveJson(`/auth/manager-leave-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadManagerSection();
    } catch (e) {
      setLeaveError(friendlyErrorMessage(e, "Could not update request"));
    }
  };

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Manager dashboard</h1>
      </section>

      {teamLoading && <div className="card p-4 text-sm text-slate-500">Loading team…</div>}
      {teamError && <div className="rounded bg-rose-100 p-2 text-sm text-rose-700">{teamError}</div>}
      {!teamLoading && !teamError && <ManagerTeamGraph managerName={user?.name} team={team} />}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Leave requests</h2>
          {leaveLoading && <div className="text-sm text-slate-500">Loading leave requests…</div>}
          {leaveError && <div className="rounded bg-rose-100 p-2 text-sm text-rose-700">{leaveError}</div>}
          {!leaveLoading && !leaveError && leaveInbox.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No leave requests yet.</p>
          )}
          {!leaveLoading && leaveInbox.length > 0 && (
            <ul className="space-y-3">
              {leaveInbox.map((r) => (
                <li key={r.id} className="rounded-xl border p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.employee_name}</div>
                      <div className="text-xs text-slate-500">{r.employee_email}</div>
                      <div className="mt-2 text-sm">
                        {r.start_date} → {r.end_date}
                      </div>
                      {r.reason ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.reason}</p> : null}
                      <div className="mt-1 text-xs text-slate-500">
                        {r.created_at ? `Submitted ${new Date(r.created_at).toLocaleString()}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${leaveStatusClass[r.status] || ""}`}
                      >
                        {r.status}
                      </span>
                      {r.status === "pending" && (
                        <div className="flex gap-2">
                          <button type="button" className="btn-success" onClick={() => decideLeave(r.id, "approved")}>
                            Approve
                          </button>
                          <button type="button" className="btn-outline" onClick={() => decideLeave(r.id, "rejected")}>
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0">
          {teamLoading && <div className="card p-4 text-sm text-slate-500">Loading leave calendar…</div>}
          {!teamLoading && teamError && (
            <div className="card text-sm text-slate-600 dark:text-slate-300">
              Team data could not be loaded; the leave calendar is unavailable.
            </div>
          )}
          {!teamLoading && !teamError && <ManagerLeaveCalendar team={team} />}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Course completions</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Persistent until dismissed.</p>
      </section>

      {loading && <div className="card p-4">Loading notifications...</div>}
      {error && <div className="rounded bg-rose-100 p-2 text-rose-700">{error}</div>}

      {!loading && !error && notifications.length === 0 && (
        <section className="card border-dashed text-slate-600 dark:text-slate-400">
          <p>No active notifications.</p>
        </section>
      )}

      {!loading && !error && notifications.length > 0 && (
        <section className="space-y-3">
          {notifications.map((n) => (
            <div key={n.id} className="card flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">{n.employee_name} completed</div>
                <div className="mt-1 font-semibold">{n.course_name || n.course_title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </div>
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={() => dismiss(n.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
