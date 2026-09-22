import { fmtDays } from "./timeOffShared";

// Same 5 stats as before, just given a distinct accent color each so the
// row reads at a glance instead of five identical white boxes — mirrors the
// colored-pill treatment used on the IT Ticket board's header stats.
const ACCENTS = {
  slate: "bg-white ring-1 ring-slate-200/80 dark:bg-[#141414] dark:ring-white/10",
  rose: "bg-rose-50 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-900/40",
  amber: "bg-amber-50 ring-1 ring-amber-200/70 dark:bg-amber-950/15 dark:ring-amber-900/40",
  sky: "bg-sky-50 ring-1 ring-sky-200/70 dark:bg-sky-950/15 dark:ring-sky-900/40",
  emerald: "bg-emerald-50 ring-1 ring-emerald-200/70 dark:bg-emerald-950/15 dark:ring-emerald-900/40",
};
const VALUE_COLORS = {
  slate: "text-slate-900 dark:text-white",
  rose: "text-rose-700 dark:text-rose-300",
  amber: "text-amber-700 dark:text-amber-300",
  sky: "text-[#0B3EAF] dark:text-sky-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
};
const LABEL_COLORS = {
  slate: "text-slate-500 dark:text-slate-400",
  rose: "text-rose-600/80 dark:text-rose-300/70",
  amber: "text-amber-700/80 dark:text-amber-300/70",
  sky: "text-[#0B3EAF]/70 dark:text-sky-300/70",
  emerald: "text-emerald-700/80 dark:text-emerald-300/70",
};

function StatCard({ label, value, accent = "slate" }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        ACCENTS[accent] || ACCENTS.slate
      }`}
    >
      <div className={`text-2xl font-extrabold leading-tight tabular-nums ${VALUE_COLORS[accent] || VALUE_COLORS.slate}`}>
        {value}
      </div>
      <div className={`mt-1 text-[11px] font-bold uppercase tracking-wide ${LABEL_COLORS[accent] || LABEL_COLORS.slate}`}>
        {label}
      </div>
    </div>
  );
}

export default function SummaryCards({ summary }) {
  const s = summary || {};
  const hasVacationTotals = s.vacation_used_ytd != null || s.vacation_remaining != null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Team size" value={s.team_size ?? 0} accent="slate" />
      <StatCard label="Away today" value={s.away_today ?? 0} accent="rose" />
      <StatCard label="Upcoming" value={s.upcoming ?? 0} accent="amber" />
      <StatCard
        label="Vacation used"
        value={hasVacationTotals ? `${fmtDays(s.vacation_used_ytd)} days` : "—"}
        accent="sky"
      />
      <StatCard
        label="Vacation remaining"
        value={hasVacationTotals ? `${fmtDays(s.vacation_remaining)} days` : "—"}
        accent="emerald"
      />
    </div>
  );
}
