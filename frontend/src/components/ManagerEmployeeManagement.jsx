import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { leaveJson, managerInboxWithTeamJson } from "../services/leaveClient";
import ProgressBar from "./ProgressBar";

const leaveStatusClass = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function ManagerEmployeeManagement() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaveActionErr, setLeaveActionErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { team, teamError } = await managerInboxWithTeamJson();
      setTeam(team);
      setError(teamError || "");
    } catch (e) {
      setError(e?.message || e?.response?.data?.message || e?.data?.message || "Failed to load team");
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateLeaveStatus = async (requestId, status) => {
    setLeaveActionErr("");
    try {
      await leaveJson(`/auth/manager-leave-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setLeaveActionErr(e?.message || "Could not update leave request");
    }
  };

  const summary = useMemo(() => {
    const n = team.length;
    const pendingLeave = team.reduce(
      (acc, emp) => acc + (emp.leave_requests || []).filter((l) => l.status === "pending").length,
      0
    );
    return { n, pendingLeave };
  }, [team]);

  return (
    <section className="card border-stone-200/90 dark:border-stone-600">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Employee management</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Direct reports, their leave requests, and course progress. Assign employees to you as manager in Admin.
          </p>
        </div>
        <Link
          to="/manager"
          className="shrink-0 text-sm font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blue-hover dark:text-brand-green"
        >
          Manager dashboard (alerts)
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading team…</p>}
      {error && <div className="rounded bg-rose-100 p-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
      {leaveActionErr && (
        <div className="mb-2 rounded bg-rose-100 p-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {leaveActionErr}
        </div>
      )}

      {!loading && !error && team.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No direct reports yet. Ask an admin to set you as each employee&apos;s manager.
        </p>
      )}

      {!loading && summary.n > 0 && (
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          {summary.n} team member{summary.n === 1 ? "" : "s"}
          {summary.pendingLeave > 0 ? ` · ${summary.pendingLeave} pending leave request(s)` : ""}
        </p>
      )}

      <div className="space-y-4">
        {team.map((emp) => {
          const assigns = emp.assignments || [];
          const leaves = emp.leave_requests || [];
          const avgProgress =
            assigns.length === 0
              ? 0
              : Math.round(assigns.reduce((s, a) => s + (a.progress ?? 0), 0) / assigns.length);

          return (
            <details
              key={emp.id}
              className="group rounded-xl border border-slate-200 bg-slate-50/80 open:bg-white dark:border-slate-600 dark:bg-slate-800/50 dark:open:bg-slate-800"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{emp.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{emp.email}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(emp.facilities || []).map((f) => (
                      <span
                        key={f}
                        className="rounded-sm bg-brand-blue-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-blue dark:bg-white/10 dark:text-brand-green"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right text-sm text-slate-600 dark:text-slate-300">
                  <div>Avg. training {avgProgress}%</div>
                  <div className="text-xs text-slate-500">
                    {assigns.length} course{assigns.length === 1 ? "" : "s"}
                  </div>
                </div>
              </summary>

              <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-600">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Leave requests
                  </h4>
                  {leaves.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">None yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {leaves.map((lr) => (
                        <li
                          key={lr.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900/40"
                        >
                          <div>
                            <span className="font-medium">
                              {lr.start_date} → {lr.end_date}
                            </span>
                            {lr.reason ? <p className="mt-0.5 text-slate-600 dark:text-slate-300">{lr.reason}</p> : null}
                            <p className="mt-1 text-xs text-slate-500">
                              {lr.created_at ? new Date(lr.created_at).toLocaleString() : ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${leaveStatusClass[lr.status] || ""}`}
                            >
                              {lr.status}
                            </span>
                            {lr.status === "pending" && (
                              <div className="flex gap-1">
                                <button type="button" className="btn-success" onClick={() => updateLeaveStatus(lr.id, "approved")}>
                                  Approve
                                </button>
                                <button type="button" className="btn-outline" onClick={() => updateLeaveStatus(lr.id, "rejected")}>
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Course progress
                  </h4>
                  {assigns.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No assigned courses.</p>
                  ) : (
                    <ul className="space-y-3">
                      {assigns.map((a) => (
                        <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{a.course_title}</div>
                            <span className="shrink-0 text-xs text-slate-500">{a.course_business_unit}</span>
                          </div>
                          <ProgressBar value={a.progress ?? 0} />
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {a.progress ?? 0}% · {a.status}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
