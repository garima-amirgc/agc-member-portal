import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";

function roleIsAdministrator(raw) {
  const sl = String(raw || "").trim().toLowerCase();
  return sl === "admin" || sl === "administrator" || sl === "superadmin" || sl === "super admin";
}

function grantList(user) {
  return Array.isArray(user?.admin_grants) ? user.admin_grants : [];
}

export function isAdministrator(user) {
  return roleIsAdministrator(user?.role);
}

/**
 * Full administrator: Admin role and no scoped list stored (`admin_grants` null/undefined).
 * Empty array counts as “no scoped list” (matches API + avoids stale localStorage breaking saves).
 */
export function isFullAdmin(user) {
  if (!user || !roleIsAdministrator(user.role)) return false;
  const g = user.admin_grants;
  if (g == null) return true;
  if (Array.isArray(g) && g.length === 0) return true;
  return false;
}

/**
 * Same gate as the API for changing others’ `admin_grants` (full administrators only).
 * Prefer inferring from role + `admin_grants` so stale `is_full_admin: false` in localStorage
 * cannot block saves; still honor explicit `is_full_admin: true` from the server.
 */
export function canManageAdminGrants(user) {
  if (!user) return false;
  return isFullAdmin(user) || user.is_full_admin === true;
}

/**
 * Super admin (`Admin` + no stored list) has every area; granular keys only show when explicitly granted.
 * Legacy DB key `upcoming` maps to facility upcoming events only (not spotlight feeds).
 */
export function hasAdminGrant(user, grantKey) {
  if (!user || !grantKey) return false;
  const isAdminRole = roleIsAdministrator(user.role);
  const grants = grantList(user);

  if (isAdminRole) {
    const g = user.admin_grants;
    if (g == null || (Array.isArray(g) && g.length === 0)) return true;
    if (grants.includes(grantKey)) return true;
    if (
      grantKey === ADMIN_GRANT_KEYS.UPCOMING_EVENTS &&
      grants.includes(ADMIN_GRANT_KEYS.UPCOMING)
    ) {
      return true;
    }
    return false;
  }

  if (grants.includes(grantKey)) return true;
  if (grantKey === ADMIN_GRANT_KEYS.UPCOMING_EVENTS && grants.includes(ADMIN_GRANT_KEYS.UPCOMING)) {
    return true;
  }
  return false;
}

export function hasAnyAdminGrant(user, grantKeys) {
  if (!Array.isArray(grantKeys) || grantKeys.length === 0) return false;
  return grantKeys.some((k) => hasAdminGrant(user, k));
}
