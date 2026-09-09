"use strict";

/**
 * ADP time off → DB background sync
 * ────────────────────────────────────
 * Pulls every linked employee's ADP balances + time-off requests ONCE per
 * cycle and writes them into adp_time_off_balances / adp_time_off_requests
 * — the same pattern adpSync.service.js already uses for worker profiles.
 *
 * The Team Time Off board then reads straight from these tables (fast, no
 * live ADP round-trip per manager page load, and no risk of one slow
 * employee holding up someone else's board). Only the drawer's full-year
 * history still calls ADP live, on demand, for whichever single employee
 * is opened — that's rare enough not to need caching.
 *
 * Requests are synced for a rolling window (RECENT_PAST_DAYS back through
 * UPCOMING_DAYS ahead) rather than a full year, to keep the per-cycle ADP
 * call volume reasonable as the team grows. Balances aren't windowed —
 * ADP always returns them "as of now".
 *
 * Optional env var:
 *   ADP_TIME_OFF_SYNC_INTERVAL_HOURS — how often to run (default: 2)
 */

const { db } = require("../config/db");
const adpTimeOff = require("./adpTimeOff.service");
const { normalizeBalanceGroup, normalizeRequest } = require("./adpTimeOffNormalize");

const RECENT_PAST_DAYS = 90;
const UPCOMING_DAYS = 180;
const CONCURRENCY = 5; // be polite to ADP — don't fire off dozens of calls at once

const SYNC_INTERVAL_MS = (() => {
  const hrs = parseFloat(process.env.ADP_TIME_OFF_SYNC_INTERVAL_HOURS);
  return (Number.isFinite(hrs) && hrs > 0 ? hrs : 2) * 60 * 60 * 1000;
})();

let _timer = null;
let _running = false;
let _lastSync = null; // { at, synced, total, unauthorized, failed } | null if no sync has run yet

function getLastSyncedAt() {
  return _lastSync?.at ?? null;
}

function getLastSyncStats() {
  return _lastSync;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function syncWindow() {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - RECENT_PAST_DAYS);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + UPCOMING_DAYS);
  return { from: ymd(from), to: ymd(to) };
}

/** Split [from, to] into chunks no longer than ADP's 6-week request cap. */
function windowChunks(from, to, maxDays) {
  const chunks = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const clamped = chunkEnd > end ? end : chunkEnd;
    chunks.push({ from: ymd(cursor), to: ymd(clamped) });
    cursor = new Date(clamped);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function syncOneEmployee(user, win) {
  const [balRes, ...chunkResults] = await Promise.all([
    adpTimeOff.getTimeOffBalances(user.adp_associate_oid),
    ...windowChunks(win.from, win.to, adpTimeOff.MAX_WINDOW_DAYS).map((c) =>
      adpTimeOff.getTimeOffRequests(user.adp_associate_oid, c.from, c.to)
    ),
  ]);

  const balancesAuthorized = balRes.authorized;
  const requestsAuthorized = chunkResults.every((c) => c.authorized);
  const authorized = balancesAuthorized && requestsAuthorized;

  // Balances: full replace — ADP always returns the complete current set.
  await db.prepare("DELETE FROM adp_time_off_balances WHERE user_id = ?").run(user.id);
  for (const raw of balRes.balances || []) {
    const b = normalizeBalanceGroup(raw);
    await db
      .prepare(
        `INSERT INTO adp_time_off_balances
          (user_id, policy_code, policy_name, entitlement, carried_over, used, scheduled, available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, b.policy_code, b.policy_name, b.entitlement, b.carried_over, b.used, b.scheduled, b.available);
  }

  // Requests: full replace for the synced window (dedupe across chunks by id).
  const byId = new Map();
  for (const c of chunkResults) {
    for (const raw of c.requests || []) {
      const norm = normalizeRequest(raw);
      byId.set(norm.id, norm);
    }
  }
  await db.prepare("DELETE FROM adp_time_off_requests WHERE user_id = ?").run(user.id);
  for (const r of byId.values()) {
    await db
      .prepare(
        `INSERT INTO adp_time_off_requests
          (user_id, adp_request_id, policy_code, policy_name, start_date, end_date, hours, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, String(r.id), r.policy_code, r.policy_name, r.start_date, r.end_date, r.hours, r.status);
  }

  return {
    authorized,
    balancesAuthorized,
    requestsAuthorized,
    balances: (balRes.balances || []).length,
    requests: byId.size,
  };
}

async function runFullTimeOffSync() {
  if (_running) return { skipped: true, reason: "already running" };
  if (!adpTimeOff.isConfigured()) return { skipped: true, reason: "ADP not configured" };

  _running = true;
  const started = Date.now();
  console.log("[ADP Time Off Sync] Starting full sync…");

  try {
    const users = await db
      .prepare("SELECT id, adp_associate_oid FROM users WHERE adp_associate_oid IS NOT NULL")
      .all();
    const win = syncWindow();

    let synced = 0;
    let unauthorized = 0;
    let balancesUnauthorized = 0;
    let requestsUnauthorized = 0;
    let failed = 0;

    await mapWithConcurrency(Array.isArray(users) ? users : [], CONCURRENCY, async (user) => {
      try {
        const out = await syncOneEmployee(user, win);
        synced++;
        if (!out.authorized) unauthorized++;
        if (!out.balancesAuthorized) balancesUnauthorized++;
        if (!out.requestsAuthorized) requestsUnauthorized++;
      } catch (e) {
        failed++;
        console.error(`[ADP Time Off Sync] Failed for user ${user.id}:`, e.message || e);
      }
    });

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    // Broken out by endpoint so a one-sided ADP registration gap (e.g. balances
    // working but requests still 404 "Canonical URI Not Found", or vice versa)
    // is obvious from this one line, without digging through per-call logs.
    console.log(
      `[ADP Time Off Sync] Done — ${synced}/${users.length} synced (${unauthorized} not yet authorized — ` +
        `${balancesUnauthorized} on balances, ${requestsUnauthorized} on requests; ${failed} failed) in ${secs}s`
    );
    _lastSync = {
      at: new Date().toISOString(),
      synced,
      total: users.length,
      unauthorized,
      balancesUnauthorized,
      requestsUnauthorized,
      failed,
    };
    return _lastSync;
  } finally {
    _running = false;
  }
}

function startSync() {
  if (_timer) return;
  setTimeout(() => {
    runFullTimeOffSync();
    _timer = setInterval(runFullTimeOffSync, SYNC_INTERVAL_MS);
  }, 45_000); // stagger slightly after the worker-profile sync's own 30s delay
  const hrs = (SYNC_INTERVAL_MS / 3_600_000).toFixed(1);
  console.log(`[ADP Time Off Sync] Scheduled every ${hrs}h (first run in 45s)`);
}

function stopSync() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { startSync, stopSync, runFullTimeOffSync, getLastSyncedAt, getLastSyncStats, syncWindow };
