const express = require("express");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { db, isPostgres } = require("../config/db");
const adpTimeOff = require("../services/adpTimeOff.service");
const adpTimeOffSync = require("../services/adpTimeOffSync.service");

const router = express.Router();
router.use(authRequired);

async function scalar(sql) {
  try {
    const row = await db.prepare(sql).get();
    const v = row ? Object.values(row)[0] : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

router.get("/metrics", requireAdminGrant(ADMIN_GRANT_KEYS.SYSTEM), async (_req, res) => {
  const startedAt = new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString();
  let dbOk = true;
  let dbLatencyMs = null;
  try {
    const t0 = Date.now();
    await db.prepare("SELECT 1 AS ok").get();
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  // Real, company-wide ADP time-off sync data — not just one manager's
  // direct reports. Lets an admin confirm actual numbers are flowing from
  // ADP without needing to trust any single employee's drawer.
  let adpTimeOff_ = {
    configured: adpTimeOff.isConfigured(),
    linked_employees: 0,
    balance_rows: 0,
    request_rows: 0,
    last_sync: null,
    synced_at: null,
    sync_window: null,
    sample_balances: [],
  };
  try {
    adpTimeOff_.linked_employees = await scalar(
      "SELECT COUNT(*) AS n FROM users WHERE adp_associate_oid IS NOT NULL AND adp_associate_oid != ''"
    );
    adpTimeOff_.balance_rows = await scalar("SELECT COUNT(*) AS n FROM adp_time_off_balances");
    adpTimeOff_.request_rows = await scalar("SELECT COUNT(*) AS n FROM adp_time_off_requests");
    adpTimeOff_.last_sync = adpTimeOffSync.getLastSyncStats();
    adpTimeOff_.synced_at = adpTimeOffSync.getLastSyncedAt();
    adpTimeOff_.sync_window = adpTimeOffSync.syncWindow();

    const sampleRows = await db
      .prepare(
        `SELECT u.name AS employee_name, b.policy_name, b.entitlement, b.carried_over,
                b.used, b.scheduled, b.available, b.synced_at
         FROM adp_time_off_balances b
         JOIN users u ON u.id = b.user_id
         ORDER BY b.synced_at DESC
         LIMIT 10`
      )
      .all();
    adpTimeOff_.sample_balances = Array.isArray(sampleRows) ? sampleRows : [];
  } catch (e) {
    console.error("[admin metrics] adp time off section error:", e.message || e);
  }

  return res.json({
    ok: true,
    server: {
      node: process.version,
      uptime_s: Math.round(process.uptime()),
      started_at: startedAt,
      memory_mb: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap_used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
    database: {
      kind: isPostgres ? "postgres" : "sqlite",
      ok: dbOk,
      latency_ms: dbLatencyMs,
    },
    counts: {
      users: await scalar("SELECT COUNT(*) AS n FROM users"),
      reports: await scalar("SELECT COUNT(*) AS n FROM embedded_reports"),
      report_access_rows: await scalar("SELECT COUNT(*) AS n FROM report_access_users"),
      courses: await scalar("SELECT COUNT(*) AS n FROM courses"),
      assignments: await scalar("SELECT COUNT(*) AS n FROM assignments"),
      tickets: await scalar("SELECT COUNT(*) AS n FROM it_tickets"),
    },
    adp_time_off: adpTimeOff_,
  });
});

// Manual "sync now" — lets an admin force an immediate ADP time-off sync
// instead of waiting for the next scheduled run (every
// ADP_TIME_OFF_SYNC_INTERVAL_HOURS, default 2h, or 45s after a fresh
// server start). runFullTimeOffSync() already guards against overlapping
// runs (returns { skipped: true, reason: "already running" } instead of
// starting a second one), so this is safe to click more than once.
router.post("/sync-time-off", requireAdminGrant(ADMIN_GRANT_KEYS.SYSTEM), async (_req, res) => {
  try {
    const result = await adpTimeOffSync.runFullTimeOffSync();
    return res.json({ ok: true, result });
  } catch (e) {
    console.error("[admin sync-time-off] error:", e.message || e);
    return res.status(500).json({ ok: false, error: "Sync failed — check server logs." });
  }
});

module.exports = router;

