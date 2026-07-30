const { db } = require("../config/db");

const USER_ROW = "SELECT id, name, email, role, business_unit, manager_id, adp_reports_to_oid, adp_job_title, designation, profile_image_url FROM users WHERE id = ?";

// In-memory cache: userId → { data, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function invalidateHierarchyCache(userId) {
  if (userId != null) _cache.delete(userId);
  else _cache.clear();
}

/** Deduplicate rows by normalised email — keeps the first occurrence. */
function dedupeByEmail(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const key = String(r.email || "").toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapNode(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    business_unit: row.business_unit,
    adp_job_title: row.adp_job_title ?? null,
    designation: row.designation ?? null,
    profile_image_url: row.profile_image_url ?? null,
    // "adp" when ADP provided the reporting line; "manual" when set by an admin
    manager_source: row.adp_reports_to_oid ? "adp" : "manual",
  };
}

async function buildReportingHierarchy(userId) {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && now < cached.expiresAt) return cached.data;
  const chainUp = [];
  let id = userId;
  const seen = new Set();

  while (id != null && id !== undefined && !seen.has(id)) {
    seen.add(id);
    const row = await db.prepare(USER_ROW).get(id);
    if (!row) break;
    chainUp.push(mapNode(row));
    id = row.manager_id;
  }

  const chain = chainUp.reverse();

  const directRows = await db
    .prepare(
      `SELECT id, name, email, role, business_unit, adp_reports_to_oid, adp_job_title, designation, profile_image_url FROM users WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC`
    )
    .all(userId);

  const ancestorIds = new Set(chain.slice(0, -1).map((n) => n.id));

  const directFiltered = dedupeByEmail(
    directRows.filter((r) => r.id !== userId && !ancestorIds.has(r.id))
  );

  // Fetch all second-level reports in one query instead of N individual queries
  const directIds = directFiltered.map((r) => r.id);
  let allSubs = [];
  if (directIds.length > 0) {
    const placeholders = directIds.map(() => "?").join(",");
    allSubs = await db
      .prepare(
        `SELECT id, name, email, role, business_unit, adp_reports_to_oid, adp_job_title, designation, profile_image_url, manager_id FROM users WHERE manager_id IN (${placeholders}) ORDER BY name COLLATE NOCASE ASC`
      )
      .all(...directIds);
  }
  const subsByManagerId = new Map();
  for (const s of allSubs) {
    const arr = subsByManagerId.get(s.manager_id) || [];
    arr.push(s);
    subsByManagerId.set(s.manager_id, arr);
  }

  const direct_reports = directFiltered.map((r) => ({
    ...mapNode(r),
    direct_reports: dedupeByEmail(subsByManagerId.get(r.id) || []).map(mapNode),
  }));

  const me = await db.prepare(USER_ROW).get(userId);
  let team_under_manager = null;

  if (me) {
    if (me.manager_id != null) {
      const mgr = await db.prepare(USER_ROW).get(me.manager_id);
      if (mgr) {
        const teamRows = await db
          .prepare(
            `SELECT id, name, email, role, business_unit, adp_reports_to_oid, adp_job_title, designation, profile_image_url FROM users WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC`
          )
          .all(Number(mgr.id));
        const members = dedupeByEmail(
          teamRows.filter((r) => r.id !== mgr.id && !ancestorIds.has(r.id))
        ).map(mapNode);
        team_under_manager = {
          manager: mapNode(mgr),
          members,
          viewer_is_manager_node: false,
        };
      }
    } else if (direct_reports.length > 0) {
      team_under_manager = {
        manager: mapNode(me),
        members: direct_reports.map((r) => ({ ...r })),
        viewer_is_manager_node: true,
      };
    }
  }

  const result = { chain, direct_reports, team_under_manager };
  _cache.set(userId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

module.exports = { buildReportingHierarchy, invalidateHierarchyCache };
