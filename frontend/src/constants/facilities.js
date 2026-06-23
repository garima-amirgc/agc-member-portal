export const FACILITY_CODES = ["AGC", "AQM", "SCF", "ASP"];

export function normalizeFacilityParam(param) {
  const u = String(param || "").toUpperCase();
  return FACILITY_CODES.includes(u) ? u : null;
}
