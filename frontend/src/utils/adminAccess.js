function roleIsAdministrator(raw) {
  const sl = String(raw || "").trim().toLowerCase();
  return sl === "admin" || sl === "administrator" || sl === "superadmin" || sl === "super admin";
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
 * Super admin (`Admin` + no stored list) has every area; any other account needs `grantKey` in `admin_grants`.
 */
export function hasAdminGrant(user, grantKey) {
  if (!user || !grantKey) return false;
  const isAdminRole = roleIsAdministrator(user.role);
  if (!isAdminRole) {
    return Array.isArray(user.admin_grants) && user.admin_grants.includes(grantKey);
  }
  const g = user.admin_grants;
  if (g == null || (Array.isArray(g) && g.length === 0)) return true;
  return Array.isArray(g) && g.includes(grantKey);
}

