const { ROLES, canonicalRole } = require("./constants");

/** Keys for scoped administration areas (stored in users.admin_grants as JSON array). */
const ADMIN_GRANT_KEYS = Object.freeze({
  ENGAGEMENT_CALENDAR: "engagement_calendar",
  UPCOMING: "upcoming",
  USERS: "users",
  LEARNING_ADMIN: "learning_admin",
  REPORTS: "reports",
  SYSTEM: "system",
  FEEDBACK_POLLS: "feedback_polls",
});

const ALL_ADMIN_GRANT_KEYS = Object.freeze(Object.values(ADMIN_GRANT_KEYS));

function parseAdminGrantsColumn(raw) {
  if (raw == null || raw === "") return null;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    return parseAdminGrantsColumn(raw.toString("utf8"));
  }
  if (Array.isArray(raw)) {
    const cleaned = _sanitizeGrantKeys(raw);
    return cleaned.length ? cleaned : null;
  }
  if (typeof raw === "object") return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return null;
    const cleaned = _sanitizeGrantKeys(arr);
    return cleaned.length ? cleaned : null;
  } catch {
    return null;
  }
}

function _sanitizeGrantKeys(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x || "").trim();
    if (!ALL_ADMIN_GRANT_KEYS.includes(k)) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  out.sort();
  return out;
}

/** Full administrator: Admin role and no scoped list (DB null / full access). */
function isFullAdminUser(reqUser) {
  if (!reqUser) return false;
  const role = canonicalRole(reqUser.role);
  if (role !== ROLES.ADMIN) return false;
  const g = reqUser.adminGrants;
  if (g == null) return true;
  if (Array.isArray(g) && g.length === 0) return true;
  return false;
}

/** Super-admin (Admin + no list) has every area; any other user needs the key in `adminGrants`. */
function hasAdminGrant(reqUser, grantKey) {
  if (!reqUser || !grantKey) return false;
  const role = canonicalRole(reqUser.role);
  if (role !== ROLES.ADMIN) {
    const g = reqUser.adminGrants;
    return Array.isArray(g) && g.includes(grantKey);
  }
  const g = reqUser.adminGrants;
  if (g == null || (Array.isArray(g) && g.length === 0)) return true;
  return Array.isArray(g) && g.includes(grantKey);
}

/**
 * Validate body for save. `null` => clear stored grants (or full admin when role is Admin).
 * Empty array: clears optional grants for non-admin accounts; invalid for scoped Admin accounts.
 * @param {{ targetIsAdminRole?: boolean }} [opts]
 * @returns {{ db: null|string } | { error: string } | { omit: true }}
 */
function sanitizeAdminGrantsPayload(value, opts = {}) {
  const targetIsAdminRole = opts.targetIsAdminRole === true;
  if (value === null) return { db: null };
  if (value === undefined) return { omit: true };
  if (!Array.isArray(value)) {
    return { error: "admin_grants must be null or an array of permission keys" };
  }
  if (value.length === 0) {
    if (targetIsAdminRole) {
      return {
        error:
          "Administrator accounts need at least one administration area, full access (omit field), or set grants to null for full access.",
      };
    }
    return { db: null };
  }
  const seen = new Set();
  const out = [];
  for (const x of value) {
    const k = String(x || "").trim();
    if (!ALL_ADMIN_GRANT_KEYS.includes(k)) {
      return { error: `Unknown administration permission: ${k}` };
    }
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  out.sort();
  return { db: JSON.stringify(out) };
}

module.exports = {
  ADMIN_GRANT_KEYS,
  ALL_ADMIN_GRANT_KEYS,
  parseAdminGrantsColumn,
  isFullAdminUser,
  hasAdminGrant,
  sanitizeAdminGrantsPayload,
};
