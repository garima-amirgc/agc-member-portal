"use strict";

/**
 * Team Time Off — manager-only board data
 * ─────────────────────────────────────────
 * The board itself reads from the local adp_time_off_balances /
 * adp_time_off_requests tables — kept fresh by adpTimeOffSync.service.js,
 * which pulls every linked employee's ADP data on its own schedule. This
 * means loading the board is a fast local DB read, never a live ADP call,
 * and one slow/unauthorized employee can't hold up the whole team.
 *
 * Only the drawer's full-year history (getEmployeeYearHistory) still
 * calls ADP live — that's opened rarely, one employee at a time, so
 * there's no need to keep a full year cached for everyone.
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
const { normalizeRequest, isVacationPolicy } = require("./adpTimeOffNormalize");

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

  const results = employees.map((e) => {
    if (!e.adp_associate_oid) return baseEmployee(e, { linked: false });

    const balances = (balancesByUser.get(e.id) || []).map(rowToBalance);
    const requests = (requestsByUser.get(e.id) || []).map(rowToRequest);

    balances.forEach((b) => leaveTypes.add(b.policy_name || b.policy_code));
    requests.forEach((r) => leaveTypes.add(r.policy_name || r.policy_code));

    const nextUp = requests.find((r) => r.start_date && r.start_date >= today) || null;
    const vacation = balances.find(isVacationPolicy) || null;

    return {
      ...baseEmployee(e, { linked: true }),
      authorized: true,
      balances,
      vacation_balance: vacation,
      time_off: requests,
      next_time_off: nextUp,
      is_away_today: requests.some((r) => isTodayWithin(r.start_date, r.end_date)),
    };
  });

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
 * One employee's time off across a full calendar year, for the drawer's
 * history view. This is the one path that still calls ADP live — ADP
 * caps a single requests call at 6 weeks, so this chunks the year and
 * merges the results. Only ever runs for someone who actually reports to
 * this manager.
 */
async function getEmployeeYearHistory(managerUserId, employeeId, year) {
  const employee = await assertDirectReport(managerUserId, employeeId);
  const y = Number(year) || new Date().getFullYear();

  if (!employee.adp_associate_oid || !adpTimeOff.isConfigured()) {
    return { employee: publicEmployee(employee), authorized: true, entries: [] };
  }

  const chunks = yearChunks(y, adpTimeOff.MAX_WINDOW_DAYS);
  const chunkResults = await Promise.all(
    chunks.map(({ from, to }) => adpTimeOff.getTimeOffRequests(employee.adp_associate_oid, from, to))
  );

  const authorized = chunkResults.every((c) => c.authorized);
  const byId = new Map();
  for (const c of chunkResults) {
    for (const raw of c.requests || []) {
      const norm = normalizeRequest(raw);
      byId.set(norm.id, norm);
    }
  }
  const entries = [...byId.values()].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  return { employee: publicEmployee(employee), authorized, entries };
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

function yearChunks(year, maxDays) {
  const chunks = [];
  let cursor = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const clampedEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ from: cursor.toISOString().slice(0, 10), to: clampedEnd.toISOString().slice(0, 10) });
    cursor = new Date(clampedEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function baseEmployee(e, { linked }) {
  return {
    ...publicEmployee(e),
    adp_linked: linked,
    authorized: true,
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
