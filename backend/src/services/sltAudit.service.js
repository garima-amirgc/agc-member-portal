const { db } = require("../config/db");

/**
 * SLT Tracker v2 — shared audit-trail helper.
 *
 * Every SLT entity type (action, decision_queue, decision_register,
 * commitment, calendar) writes its field-level change history into the one
 * shared slt_audit_log table (see config/database/{sqlite,postgres}.js),
 * rather than each service inventing its own history table. This module is
 * the only thing that reads or writes slt_audit_log + slt_links directly;
 * the per-entity services (sltActions/sltDecisions/sltCommitments/
 * sltCalendar) call logAudit()/logFieldChanges() after every create/update
 * so "who changed what, and when" is always available, and call
 * listLinksFor()/createLink() when they want to relate one SLT record to
 * another outside of a dedicated foreign key (e.g. Decision Register's own
 * parent_decision_id column, which does NOT go through this table).
 */

const ENTITY_TYPES = ["action", "decision_queue", "decision_register", "commitment", "calendar"];

function isValidEntityType(t) {
  return ENTITY_TYPES.includes(t);
}

// Records one audit-log row. Never throws into the caller — an audit-log
// failure should never roll back or crash the actual data change it's
// describing, so this logs to the console and swallows the error.
async function logAudit({ entityType, entityId, action, fieldName = null, oldValue = null, newValue = null, userId = null }) {
  if (!isValidEntityType(entityType) || !entityId || !action) return;
  try {
    await db
      .prepare(
        `INSERT INTO slt_audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entityType,
        Number(entityId),
        action,
        fieldName,
        oldValue == null ? null : String(oldValue),
        newValue == null ? null : String(newValue),
        userId || null
      );
  } catch (e) {
    console.error("[sltAudit] failed to record audit entry", e);
  }
}

// Compares `before` and `after` plain objects across `fields` and logs one
// slt_audit_log "update" row per field that actually changed. Used by every
// SLT update() function so a plain field edit — not just a status change —
// leaves a trail, without each service re-implementing the diff.
async function logFieldChanges({ entityType, entityId, before, after, fields, userId }) {
  for (const f of fields) {
    const oldV = before ? before[f] : undefined;
    const newV = after ? after[f] : undefined;
    const oldS = oldV == null ? "" : String(oldV);
    const newS = newV == null ? "" : String(newV);
    if (oldS === newS) continue;
    await logAudit({ entityType, entityId, action: "update", fieldName: f, oldValue: oldV, newValue: newV, userId });
  }
}

async function getAuditTrail(entityType, entityId) {
  if (!isValidEntityType(entityType) || !entityId) return [];
  const rows = await db
    .prepare(
      `SELECT a.id, a.entity_type, a.entity_id, a.action, a.field_name, a.old_value, a.new_value,
              a.changed_by, a.changed_at, u.name AS changed_by_name
       FROM slt_audit_log a
       LEFT JOIN users u ON u.id = a.changed_by
       WHERE a.entity_type = ? AND a.entity_id = ?
       ORDER BY a.changed_at DESC, a.id DESC`
    )
    .all(entityType, Number(entityId));
  return rows || [];
}

// slt_links — a generic many-to-many relationship between any two SLT
// records (e.g. "this Action was spawned from this Decision"). Decision
// Register's link back to its originating Decision Queue item is NOT stored
// here — it has its own dedicated parent_decision_id column, because that
// relationship is 1:1 and load-bearing for the rebuild's "never infer a
// parent decision from a similar title" rule. This table is for everything
// looser than that.
async function listLinksFor(entityType, entityId) {
  if (!isValidEntityType(entityType) || !entityId) return [];
  const rows = await db
    .prepare(
      `SELECT * FROM slt_links
       WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)
       ORDER BY created_at DESC`
    )
    .all(entityType, Number(entityId), entityType, Number(entityId));
  return rows || [];
}

async function createLink(userId, { fromType, fromId, toType, toId }) {
  if (!isValidEntityType(fromType) || !isValidEntityType(toType) || !fromId || !toId) {
    const e = new Error("Invalid link.");
    e.statusCode = 400;
    throw e;
  }
  const existing = await db
    .prepare(`SELECT id FROM slt_links WHERE from_type = ? AND from_id = ? AND to_type = ? AND to_id = ?`)
    .get(fromType, Number(fromId), toType, Number(toId));
  if (existing) return existing;
  const result = await db
    .prepare(`INSERT INTO slt_links (from_type, from_id, to_type, to_id, created_by) VALUES (?, ?, ?, ?, ?)`)
    .run(fromType, Number(fromId), toType, Number(toId), userId || null);
  return { id: result.lastInsertRowid };
}

async function deleteLink(id) {
  await db.prepare(`DELETE FROM slt_links WHERE id = ?`).run(Number(id));
  return { ok: true };
}

module.exports = {
  ENTITY_TYPES,
  isValidEntityType,
  logAudit,
  logFieldChanges,
  getAuditTrail,
  listLinksFor,
  createLink,
  deleteLink,
};
