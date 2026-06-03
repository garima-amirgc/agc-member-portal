import { FACILITY_CODES } from "../constants/facilities";

export function isFacilityUniversityOnlyPortal(user) {
  if (!user) return false;
  const f = user.facility_university_only;
  if (!(f === true || f === 1 || f === "1")) return false;
  const role = String(user.role || "").trim();
  if (role === "Admin") return false;
  if (user.is_full_admin) return false;
  if (Array.isArray(user.admin_grants) && user.admin_grants.length > 0) return false;
  return true;
}

/** Facility landing route for training hub (uses /users/me `facilities` when present). */
export function getFacilityUniversityHomePath(user) {
  if (!user) return "/facilities/AGC";
  const facs = Array.isArray(user.facilities)
    ? user.facilities.map((x) => String(x || "").toUpperCase())
    : [];
  const known = facs.filter((x) => FACILITY_CODES.includes(x));
  if (known.length === 1) return `/facilities/${known[0]}`;
  const bu = String(user.business_unit || "AGC").toUpperCase();
  if (FACILITY_CODES.includes(bu)) return `/facilities/${bu}`;
  return "/facilities/AGC";
}

export function postAuthLandingPath(user) {
  if (isFacilityUniversityOnlyPortal(user)) return getFacilityUniversityHomePath(user);
  return "/";
}

export function isPathAllowedForFacilityUniversityOnly(pathname) {
  const p = String(pathname || "").split("?")[0] || "";
  if (p === "/facilities" || p === "/facilities/") return false;
  if (p.startsWith("/facilities/")) return true;
  if (p.startsWith("/course/")) return true;
  if (p === "/it-tickets" || p.startsWith("/it-tickets/")) return true;
  if (p === "/help" || p.startsWith("/help/")) return true;
  return false;
}
