import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { managerInboxWithTeamJson } from "../services/leaveClient";
import ProgressBar from "./ProgressBar";
import { friendlyErrorMessage } from "../services/friendlyError";

export default function ManagerEmployeeManagement({
  team: teamProp,
  loading: loadingProp,
  error: errorProp,
  onReload,
}) {
  const [teamLocal, setTeamLocal] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [errorLocal, setErrorLocal] = useState("");

  const managed = teamProp !== undefined;
  const team = managed ? (Array.isArray(teamProp) ? teamProp : []) : teamLocal;
  const loading = managed ? Boolean(loadingProp) : loadingLocal;
  const error = managed ? errorProp || "" : errorLocal;

  const load = useCallback(async () => {
    if (managed) {
      if (onReload) await onReload();
      return;
    }
    setLoadingLocal(true);
    setErrorLocal("");
    try {
      const { team: teamData, teamError } = await managerInboxWithTeamJson();
      setTeamLocal(Array.isArray(teamData) ? teamData : []);
      setErrorLocal(teamError || "");
    } catch (e) {
      setErrorLocal(friendlyErrorMessage(e, "Failed to load team"));
      setTeamLocal([]);
    } finally {
      setLoadingLocal(false);
    }
  }, [managed, onReload]);

  useEffect(() => {
    if (managed) return;
    load();
  }, [managed, load]);

  const summary = useMemo(() => ({ n: team.length }), [team]);

  return (
    <section className="card border-stone-200/90 dark:border-stone-600">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Team learning details</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Direct reports and university course progress.
          </p>
        </div>
        <Link
          to="/manager"
          className="shrink-0 text-sm font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blue-hover dark:text-brand-green"
        >
          Team dashboard (alerts)
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading team…</p>}
      {error && <div className="rounded bg-rose-100 p-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

      {!loading && !error && team.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No direct reports yet. Ask an admin to set you as each employee&apos;s manager.
        </p>
      )}

      {!loading && summary.n > 0 && (
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          {summary.n} team member{summary.n === 1 ? "" : "s"}
        </p>
      )}

      <div className="space-y-4">
        {team.map((emp) => {
          const assigns = emp.assignments || [];
          const summary = emp.training_summary;
          const avgProgress =
            summary?.avgProgress ??
            (assigns.length === 0
              ? 0
              : Math.round(assigns.reduce((s, a) => s + (a.progress ?? 0), 0) / assigns.length));
          const allComplete = summary?.allComplete;
          const completedCount = summary?.completed ?? assigns.filter((a) => a.status === "completed").length;
          const totalCount = summary?.total ?? assigns.length;

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
                  <div className="flex items-center justify-end gap-2">
                    <span>Avg. training {avgProgress}%</span>
                    {allComplete ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        All complete
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {completedCount}/{totalCount} training item{totalCount === 1 ? "" : "s"} done
                  </div>
                </div>
              </summary>

              <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-600">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    University courses
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
