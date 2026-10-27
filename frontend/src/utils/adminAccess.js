import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";

function roleIsAdministrator(raw) {
  const sl = String(raw || "").trim().toLowerCase();
  return sl === "admin" || sl === "administrator" || sl === "superadmin" || sl === "super admin";
}

function grantList(user) {
  return Array.isArray(user?.admin_grants) ? user.admin_grants : [];
}

// Mirrors backend/src/config/adminGrants.js GRANT_IMPLIED_BY — keep these in
// sync. CFO continues to imply full (view + edit) Incident Report and SLT
// Report access since it covered both before those grants existed; edit
// access always implies view access.
const GRANT_IMPLIED_BY = {
  [ADMIN_GRANT_KEYS.UPCOMING_EVENTS]: [ADMIN_GRANT_KEYS.UPCOMING],
  [ADMIN_GRANT_KEYS.INCIDENT_REPORT_VIEW]: [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT],
  [ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT]: [ADMIN_GRANT_KEYS.CFO],
  [ADMIN_GRANT_KEYS.SLT_VIEW]: [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_EDIT],
  [ADMIN_GRANT_KEYS.SLT_EDIT]: [ADMIN_GRANT_KEYS.CFO],
};

function grantSatisfies(grants, grantKey) {
  if (grants.includes(grantKey)) return true;
  const impliedBy = GRANT_IMPLIED_BY[grantKey];
  if (impliedBy && impliedBy.some((k) => grants.includes(k))) return true;
  return false;
}

export function isAdministrator(user) {
  return roleIsAdministrator(user?.role);
}

export function isFullAdmin(user) {
  if (!user || !roleIsAdministrator(user.role)) return false;
  const g = user.admin_grants;
  if (g == null) return true;
  if (Array.isArray(g) && g.length === 0) return true;
  return false;
}

export function canManageAdminGrants(user) {
  if (!user) return false;
  return isFullAdmin(user) || user.is_full_admin === true;
}

export function hasAdminGrant(user, grantKey) {
  if (!user || !grantKey) return false;
  const isAdminRole = roleIsAdministrator(user.role);
  const grants = grantList(user);

  if (isAdminRole) {
    const g = user.admin_grants;
    if (g == null || (Array.isArray(g) && g.length === 0)) return true;
    return grantSatisfies(grants, grantKey);
  }

  return grantSatisfies(grants, grantKey);
}

export function hasAnyAdminGrant(user, grantKeys) {
  if (!Array.isArray(grantKeys) || grantKeys.length === 0) return false;
  return grantKeys.some((k) => hasAdminGrant(user, k));
}

// New Product Development is a restricted-access module: visible only to
// full admins, users granted ADMIN_GRANT_KEYS.NPD, or users explicitly
// added to the access allowlist (reflected on the user object as
// npd_access, set by GET /users/me).
export function hasNpdAccess(user) {
  if (!user) return false;
  if (hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD)) return true;
  return user.npd_access === true;
}
