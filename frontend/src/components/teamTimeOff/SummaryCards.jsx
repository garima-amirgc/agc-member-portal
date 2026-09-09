import { fmtDays } from "./timeOffShared";

function StatCard({ label, value }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function SummaryCards({ summary }) {
  const s = summary || {};
  const hasVacationTotals = s.vacation_used_ytd != null || s.vacation_remaining != null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Team size" value={s.team_size ?? 0} />
      <StatCard label="Away today" value={s.away_today ?? 0} />
      <StatCard label="Upcoming" value={s.upcoming ?? 0} />
      <StatCard label="Vacation used" value={hasVacationTotals ? `${fmtDays(s.vacation_used_ytd)} days` : "—"} />
      <StatCard label="Vacation remaining" value={hasVacationTotals ? `${fmtDays(s.vacation_remaining)} days` : "—"} />
    </div>
  );
}
