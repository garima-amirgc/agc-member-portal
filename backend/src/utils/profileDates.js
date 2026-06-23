function normalizeBirthMonthDay(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
  const mo = Math.floor(m);
  const da = Math.floor(d);
  if (mo < 1 || mo > 12) return null;
  if (da < 1 || da > 31) return null;
  const dt = new Date(Date.UTC(2024, mo - 1, da));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;
  return { birth_month: mo, birth_day: da };
}

function normalizeJoinDate(month, day, year) {
  const parts = normalizeBirthMonthDay(month, day);
  if (!parts) return null;
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  const yr = Math.floor(y);
  const maxYear = new Date().getFullYear();
  if (yr < 1950 || yr > maxYear) return null;
  return {
    join_month: parts.birth_month,
    join_day: parts.birth_day,
    join_year: yr,
  };
}

function anniversaryYearsEmployed(joinYear, ref = new Date()) {
  const y = Number(joinYear);
  if (!Number.isFinite(y)) return null;
  const yrs = ref.getFullYear() - y;
  return yrs >= 1 ? yrs : null;
}

module.exports = {
  normalizeBirthMonthDay,
  normalizeJoinDate,
  anniversaryYearsEmployed,
};
