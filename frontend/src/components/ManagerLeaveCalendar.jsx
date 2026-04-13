const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** @param {string} d - YYYY-MM-DD */
function whoOnLeave(team, d) {
  const out = [];
  for (const emp of team || []) {
    for (const lr of emp.leave_requests || []) {
      if (lr.status === "rejected") continue;
      if (d >= lr.start_date && d <= lr.end_date) {
        out.push({ name: emp.name, status: lr.status });
        break;
      }
    }
  }
  return out;
}

function buildCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const startPad = first.getDay();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push({ kind: "pad" });
  for (let day = 1; day <= lastDay; day++) {
    cells.push({ kind: "day", day, ymd: ymd(year, monthIndex, day) });
  }
  return cells;
}

export default function ManagerLeaveCalendar({ team }) {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const title = now.toLocaleString("default", { month: "long", year: "numeric" });
  const cells = buildCells(year, monthIndex);
  const list = Array.isArray(team) ? team : [];

  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold">Leave calendar</h2>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        {title} — shows who is on leave each day (pending and approved). Rejected requests are hidden.
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-[280px]">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            {WEEK.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (c.kind === "pad") {
                return <div key={`p-${i}`} className="min-h-[72px] rounded-lg bg-transparent" />;
              }
              const people = whoOnLeave(list, c.ymd);
              const isToday = c.ymd === ymd(now.getFullYear(), now.getMonth(), now.getDate());
              return (
                <div
                  key={c.ymd}
                  className={[
                    "flex min-h-[72px] flex-col rounded-lg border p-1 text-left text-[10px] leading-tight",
                    people.length > 0
                      ? "border-brand-blue/40 bg-brand-blue-soft dark:border-brand-blue/40 dark:bg-white/10"
                      : "border-slate-100 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30",
                    isToday ? "ring-2 ring-[#86BC25] ring-offset-1 dark:ring-offset-slate-900" : "",
                  ].join(" ")}
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{c.day}</span>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {people.map((p, j) => (
                      <span
                        key={`${c.ymd}-${j}`}
                        className={
                          p.status === "approved"
                            ? "truncate text-emerald-800 dark:text-emerald-200"
                            : "truncate text-amber-800 dark:text-amber-200"
                        }
                        title={`${p.name} (${p.status})`}
                      >
                        {p.name}
                        {p.status === "pending" ? " ·?" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" /> Approved leave
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /> Pending (ends with ?)
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded border-2 border-[#86BC25]" /> Today
        </span>
      </div>
    </div>
  );
}
