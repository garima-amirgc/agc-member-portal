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

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

function ProgressBar({ used, available }) {
  const total = (used ?? 0) + (available ?? 0);
  const pct = total > 0 ? Math.round(((used ?? 0) / total) * 100) : null;
  const barColor =
    pct == null
      ? "bg-slate-300 dark:bg-slate-600"
      : pct >= 90
      ? "bg-rose-500"
      : pct >= 70
      ? "bg-amber-500"
      : "bg-[#0B3EAF] dark:bg-[#A7D344]";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {pct == null ? "—" : `${pct}% used`}
      </span>
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
    <div className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-slate-200/70 dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-[rgba(11,62,175,0.06)] via-[rgba(11,62,175,0.02)] to-transparent px-5 py-4 dark:border-white/10 dark:from-[rgba(167,211,68,0.07)] dark:via-transparent">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Team vacation summary</h3>
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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
        <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No employees match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                <th className="px-5 py-3">Employee</th>
                <th className="px-4 py-3">Entitlement</th>
                <th className="px-4 py-3">Carried over</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Next time off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {sorted.map((e, idx) => {
                const v = e.vacation_balance;
                return (
                  <tr
                    key={e.id}
                    className={`group transition hover:bg-[rgba(11,62,175,0.04)] dark:hover:bg-white/[0.04] ${
                      idx % 2 === 1 ? "bg-slate-50/60 dark:bg-white/[0.02]" : ""
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0B3EAF] to-[#1a5fd4] text-[11px] font-bold text-white shadow-sm">
                          {initials(e.name)}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee(e.id)}
                            className="font-semibold text-[#0B3EAF] transition hover:underline dark:text-[#A7D344]"
                          >
                            {e.name}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {e.is_away_today ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                                Away today
                              </span>
                            ) : null}
                            {!e.adp_linked ? (
                              <span className="text-[11px] text-slate-400">Not linked to ADP</span>
                            ) : e.balances_authorized === false ? (
                              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                ADP access pending
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-700 dark:text-slate-200">{fmtDays(v?.entitlement)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-700 dark:text-slate-200">{fmtDays(v?.carried_over)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-700 dark:text-slate-200">{fmtDays(v?.used)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-700 dark:text-slate-200">{fmtDays(v?.scheduled)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{fmtDays(v?.available)}</span>
                        {v ? <ProgressBar used={v.used} available={v.available} /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
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
