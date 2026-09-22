// Shared formatting + color helpers for the Team Time Off board. Kept in
// one place so the summary cards, table, calendar, and drawer all agree
// on what a given leave type looks like.

// Recognizable leave types get a fixed, meaningful color; anything else
// (whatever else a company's ADP policies are named) falls back to a
// deterministic hash so it's still consistent, just not hand-picked.
const KEYWORD_COLORS = [
  [/vacation/i, "blue"],
  [/sick/i, "rose"],
  [/stat/i, "amber"],
  [/family/i, "violet"],
  [/bereave/i, "slate"],
  [/loa|leave of absence/i, "orange"],
  [/personal/i, "sky"],
  [/holiday/i, "amber"],
];

const COLOR_CLASSES = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};
const FALLBACK_ORDER = ["blue", "emerald", "amber", "violet", "rose", "sky", "orange"];

const DOT_CLASSES = {
  blue: "bg-blue-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
  orange: "bg-orange-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
};

function colorKeyFor(label) {
  const s = String(label || "");
  for (const [re, color] of KEYWORD_COLORS) {
    if (re.test(s)) return color;
  }
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACK_ORDER[hash % FALLBACK_ORDER.length];
}

export function badgeClassFor(label) {
  return COLOR_CLASSES[colorKeyFor(label)];
}

export function dotClassFor(label) {
  return DOT_CLASSES[colorKeyFor(label)];
}

export function fmtDays(n) {
  // Accepts a real number or a numeric string — the production crash this
  // guarded against was a Postgres NUMERIC column coming back as a string
  // ("5.5" instead of 5.5), which made `n.toFixed(1)` throw and crash the
  // whole Team page. The root cause is now fixed at the DB layer (see
  // postgres.js's NUMERIC type parser), but this stays defensive so any
  // other stray non-number here degrades to "—" instead of crashing again.
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "—";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateRange(start, end) {
  if (!start) return "—";
  if (!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function ymd(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymd(dt);
}

export function todayIso() {
  return ymd(new Date());
}
