const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

export default function FilterBar({ filters, options, onChange }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={filters.query}
        onChange={set("query")}
        placeholder="Search employee…"
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      />

      <select value={filters.department} onChange={set("department")} className={selectClass}>
        <option value="">All departments</option>
        {(options.departments || []).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select value={filters.location} onChange={set("location")} className={selectClass}>
        <option value="">All locations</option>
        {(options.locations || []).map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      <select value={filters.leaveType} onChange={set("leaveType")} className={selectClass}>
        <option value="">All leave types</option>
        {(options.leaveTypes || []).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select value={filters.year} onChange={set("year")} className={selectClass}>
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
