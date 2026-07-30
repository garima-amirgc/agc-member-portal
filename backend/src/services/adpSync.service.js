"use strict";

/**
 * ADP → DB background sync service
 * ──────────────────────────────────
 * Fetches all workers from ADP and writes their data into the users table
 * so the portal has a reliable local copy even when ADP is unavailable.
 *
 * Optional env var:
 *   ADP_SYNC_INTERVAL_HOURS  — how often to run (default: 6)
 */

const { db } = require("../config/db");
const adpSvc = require("./adp.service");

const SYNC_INTERVAL_MS = (() => {
  const hrs = parseFloat(process.env.ADP_SYNC_INTERVAL_HOURS);
  return (Number.isFinite(hrs) && hrs > 0 ? hrs : 6) * 60 * 60 * 1000;
})();

let _timer = null;

// ─── Core sync helpers ────────────────────────────────────────────────────────

/**
 * Parse an ADP ISO date string into parts without relying on the Date
 * constructor (which mishandles year 0001 in some environments).
 */
function parseAdpDate(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

/**
 * Write one mapped ADP record to the users table for a given user id.
 * Also updates birth_month/birth_day and join_month/join_day/join_year
 * so the birthday/anniversary feed stays accurate.
 */
async function writeAdpToDb(userId, mapped) {
  const now = new Date().toISOString();
  const birthParts = parseAdpDate(mapped.birth_date);
  const hireParts  = parseAdpDate(mapped.hire_date);

  await db.prepare(`
    UPDATE users SET
      adp_associate_oid     = COALESCE(?, adp_associate_oid),
      adp_worker_id         = ?,
      adp_job_title         = ?,
      adp_department        = ?,
      adp_work_phone        = ?,
      adp_work_email        = ?,
      adp_work_location     = ?,
      adp_employment_type   = ?,
      adp_employment_status = ?,
      adp_home_address      = ?,
      adp_birth_date        = ?,
      adp_hire_date         = ?,
      adp_synced_at         = ?,
      adp_reports_to_oid    = ?,
      birth_month = COALESCE(?, birth_month),
      birth_day   = COALESCE(?, birth_day),
      join_month  = COALESCE(?, join_month),
      join_day    = COALESCE(?, join_day),
      join_year   = COALESCE(?, join_year)
    WHERE id = ?
  `).run(
    mapped.associate_oid      ?? null,
    mapped.worker_id          ?? null,
    mapped.job_title          ?? null,
    mapped.department         ?? null,
    mapped.work_phone         ?? null,
    mapped.work_email         ?? null,
    mapped.work_location      ?? null,
    mapped.employment_type    ?? null,
    mapped.employment_status  ?? null,
    mapped.home_address       ?? null,
    mapped.birth_date         ?? null,
    mapped.hire_date          ?? null,
    now,
    mapped.reports_to_oid     ?? null,
    // birthday/anniversary columns — only write if ADP has them
    birthParts ? birthParts.month : null,
    birthParts ? birthParts.day   : null,
    hireParts  ? hireParts.month  : null,
    hireParts  ? hireParts.day    : null,
    hireParts  ? hireParts.year   : null,
    userId,
  );
}

/**
 * Read the ADP-cached fields from the DB for a user and return them in
 * the same shape as mapWorker() so the frontend doesn't need to know
 * whether data came live from ADP or from the local cache.
 */
function readAdpFromDb(userRow) {
  if (!userRow?.adp_synced_at) return null; // never synced
  return {
    associate_oid:     userRow.adp_associate_oid    ?? null,
    worker_id:         userRow.adp_worker_id         ?? null,
    job_title:         userRow.adp_job_title         ?? null,
    department:        userRow.adp_department        ?? null,
    work_phone:        userRow.adp_work_phone        ?? null,
    work_email:        userRow.adp_work_email        ?? null,
    work_location:     userRow.adp_work_location     ?? null,
    employment_type:   userRow.adp_employment_type   ?? null,
    employment_status: userRow.adp_employment_status ?? null,
    home_address:      userRow.adp_home_address      ?? null,
    birth_date:        userRow.adp_birth_date        ?? null,
    hire_date:         userRow.adp_hire_date         ?? null,
    from_cache:        true,
  };
}

// ─── Full background sync ─────────────────────────────────────────────────────

async function runFullSync() {
  if (!adpSvc.isConfigured()) return;

  console.log("[ADP Sync] Starting full sync…");
  const started = Date.now();

  try {
    // Pull all workers from ADP (uses the existing in-memory cache if warm)
    const workers = await adpSvc.getAllWorkers();

    // Load all portal users who have an email address
    const users = await db
      .prepare("SELECT id, email, adp_associate_oid FROM users WHERE email IS NOT NULL")
      .all();

    let matched = 0;

    for (const user of (Array.isArray(users) ? users : [])) {
      // Find this user's ADP record by email
      const email = String(user.email || "").toLowerCase().trim();
      let worker = workers.find((w) => {
        const bcEmails = w.businessCommunication?.emails || [];
        const personEmails =
          w.person?.communicationEmails ||
          w.person?.communication?.emails ||
          w.person?.communications?.emails ||
          [];
        return [...bcEmails, ...personEmails].some(
          (e) => String(e.emailUri || "").toLowerCase().trim() === email
        );
      });

      // Fall back to stored associate OID
      if (!worker && user.adp_associate_oid) {
        const target = String(user.adp_associate_oid).trim().toUpperCase();
        worker = workers.find((w) => {
          const oid = String(w.associateOID || "").trim().toUpperCase();
          const wid = String(w.workerID?.idValue || "").trim().toUpperCase();
          return oid === target || wid === target;
        });
      }

      if (!worker) continue;

      try {
        await writeAdpToDb(user.id, adpSvc.mapWorker(worker));
        matched++;
      } catch (writeErr) {
        console.error(`[ADP Sync] Failed to write user ${user.id}:`, writeErr.message);
      }
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[ADP Sync] Done — ${matched}/${users.length} users synced in ${secs}s`);

    // ── Second pass: resolve adp_reports_to_oid → manager_id ─────────────────
    // Reload users so we have fresh adp_reports_to_oid and adp_associate_oid values
    const allPortalUsers = await db
      .prepare("SELECT id, adp_associate_oid, adp_reports_to_oid FROM users WHERE adp_associate_oid IS NOT NULL")
      .all();

    // Build a lookup map: associateOID → portal user id
    const oidToUserId = new Map();
    for (const u of (Array.isArray(allPortalUsers) ? allPortalUsers : [])) {
      if (u.adp_associate_oid) {
        oidToUserId.set(String(u.adp_associate_oid).trim().toUpperCase(), u.id);
      }
    }

    let managerUpdated = 0;
    let managerSkipped = 0;

    for (const u of (Array.isArray(allPortalUsers) ? allPortalUsers : [])) {
      const reportsToOid = u.adp_reports_to_oid
        ? String(u.adp_reports_to_oid).trim().toUpperCase()
        : null;

      if (reportsToOid) {
        const managerId = oidToUserId.get(reportsToOid) ?? null;
        if (managerId) {
          // OID resolved to a portal user — update manager_id
          await db
            .prepare("UPDATE users SET manager_id = ? WHERE id = ?")
            .run(managerId, u.id);
          managerUpdated++;
        } else {
          // ADP has reportsTo data but the manager's portal account isn't linked yet
          // (email mismatch or manager not in portal) — leave manager_id untouched
          managerSkipped++;
        }
      } else {
        // ADP has no reportsTo for this person — leave manager_id completely untouched
        // so any manually assigned manager stays in place.
        managerSkipped++;
      }
    }

    console.log(`[ADP Sync] Reporting hierarchy — ${managerUpdated} set from ADP, ${managerSkipped} left as manual`);
  } catch (err) {
    console.error("[ADP Sync] Full sync failed:", err.message);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function startSync() {
  if (_timer) return; // already running

  // Run once shortly after startup, then on the configured interval
  setTimeout(() => {
    runFullSync();
    _timer = setInterval(runFullSync, SYNC_INTERVAL_MS);
  }, 30_000); // 30s delay so the server finishes booting first

  const hrs = (SYNC_INTERVAL_MS / 3_600_000).toFixed(1);
  console.log(`[ADP Sync] Scheduled every ${hrs}h (first run in 30s)`);
}

function stopSync() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startSync, stopSync, runFullSync, writeAdpToDb, readAdpFromDb };
