"use strict";

/**
 * Team Time Off — manager-only board data
 * ─────────────────────────────────────────
 * The board — and, as of 2026-09-15, the drawer's full-year history too —
 * reads from the local adp_time_off_balances / adp_time_off_requests
 * tables, kept fresh by adpTimeOffSync.service.js, which pulls every
 * linked employee's ADP data on its own schedule. This means loading
 * either one is a fast local DB read, never a live ADP call, and one
 * slow/unauthorized employee can't hold up the whole team.
 *
 * The drawer used to call ADP live (chunked across a full year — up to 9
 * separate round-trips per open, since ADP caps a single request at 6
 * weeks). That made opening a drawer slow, and worse, "authorized" was
 * being re-checked live per employee per click even though ADP's scope
 * grant is a single app-wide setting, not something that varies employee
 * to employee — so it was redundant on top of being slow. Now it reads
 * the same synced table the board already has in memory, and reuses the
 * same authorized flag the board computes. Trade-off: history for a year
 * (or part of a year) outside the sync window (see `sync_window` in the
 * response) won't have data until that window is synced — same honest
 * limit the board's calendar already has.
 *
 * Two honest limits, straight from ADP's documented behaviour (not a
 * portal limitation):
 *   - The Time Off Requests API only ever returns APPROVED requests —
 *     there is no pending/cancelled status to show.
 *   - ADP's balance categories are Earned, Taken, Scheduled, Available.
 *     There's no separately-documented "carried over" bucket; we surface
 *     one if a company's ADP config happens to expose it under a
 *     "carry"-ish type code, but it may come back blank.
 */

const { db } = require("../config/db");
const adpTimeOff = require("./adpTimeOff.service");
const adpTimeOffSync = require("./adpTimeOffSync.service");
const { isVacationPolicy, isApprovedStatus } = require("./adpTimeOffNormalize");

const EMPLOYEE_COLUMNS =
  "id, name, email, business_unit, department, designation, adp_job_title, adp_work_location, adp_associate_oid";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isTodayWithin(startDate, endDate) {
  if (!startDate) return false;
  const today = todayStr();
  return startDate <= today && (endDate || startDate) >= today;
}

function addOneDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// "Next time off" used to just be the first approved request with
// start_date >= today — which, for someone already on a multi-day leave
// that started today (or earlier), shows today's own date as their "next"
// time off. That reads wrong: they're not about to go, they're already
// gone. Garima flagged this on 2026-09-22 with a real example — an
// employee away today AND tomorrow showed "Next time off: <today>" instead
// of tomorrow's date.
//
// `requests` is pre-sorted by start_date ascending (see the query in
// getTeamTimeOff). For each request, in order:
//   - fully in the past (end_date < today) → not relevant, skip it.
//   - hasn't started yet (start_date > today) → that's genuinely next,
//     return it unchanged (same as before).
//   - otherwise it's the request keeping them away right now (start_date
//     <= today <= end_date) — the next day they're actually off is
//     tomorrow, as long as tomorrow still falls within this same request;
//     if this request's last day off is today, there's nothing "next" left
//     in it, so keep looking at the requests after it.
function nextTimeOffFor(requests, today) {
  for (const r of requests) {
    if (!r.start_date) continue;
    const end = r.end_date || r.start_date;
    if (end < today) continue;
    if (r.start_date > today) return r;
    const tomorrow = addOneDay(today);
    if (tomorrow <= end) return { ...r, start_date: tomorrow };
  }
  return null;
}

// ─── Security: only ever act on this manager's own direct reports ───────

async function assertDirectReport(managerUserId, employeeId) {
  const row = await db
    .prepare(`SELECT ${EMPLOYEE_COLUMNS} FROM users WHERE id = ? AND manager_id = ?`)
    .get(employeeId, managerUserId);
  if (!row) {
    const e = new Error("That employee doesn't report to you.");
    e.statusCode = 404;
    throw e;
  }
  return row;
}

// ─── Main board (reads the synced DB tables, not live ADP) ──────────────

async function getTeamTimeOff(managerUserId) {
  const employees = await db
    .prepare(`SELECT ${EMPLOYEE_COLUMNS} FROM users WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC`)
    .all(managerUserId);

  const filters = {
    departments: uniqueSorted(employees.map((e) => e.department || e.business_unit)),
    locations: uniqueSorted(employees.map((e) => e.adp_work_location)),
  };

  const syncedAt = adpTimeOffSync.getLastSyncedAt();

  if (!Array.isArray(employees) || employees.length === 0) {
    return {
      adp_configured: adpTimeOff.isConfigured(),
      authorized: true,
      balances_authorized: true,
      requests_authorized: true,
      synced_at: syncedAt,
      sync_window: adpTimeOffSync.syncWindow(),
      employees: [],
      summary: emptySummary(),
      filters: { departments: [], locations: [], leave_types: [] },
    };
  }

  if (!adpTimeOff.isConfigured()) {
    return {
      adp_configured: false,
      authorized: true,
      balances_authorized: true,
      requests_authorized: true,
      synced_at: syncedAt,
      sync_window: adpTimeOffSync.syncWindow(),
      employees: employees.map((e) => baseEmployee(e, { linked: Boolean(e.adp_associate_oid) })),
      summary: emptySummary(),
      filters: { ...filters, leave_types: [] },
    };
  }

  const ids = employees.map((e) => e.id);
  const placeholders = ids.map(() => "?").join(",");
  const [balanceRows, requestRows] = await Promise.all([
    db.prepare(`SELECT * FROM adp_time_off_balances WHERE user_id IN (${placeholders})`).all(...ids),
    db.prepare(`SELECT * FROM adp_time_off_requests WHERE user_id IN (${placeholders}) ORDER BY start_date ASC`).all(...ids),
  ]);

  const balancesByUser = groupBy(balanceRows, "user_id");
  const requestsByUser = groupBy(requestRows, "user_id");
  const leaveTypes = new Set();
  const today = todayStr();

  const syncStats = adpTimeOffSync.getLastSyncStats();
  // No sync has completed yet → don't claim authorization either way; once
  // one has, these reflect whether ADP actually let the sync read this
  // data (vs. scope/CAR registration still pending on ADP's side).
  // Balances and requests are two separate ADP scopes/canonical URIs, so
  // they can be authorized independently of each other — e.g. balances
  // working while requests is still pending a CAR registration on ADP's
  // side. Keeping them separate means the board only warns about the part
  // that's actually broken, instead of hiding balance data that's already
  // working just because requests isn't there yet.
  const balancesAuthorized = syncStats ? syncStats.balancesUnauthorized === 0 : true;
  const requestsAuthorized = syncStats ? syncStats.requestsUnauthorized === 0 : true;
  const authorized = balancesAuthorized && requestsAuthorized;

  const results = employees.map((e) => {
    if (!e.adp_associate_oid) return baseEmployee(e, { linked: false });

    const balances = (balancesByUser.get(e.id) || []).map(rowToBalance);
    // Board is approved-only for now (see adpTimeOffNormalize.js's
    // isApprovedStatus comment) — filters out anything ADP has tagged with
    // a non-approved status, which today is a no-op since ADP only ever
    // sends approved requests, but keeps the board honest if that changes
    // before a "pending" section exists to show them properly.
    const requests = (requestsByUser.get(e.id) || [])
      .filter((r) => isApprovedStatus(r.status))
      .map(rowToRequest);

    balances.forEach((b) => leaveTypes.add(b.policy_name || b.policy_code));
    requests.forEach((r) => leaveTypes.add(r.policy_name || r.policy_code));

    const nextUp = nextTimeOffFor(requests, today);
    const vacation = balances.find(isVacationPolicy) || null;

    return {
      ...baseEmployee(e, { linked: true }),
      // Was hardcoded `true` here regardless of the actual sync result, so
      // the UI could never tell "ADP hasn't authorized this yet" apart
      // from "authorized, but genuinely nothing on file" — both just
      // showed as blank/"—" with no explanation. This is an app-wide ADP
      // scope, not something that varies per employee, so every linked
      // employee shares the same authorized state as the board overall.
      //
      // `authorized` is kept as the combined AND of both scopes for any
      // caller that just wants "is everything fine", but balances and
      // requests are independently-authorized ADP scopes (see the comment
      // above `balancesAuthorized`/`requestsAuthorized`) — a UI section
      // that only shows balances (the vacation table, the drawer's balance
      // card) must gate on `balances_authorized`, not the combined flag,
      // or it will wrongly claim balances are unavailable whenever only
      // the requests scope is the one still pending on ADP's side.
      authorized,
      balances_authorized: balancesAuthorized,
      requests_authorized: requestsAuthorized,
      balances,
      vacation_balance: vacation,
      time_off: requests,
      next_time_off: nextUp,
      is_away_today: requests.some((r) => isTodayWithin(r.start_date, r.end_date)),
    };
  });

  return {
    adp_configured: true,
    authorized,
    balances_authorized: balancesAuthorized,
    requests_authorized: requestsAuthorized,
    synced_at: syncedAt,
    sync_window: adpTimeOffSync.syncWindow(),
    employees: results,
    summary: buildSummary(results),
    filters: { ...filters, leave_types: uniqueSorted([...leaveTypes]) },
  };
}

/**
 * One employee's time off for a given calendar year, for the drawer's
 * history view. Reads the same synced `adp_time_off_requests` table the
 * board uses — see the file header for why this changed from a live,
 * per-open ADP call. `sync_window` tells the caller how much of the
 * requested year is actually covered by the last sync, so the UI can
 * flag it if the year runs outside that range (same idea as the board's
 * calendar "outside synced range" notice).
 */
async function getEmployeeYearHistory(managerUserId, employeeId, year) {
  const employee = await assertDirectReport(managerUserId, employeeId);
  const y = Number(year) || new Date().getFullYear();
  const syncedAt = adpTimeOffSync.getLastSyncedAt();
  const window = adpTimeOffSync.syncWindow();

  if (!employee.adp_associate_oid || !adpTimeOff.isConfigured()) {
    return { employee: publicEmployee(employee), authorized: true, entries: [], synced_at: syncedAt, sync_window: window };
  }

  const syncStats = adpTimeOffSync.getLastSyncStats();
  const authorized = syncStats ? syncStats.requestsUnauthorized === 0 : true;

  const from = `${y}-01-01`;
  const to = `${y}-12-31`;
  const rows = await db
    .prepare(
      `SELECT * FROM adp_time_off_requests
       WHERE user_id = ? AND start_date <= ? AND start_date >= ?
       ORDER BY start_date ASC`
    )
    .all(employee.id, to, from);
  // Same approved-only filter as the board — see isApprovedStatus's comment.
  const entries = rows.filter((r) => isApprovedStatus(r.status)).map(rowToRequest);

  return { employee: publicEmployee(employee), authorized, entries, synced_at: syncedAt, sync_window: window };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function rowToBalance(row) {
  return {
    policy_code: row.policy_code,
    policy_name: row.policy_name,
    entitlement: row.entitlement,
    carried_over: row.carried_over,
    used: row.used,
    scheduled: row.scheduled,
    available: row.available,
  };
}

function rowToRequest(row) {
  return {
    id: row.adp_request_id,
    policy_code: row.policy_code,
    policy_name: row.policy_name,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    hours: row.hours,
  };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows || []) {
    const arr = map.get(r[key]) || [];
    arr.push(r);
    map.set(r[key], arr);
  }
  return map;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function baseEmployee(e, { linked }) {
  return {
    ...publicEmployee(e),
    adp_linked: linked,
    authorized: true,
    balances_authorized: true,
    requests_authorized: true,
    balances: [],
    vacation_balance: null,
    time_off: [],
    next_time_off: null,
    is_away_today: false,
  };
}

function publicEmployee(e) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    department: e.department || e.business_unit || null,
    location: e.adp_work_location || null,
    job_title: e.adp_job_title || e.designation || null,
  };
}

function emptySummary() {
  return { team_size: 0, away_today: 0, upcoming: 0, vacation_used_ytd: null, vacation_remaining: null };
}

function buildSummary(employees) {
  const today = todayStr();
  let awayToday = 0;
  let upcoming = 0;
  let vacUsed = null;
  let vacRemaining = null;

  for (const e of employees) {
    if (e.is_away_today) awayToday++;
    upcoming += (e.time_off || []).filter((r) => r.start_date > today).length;
    if (e.vacation_balance) {
      if (e.vacation_balance.used != null) vacUsed = (vacUsed ?? 0) + e.vacation_balance.used;
      if (e.vacation_balance.available != null) vacRemaining = (vacRemaining ?? 0) + e.vacation_balance.available;
    }
  }

  return { team_size: employees.length, away_today: awayToday, upcoming, vacation_used_ytd: vacUsed, vacation_remaining: vacRemaining };
}

module.exports = { getTeamTimeOff, getEmployeeYearHistory };
