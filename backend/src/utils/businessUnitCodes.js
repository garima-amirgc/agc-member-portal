const { BUSINESS_UNITS } = require("../config/constants");

function normalizeBusinessUnitCode(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "";
  if (BUSINESS_UNITS.includes(s)) return s;
  for (const bu of BUSINESS_UNITS) {
    if (s.includes(bu)) return bu;
  }
  return "";
}

/**
 * Union of `user_facilities` rows and the user's primary `business_unit`, in stable portal order.
 * @param {{ business_unit?: string }[]} facRows
 * @param {string | null | undefined} primaryBusinessUnit
 */
function mergeFacilityAccess(facRows, primaryBusinessUnit) {
  const set = new Set();
  for (const r of facRows || []) {
    const bu = normalizeBusinessUnitCode(r?.business_unit);
    if (bu) set.add(bu);
  }
  const primary = normalizeBusinessUnitCode(primaryBusinessUnit);
  if (primary) set.add(primary);
  return BUSINESS_UNITS.filter((u) => set.has(u));
}

module.exports = { normalizeBusinessUnitCode, mergeFacilityAccess };
