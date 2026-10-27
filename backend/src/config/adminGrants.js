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
  NPD: "npd",
  SHAREPOINT: "sharepoint",
  CFO: "cfo",
  INCIDENT_REPORT_VIEW: "incident_report_view",
  INCIDENT_REPORT_EDIT: "incident_report_edit",
  SLT_VIEW: "slt_view",
  SLT_EDIT: "slt_edit",
});

// Some grants are implied by a broader one a user already holds, so a single
// grant key doesn't need to be re-added everywhere it overlaps with an
// existing area. Edit access always implies view access — someone who can
// add/update records can obviously see them too.
//
// CFO used to also imply full SLT Report (view + edit) access, from back
// when CFO was the only way to reach the SLT Tracker. Once the SLT Report
// checkboxes existed as their own grant, that meant SLT access could come
// from two different places in the Admin grant screen (checking CFO, or
// checking SLT Report directly), which read as confusing/duplicated —
// reported as "why we have SLT under CFO and SLT Report? keep it under SLT
// Report." Removed per that explicit request: CFO now only implies Incident
// Report access; SLT Report (view/edit) has to be granted explicitly via its
// own checkboxes. This takes effect immediately for every live request (the
// implication is evaluated on each permission check, not just at save time)
// — anyone who currently holds only the CFO grant, without SLT Report
// checked, will lose Master Calendar access the moment this deploys. Go
// check Manage Users for anyone with CFO checked who still needs the
// calendar, and check SLT Report (view, or view & add) for them explicitly.
const GRANT_IMPLIED_BY = Object.freeze({
  [ADMIN_GRANT_KEYS.UPCOMING_EVENTS]: [ADMIN_GRANT_KEYS.UPCOMING],
  [ADMIN_GRANT_KEYS.INCIDENT_REPORT_VIEW]: [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT],
  [ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT]: [ADMIN_GRANT_KEYS.CFO],
  [ADMIN_GRANT_KEYS.SLT_VIEW]: [ADMIN_GRANT_KEYS.SLT_EDIT],
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

function _grantSatisfies(grants, grantKey) {
  if (grants.includes(grantKey)) return true;
  const impliedBy = GRANT_IMPLIED_BY[grantKey];
  if (impliedBy && impliedBy.some((k) => grants.includes(k))) return true;
  return false;
}

function hasAdminGrant(reqUser, grantKey) {
  if (!reqUser || !grantKey) return false;
  const role = canonicalRole(reqUser.role);
  const grants = _grantList(reqUser);

  if (role === ROLES.ADMIN) {
    const g = reqUser.adminGrants;
    if (g == null || (Array.isArray(g) && g.length === 0)) return true;
    return _grantSatisfies(grants, grantKey);
  }

  return _grantSatisfies(grants, grantKey);
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

// Master Calendar delegated-edit access (SLT Tracker v2). A full admin can,
// from the Manage Users screen, give a user the ability to edit/delete
// Master Calendar events that other specific users created — e.g. an EA who
// edits the calendar "on behalf of" the executives who actually raise the
// events. Stored the same way admin_grants is: a nullable JSON array TEXT
// column on users, this time of other users' numeric ids rather than grant
// key strings.
function parseCalendarEditDelegatesColumn(raw) {
  if (raw == null || raw === "") return [];
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    return parseCalendarEditDelegatesColumn(raw.toString("utf8"));
  }
  if (Array.isArray(raw)) return _sanitizeUserIds(raw);
  if (typeof raw === "object") return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return _sanitizeUserIds(arr);
  } catch {
    return [];
  }
}

function _sanitizeUserIds(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const n = Number(x);
    if (!Number.isFinite(n) || n < 1) continue;
    const k = Math.trunc(n);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

// Returns { db } (a JSON string or null to clear) or { error }. `selfId`
// excludes a user from being able to delegate to themselves.
function sanitizeCalendarEditDelegatesPayload(value, { selfId } = {}) {
  if (value == null) return { db: null };
  if (!Array.isArray(value)) {
    return { error: "calendar_edit_delegates must be null or an array of user ids" };
  }
  const cleaned = _sanitizeUserIds(value).filter((id) => selfId == null || id !== Number(selfId));
  return { db: cleaned.length ? JSON.stringify(cleaned) : null };
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
  parseCalendarEditDelegatesColumn,
  sanitizeCalendarEditDelegatesPayload,
};
