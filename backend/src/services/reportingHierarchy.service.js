const { db } = require("../config/db");

const USER_ROW = "SELECT id, name, email, role, business_unit, manager_id FROM users WHERE id = ?";

/**
 * Reporting line from org root down to this user, plus their direct reports (if any).
 * @param {number} userId
 * @returns {Promise<{ chain: object[], direct_reports: object[], team_under_manager: object|null }>}
 */
async function buildReportingHierarchy(userId) {
  const chainUp = [];
  let id = userId;
  const seen = new Set();

  while (id != null && id !== undefined && !seen.has(id)) {
    seen.add(id);
    const row = await db.prepare(USER_ROW).get(id);
    if (!row) break;
    chainUp.push({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      business_unit: row.business_unit,
    });
    id = row.manager_id;
  }

  const chain = chainUp.reverse();

  const directRows = await db
    .prepare(
      `SELECT id, name, email, role, business_unit FROM users WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC`
    )
    .all(userId);

  const ancestorIds = new Set(chain.slice(0, -1).map((n) => n.id));

  const direct_reports = directRows
    .filter((r) => r.id !== userId && !ancestorIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      business_unit: r.business_unit,
    }));

  const me = await db.prepare(USER_ROW).get(userId);
  let team_under_manager = null;

  if (me) {
    if (me.manager_id != null) {
      const mgr = await db.prepare(USER_ROW).get(me.manager_id);
      if (mgr) {
        const teamRows = await db
          .prepare(
            `SELECT id, name, email, role, business_unit FROM users WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC`
          )
          .all(mgr.id);
        const members = teamRows
          .filter((r) => r.id !== mgr.id && !ancestorIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            business_unit: r.business_unit,
          }));
        team_under_manager = {
          manager: {
            id: mgr.id,
            name: mgr.name,
            email: mgr.email,
            role: mgr.role,
            business_unit: mgr.business_unit,
          },
          members,
          viewer_is_manager_node: false,
        };
      }
    } else if (direct_reports.length > 0) {
      team_under_manager = {
        manager: {
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role,
          business_unit: me.business_unit,
        },
        members: direct_reports.map((r) => ({ ...r })),
        viewer_is_manager_node: true,
      };
    }
  }

  return { chain, direct_reports, team_under_manager };
}

module.exports = { buildReportingHierarchy };
