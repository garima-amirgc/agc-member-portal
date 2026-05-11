const { ROLES } = require("../config/constants");
const { parseAdminGrantsColumn } = require("../config/adminGrants");

function parseFacilityUniversityOnlyFlag(raw, roleNorm) {
  if (roleNorm === ROLES.ADMIN) return false;
  if (raw === true || raw === 1 || raw === "1") return true;
  if (typeof raw === "string" && raw.toLowerCase() === "true") return true;
  return false;
}

/**
 * @param {{ flag: boolean, roleNorm: string, businessUnits: string[], adminGrantsDb: string | null | undefined }} opts
 */
function validateFacilityUniversityOnlyForUser(opts) {
  const { flag, roleNorm, businessUnits, adminGrantsDb } = opts;
  if (!flag) return { ok: true, flag: false };
  if (roleNorm === ROLES.ADMIN) return { ok: true, flag: false };
  if (!Array.isArray(businessUnits) || businessUnits.length !== 1) {
    return {
      ok: false,
      message: "Restrict to facility University only works when the user has exactly one site (facility).",
    };
  }
  const parsed = parseAdminGrantsColumn(adminGrantsDb);
  if (parsed && parsed.length > 0) {
    return {
      ok: false,
      message: "University-only accounts cannot have administration area access. Clear those checkboxes first.",
    };
  }
  return { ok: true, flag: true };
}

module.exports = { parseFacilityUniversityOnlyFlag, validateFacilityUniversityOnlyForUser };
