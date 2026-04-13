function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Node({ name, title, subtitle }) {
  return (
    <div className="flex min-w-0 w-full max-w-full items-start gap-2 rounded-xl border border-sky-200/80 bg-sky-50 px-2 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-200/60 text-[9px] font-bold text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
          {name}
        </div>
        <div className="mt-0.5 text-[10px] leading-snug text-slate-600 dark:text-slate-300">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

export default function OrgChart() {
  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="relative w-full max-w-full rounded-2xl border bg-slate-50 p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-900/30">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold">Office of the CEO & CFO</div>
            <div className="mt-0.5 text-[10px] leading-snug text-slate-600 dark:text-slate-300">
              Dummy org chart (designed in code). Names/titles can be replaced with real data later.
            </div>
          </div>
        </div>

        <div className="relative w-full min-w-0">
          {/* CEO */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[200px]">
              <Node name="Tony Aziz" title="Chief Executive Officer" subtitle="CEO" />
            </div>
            <div className="h-3 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Direct reports (3 columns) */}
          <div className="relative mt-1 w-full min-w-0">
            <div className="absolute left-[8%] right-[8%] top-0 h-px bg-slate-300 dark:bg-slate-600" />

            <div className="grid w-full min-w-0 grid-cols-3 gap-1.5 pt-4 sm:gap-2 md:gap-3">
              <div className="flex min-w-0 flex-col items-center gap-2">
                <div className="h-3 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
                <Node name="Sherry Aziz" title="Chief Finance Officer" subtitle="CFO" />
                <Node name="David Schloesser" title="VP Finance" />
              </div>

              <div className="flex min-w-0 flex-col items-center gap-2">
                <div className="h-3 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
                <Node name="Sandra Williams" title="Executive Assistant" />
                <Node name="Tatiana Bairydost" title="Plant Manager" subtitle="AQM" />
                <Node name="Carol Maia" title="FSQA Manager" subtitle="AQM" />
              </div>

              <div className="flex min-w-0 flex-col items-center gap-2">
                <div className="h-3 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
                <Node name="Adam Aziz" title="Director of Operations" />
                <Node name="Tom Helliotis" title="Chief Commercial Officer" />
                <Node name="Gene Massa" title="Director of Human Resources" subtitle="AGC" />
              </div>
            </div>
          </div>

          {/* Facility managers row */}
          <div className="mt-6 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2">
            <div className="min-w-0 rounded-xl border bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                AGC (selected)
              </div>
              <div className="flex flex-col gap-1.5">
                <Node name="Martin Thangaraj" title="Group Maintenance Manager" subtitle="AGC" />
              </div>
            </div>

            <div className="min-w-0 rounded-xl border bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                ASP (selected)
              </div>
              <div className="flex flex-col gap-1.5">
                <Node name="Tallib Deen" title="Maintenance Manager" subtitle="ASP" />
                <Node name="Richard Wark" title="Production Manager" subtitle="ASP" />
              </div>
            </div>

            <div className="min-w-0 rounded-xl border bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                AQM & ASP (selected)
              </div>
              <div className="flex flex-col gap-1.5">
                <Node name="Montasser Abdelkodouss" title="Operations Manager" subtitle="AQM & ASP" />
                <Node name="Colin Frost" title="Project Manager" subtitle="ASP" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
