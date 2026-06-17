/** Portal calendar dates always use Toronto (America/Toronto). */
export const TORONTO_TZ = "America/Toronto";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthYearFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO_TZ,
  year: "numeric",
  month: "numeric",
});

/** @returns {string | null} `YYYY-MM-DD` in Toronto */
export function ymdInToronto(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = ymdFormatter.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : null;
}

export function torontoTodayYmd() {
  return ymdInToronto(new Date());
}

/** @returns {{ year: number, month0: number }} */
export function torontoYearMonth() {
  const parts = monthYearFormatter.formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const now = new Date();
    return { year: now.getFullYear(), month0: now.getMonth() };
  }
  return { year, month0: month - 1 };
}

export function compareYmd(a, b) {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatTorontoWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-CA", {
    timeZone: TORONTO_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
