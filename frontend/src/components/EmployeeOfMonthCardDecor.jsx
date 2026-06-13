/** Shared blue card shell + background star (home spotlight & past winners). */
export function EmployeeOfMonthBackgroundStar({ className = "" }) {
  return (
    <div
      className={`pointer-events-none absolute select-none ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" className="h-full w-full" fill="currentColor">
        <path d="M60 4l14.4 29.2 32.2 4.7-23.3 22.7 5.5 32.1L60 79.8 31.2 92.7l5.5-32.1L13.4 37.9l32.2-4.7L60 4z" />
      </svg>
    </div>
  );
}

export function EmployeeOfMonthCardShell({ children, className = "", showBackgroundStar = true }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[#0B3EAF]/15 bg-gradient-to-br from-[#eef3ff] via-[#f5f8ff] to-[#f4fbe8] shadow-sm dark:border-[#A7D344]/20 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10 ${className}`}
    >
      {showBackgroundStar ? (
        <EmployeeOfMonthBackgroundStar className="right-3 top-1/2 h-28 w-28 -translate-y-1/2 text-[#0B3EAF]/[0.14] dark:text-[#A7D344]/[0.16]" />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-[#eef3ff]/50 to-[#eef3ff]/30 dark:from-slate-900/70 dark:via-slate-900/45 dark:to-[#0B3EAF]/10" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const EMPLOYEE_OF_MONTH_FALLBACK_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0B3EAF" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#A7D344" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="28" fill="url(#g)"/>
  <circle cx="128" cy="104" r="46" fill="#fff" fill-opacity="0.22"/>
  <path d="M56 214c14-54 56-82 72-82s58 28 72 82" fill="#fff" fill-opacity="0.20"/>
</svg>`);
