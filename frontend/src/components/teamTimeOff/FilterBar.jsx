const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// Styled to sit on the blue gradient header (see TeamTimeOffBoard) — glassy
// white fields rather than the plain slate ones used elsewhere, so they stay
// readable against the dark background.
const fieldClass =
  "rounded-lg border border-white/40 bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-white focus:ring-2 focus:ring-white/60 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-200";

export default function FilterBar({ filters, options, onChange }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        >
          <circle cx="11" cy="11" r="6" />
          <line x1="20" y1="20" x2="15.5" y2="15.5" />
        </svg>
        <input
          type="text"
          value={filters.query}
          onChange={set("query")}
          placeholder="Search employee…"
          className={`${fieldClass} pl-8`}
        />
      </div>

      <select value={filters.department} onChange={set("department")} className={fieldClass}>
        <option value="">All departments</option>
        {(options.departments || []).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select value={filters.location} onChange={set("location")} className={fieldClass}>
        <option value="">All locations</option>
        {(options.locations || []).map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      <select value={filters.leaveType} onChange={set("leaveType")} className={fieldClass}>
        <option value="">All leave types</option>
        {(options.leaveTypes || []).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select value={filters.year} onChange={set("year")} className={fieldClass}>
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
