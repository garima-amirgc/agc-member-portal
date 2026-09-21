import { useMemo, useState } from "react";
import { fmtDays, fmtDate } from "./timeOffShared";

const SORTS = {
  name: { label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
  most_used: {
    label: "Most vacation used",
    cmp: (a, b) => (b.vacation_balance?.used ?? -1) - (a.vacation_balance?.used ?? -1),
  },
  lowest_remaining: {
    label: "Lowest remaining",
    cmp: (a, b) => {
      const av = a.vacation_balance?.available;
      const bv = b.vacation_balance?.available;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    },
  },
  next_upcoming: {
    label: "Next upcoming absence",
    cmp: (a, b) => {
      const ad = a.next_time_off?.start_date;
      const bd = b.next_time_off?.start_date;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    },
  },
};

function ProgressBar({ used, available }) {
  const total = (used ?? 0) + (available ?? 0);
  const pct = total > 0 ? Math.round(((used ?? 0) / total) * 100) : null;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{pct == null ? "—" : `${pct}% used`}</span>
    </div>
  );
}

export default function VacationTable({ employees, onSelectEmployee }) {
  const [sortKey, setSortKey] = useState("name");

  const sorted = useMemo(() => {
    const cmp = SORTS[sortKey]?.cmp || SORTS.name.cmp;
    return [...employees].sort(cmp);
  }, [employees, sortKey]);

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-white">Team vacation summary</h3>
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No employees match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Entitlement</th>
                <th className="px-4 py-2 font-medium">Carried over</th>
                <th className="px-4 py-2 font-medium">Used</th>
                <th className="px-4 py-2 font-medium">Scheduled</th>
                <th className="px-4 py-2 font-medium">Available</th>
                <th className="px-4 py-2 font-medium">Next time off</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const v = e.vacation_balance;
                return (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(e.id)}
                        className="font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
                      >
                        {e.name}
                      </button>
                      {e.is_away_today ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                          Away today
                        </span>
                      ) : null}
                      {!e.adp_linked ? (
                        <div className="text-xs text-slate-400">Not linked to ADP</div>
                      ) : e.balances_authorized === false ? (
                        <div className="text-xs text-amber-600 dark:text-amber-400">ADP access pending</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{fmtDays(v?.entitlement)}</td>
                    <td className="px-4 py-3">{fmtDays(v?.carried_over)}</td>
                    <td className="px-4 py-3">{fmtDays(v?.used)}</td>
                    <td className="px-4 py-3">{fmtDays(v?.scheduled)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fmtDays(v?.available)}</span>
                        {v ? <ProgressBar used={v.used} available={v.available} /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {e.next_time_off ? (
                        <span>
                          {fmtDate(e.next_time_off.start_date)}
                          {e.next_time_off.end_date && e.next_time_off.end_date !== e.next_time_off.start_date
                            ? ` – ${fmtDate(e.next_time_off.end_date)}`
                            : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
