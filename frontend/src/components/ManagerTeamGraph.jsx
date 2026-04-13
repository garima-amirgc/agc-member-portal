import ProgressBar from "./ProgressBar";

/**
 * Simple org-style graph: manager node on top, direct reports below with training progress.
 */
export default function ManagerTeamGraph({ managerName, team }) {
  const list = Array.isArray(team) ? team : [];

  return (
    <div className="card overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold">Team overview</h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Your direct reports and average course progress (graph view).
      </p>

      <div className="flex min-w-[280px] flex-col items-center pb-2">
        {/* Manager node */}
        <div className="relative z-10 rounded-portal border-2 border-brand-blue bg-brand-blue-soft px-8 py-4 text-center shadow-brand dark:border-brand-blue/70 dark:bg-white/10">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-blue dark:text-brand-green">
            Manager
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{managerName || "You"}</div>
        </div>

        {list.length > 0 && (
          <>
            {/* Vertical connector */}
            <div className="h-6 w-0.5 shrink-0 bg-gradient-to-b from-brand-blue to-stone-300 dark:from-brand-green dark:to-stone-600" />
            {/* Horizontal bar */}
            <div className="h-0.5 w-full max-w-2xl shrink-0 bg-slate-300 dark:bg-slate-600" />
            {/* Ticks down to each employee */}
            <div className="flex w-full max-w-4xl flex-wrap justify-center gap-0 px-2">
              {list.map((emp) => (
                <div key={emp.id} className="flex flex-col items-center" style={{ flex: "1 1 140px", maxWidth: 200 }}>
                  <div className="h-4 w-0.5 bg-slate-300 dark:bg-slate-600" />
                  <div className="w-full rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm dark:border-slate-600 dark:bg-slate-800/80">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{emp.name}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{emp.email}</div>
                    {(() => {
                      const assigns = emp.assignments || [];
                      const avg =
                        assigns.length === 0
                          ? 0
                          : Math.round(assigns.reduce((s, a) => s + (a.progress ?? 0), 0) / assigns.length);
                      return (
                        <>
                          <div className="mt-2 text-[10px] font-medium uppercase text-slate-500">Training</div>
                          <div className="mt-1 px-1">
                            <ProgressBar value={avg} />
                          </div>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{avg}% avg</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {list.length === 0 && (
          <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            No direct reports yet. Ask an admin to assign employees to you as their manager.
          </p>
        )}
      </div>
    </div>
  );
}
