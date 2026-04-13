export const FACILITY_CODES = ["AGC", "AQM", "SCF", "ASP"];

/** @param {string | undefined} param */
export function normalizeFacilityParam(param) {
  const u = String(param || "").toUpperCase();
  return FACILITY_CODES.includes(u) ? u : null;
}
