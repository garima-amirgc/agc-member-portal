const express = require("express");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { db, isPostgres } = require("../config/db");

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
  });
});

module.exports = router;

