const { ROLES, canonicalRole } = require("./constants");

const ADMIN_GRANT_KEYS = Object.freeze({
  SOCIAL_COMMITTEE: "social_committee",
  ENGAGEMENT_CALENDAR: "engagement_calendar",
  UPCOMING: "upcoming",
  UPCOMING_EVENTS: "upcoming_events",
  EMPLOYEE_OF_MONTH: "employee_of_month",
  LEADERSHIP_UPDATES: "leadership_updates",
  NEW_HIRES: "new_hires",
  CUSTOMER_WINS: "customer_wins",
  COMMUNITY_INVOLVEMENT: "community_involvement",
  USERS: "users",
  LEARNING_ADMIN: "learning_admin",
  REPORTS: "reports",
  SYSTEM: "system",
  FEEDBACK_POLLS: "feedback_polls",
  COMPANY_CONTENT: "company_content",
  IT_TICKETS: "it_tickets",
  HR_NEWSFEED: "hr_newsfeed",
  ASSET_TRACKER: "asset_tracker",
});

const SPOTLIGHT_ADMIN_GRANT_KEYS = Object.freeze([
  ADMIN_GRANT_KEYS.EMPLOYEE_OF_MONTH,
  ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES,
  ADMIN_GRANT_KEYS.NEW_HIRES,
  ADMIN_GRANT_KEYS.CUSTOMER_WINS,
  ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT,
]);

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

function isFullAdminUser(reqUser) {
  if (!reqUser) return false;
  const role = canonicalRole(reqUser.role);
  if (role !== ROLES.ADMIN) return false;
  const g = reqUser.adminGrants;
  if (g == null) return true;
  if (Array.isArray(g) && g.length === 0) return true;
  return false;
}

function _grantList(reqUser) {
  const g = reqUser?.adminGrants;
  return Array.isArray(g) ? g : [];
}

function hasAdminGrant(reqUser, grantKey) {
  if (!reqUser || !grantKey) return false;
  const role = canonicalRole(reqUser.role);
  const grants = _grantList(reqUser);

  if (role === ROLES.ADMIN) {
    const g = reqUser.adminGrants;
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

function hasAnyAdminGrant(reqUser, grantKeys) {
  if (!Array.isArray(grantKeys) || grantKeys.length === 0) return false;
  return grantKeys.some((k) => hasAdminGrant(reqUser, k));
}

function normalizeGrantKeysForSave(keys) {
  const out = [];
  const seen = new Set();
  for (const raw of keys) {
    let k = String(raw || "").trim();
    if (k === ADMIN_GRANT_KEYS.UPCOMING) k = ADMIN_GRANT_KEYS.UPCOMING_EVENTS;
    if (!ALL_ADMIN_GRANT_KEYS.includes(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  out.sort();
  return out;
}

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
  const normalized = normalizeGrantKeysForSave(value);
  if (normalized.length === 0) {
    return { error: "admin_grants must include at least one valid permission key" };
  }
  for (const k of normalized) {
    if (k === ADMIN_GRANT_KEYS.UPCOMING) {
      return { error: "Use upcoming_events instead of the deprecated upcoming permission key." };
    }
  }
  return { db: JSON.stringify(normalized) };
}

async function migrateLegacyUpcomingGrantKey(db) {
  const rows = await db.prepare(
    "SELECT id, admin_grants FROM users WHERE admin_grants IS NOT NULL AND admin_grants LIKE '%upcoming%'"
  ).all();
  for (const row of rows) {
    const grants = parseAdminGrantsColumn(row.admin_grants);
    if (!Array.isArray(grants) || !grants.includes(ADMIN_GRANT_KEYS.UPCOMING)) continue;
    const next = normalizeGrantKeysForSave(grants);
    if (JSON.stringify(next) === JSON.stringify(grants)) continue;
    await db.prepare("UPDATE users SET admin_grants = ? WHERE id = ?").run(JSON.stringify(next), row.id);
  }
}

module.exports = {
  ADMIN_GRANT_KEYS,
  SPOTLIGHT_ADMIN_GRANT_KEYS,
  ALL_ADMIN_GRANT_KEYS,
  parseAdminGrantsColumn,
  isFullAdminUser,
  hasAdminGrant,
  hasAnyAdminGrant,
  normalizeGrantKeysForSave,
  sanitizeAdminGrantsPayload,
  migrateLegacyUpcomingGrantKey,
};
