"use strict";

/**
 * ADP Time Off — balances + requests
 * ────────────────────────────────────
 * Read-only. Pulls per-employee time-off data straight from ADP so managers
 * can see who's off (and how much time they have left) without anyone
 * submitting a request through the portal.
 *
 * Reuses adp.service.js's mTLS agent + OAuth token cache (adpGet) — no new
 * env vars needed. What IS needed on ADP's side, separate from the worker
 * profile scope already configured:
 *
 *   - The "Time & Attendance / Time Off Management" module must be active
 *     on the ADP subscription.
 *   - These two read scopes must be added to the existing app connection
 *     in ADP's Consumer Application Registry (CAR):
 *       /time/timeLaborManagement/timeOffManagement/timeOffBalancesManagement/timeOffBalance.read
 *       /time/timeLaborManagement/timeOffManagement/timeOffRequestManagement/timeOffRequest.read
 *
 * Until that's in place, ADP returns either a 403 (missing scope) or a 404
 * "Canonical URI Not Found" (module/scope enabled, but this specific
 * endpoint not yet added to the app's CAR entry) — both are surfaced the
 * same way (authorized: false) so the UI can explain what's missing
 * instead of just showing "no time off" for everyone.
 */

const adpSvc = require("./adp.service");

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — balances/requests don't change intraday
const _balanceCache = new Map(); // aoid -> { data, expiresAt }
const _requestsCache = new Map(); // `${aoid}:${from}:${to}` -> { data, expiresAt }

function isConfigured() {
  return adpSvc.isConfigured();
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * ADP's time-off-requests endpoint caps the filter window at 6 weeks.
 * Default to a window that covers recent + upcoming time off.
 */
function defaultWindow() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 21);
  const to = new Date(now);
  to.setDate(to.getDate() + 21);
  return { from: ymd(from), to: ymd(to) };
}

function isScopeError(e) {
  // 401/403 are the classic auth/scope failures. A 404 from these two ADP
  // endpoints has been observed in practice to mean "this canonical URI
  // hasn't been added to our app's CAR entry yet" (ADP literally returns
  // message: "Canonical URI Not Found") — not "no results for this date
  // range." Treat it the same as a scope failure so the UI shows the
  // "ADP access pending" banner instead of silently looking like nobody
  // has any time off.
  return e?.statusCode === 401 || e?.statusCode === 403 || e?.statusCode === 404;
}

function isEmptyResult(e) {
  // 204 No Content is ADP's documented response for "no time-off policy
  // assigned to this employee" on the balances endpoint — a genuinely
  // empty (but authorized) result.
  return e?.statusCode === 204;
}

/**
 * Balances as of today for one employee. Returns:
 *   { authorized: true,  balances: [...] }        — success (balances may be [])
 *   { authorized: false, balances: [] }            — scope/module not available
 * Throws only on unexpected (non-auth, non-empty) errors.
 */
async function getTimeOffBalances(associateOID) {
  if (!associateOID) return { authorized: true, balances: [] };

  const cached = _balanceCache.get(associateOID);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let result;
  try {
    const data = await adpSvc.adpGet(`/time/v2/workers/${associateOID}/time-off-details/time-off-balances`);
    const balances = data?.timeOffBalances || data?.workers?.[0]?.timeOffBalances || [];
    console.log(`[ADP Time Off] balances for ${associateOID}: status 200, ${Array.isArray(balances) ? balances.length : 0} entries`);
    result = { authorized: true, balances: Array.isArray(balances) ? balances : [] };
  } catch (e) {
    console.log(`[ADP Time Off] balances for ${associateOID}: status ${e.statusCode ?? "?"} — ${e.message}`);
    if (isScopeError(e)) result = { authorized: false, balances: [] };
    else if (isEmptyResult(e)) result = { authorized: true, balances: [] };
    else throw e;
  }

  _balanceCache.set(associateOID, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * Time-off requests (ADP only returns approved ones) inside a date window
 * for one employee. Same { authorized, requests } shape as above.
 */
async function getTimeOffRequests(associateOID, from, to) {
  if (!associateOID) return { authorized: true, requests: [] };
  const win = from && to ? { from, to } : defaultWindow();
  const cacheKey = `${associateOID}:${win.from}:${win.to}`;

  const cached = _requestsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let result;
  try {
    const filter = `datePeriod/startDate ge ${win.from} AND datePeriod/startDate le ${win.to}`;
    const data = await adpSvc.adpGet(
      `/time/v3/workers/${associateOID}/time-offrequests?$filter=${encodeURIComponent(filter)}`
    );
    const requests = data?.timeOffRequests || [];
    console.log(`[ADP Time Off] requests for ${associateOID}: status 200, ${Array.isArray(requests) ? requests.length : 0} entries`);
    result = { authorized: true, requests: Array.isArray(requests) ? requests : [] };
  } catch (e) {
    console.log(`[ADP Time Off] requests for ${associateOID}: status ${e.statusCode ?? "?"} — ${e.message}`);
    if (isScopeError(e)) result = { authorized: false, requests: [] };
    else if (isEmptyResult(e)) result = { authorized: true, requests: [] };
    else throw e;
  }

  _requestsCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function clearCaches() {
  _balanceCache.clear();
  _requestsCache.clear();
}

module.exports = {
  isConfigured,
  getTimeOffBalances,
  getTimeOffRequests,
  clearCaches,
  defaultWindow,
  MAX_WINDOW_DAYS: 42, // ADP's documented cap on the requests date filter
};
