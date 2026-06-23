const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function portalTimezone() {
  const tz = String(process.env.PORTAL_TIMEZONE || "America/Toronto").trim();
  return tz || "America/Toronto";
}

function portalTodayParts(ref = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: portalTimezone(),
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(ref);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function utcMs(y, m, d) {
  return Date.UTC(y, m - 1, d);
}

function daysUntilMonthDay(ref, month, day) {
  const mo = Number(month);
  const da = Number(day);
  if (!Number.isFinite(mo) || !Number.isFinite(da) || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const startMs = utcMs(ref.year, ref.month, ref.day);
  let targetMs = utcMs(ref.year, mo, da);
  if (targetMs < startMs) {
    targetMs = utcMs(ref.year + 1, mo, da);
  }
  return Math.round((targetMs - startMs) / 86400000);
}

function monthDayLabel(month, day) {
  const mo = Number(month);
  const da = Number(day);
  if (!Number.isFinite(mo) || !Number.isFinite(da)) return "—";
  return `${MONTHS[mo - 1] || "?"} ${da}`;
}

function parseRangeDays(raw, fallback = 14) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 365);
}

module.exports = {
  portalTimezone,
  portalTodayParts,
  daysUntilMonthDay,
  monthDayLabel,
  parseRangeDays,
};
