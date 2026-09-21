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
 *
 * 2026-09-21 — confirmed against ADP's own sample responses + the official
 * "Time Off Balances/Request API Guide for ADP Workforce Now" PDFs, after
 * ADP confirmed both canonical URIs above are now registered:
 *
 *   - The REQUESTS endpoint was wrong. This used to call
 *     `/time/v3/workers/{aoid}/time-offrequests?$filter=...` (a v3
 *     endpoint, chunked into 6-week windows) — that endpoint's canonical
 *     URI was never the one ADP registered, which is almost certainly the
 *     real reason every sync kept hitting "Canonical URI Not Found" even
 *     after the scope itself was enabled. The confirmed, working endpoint
 *     is the v2 one below, matching the balances endpoint's own style.
 *   - Neither endpoint accepts a date filter or pagination. The requests
 *     endpoint has a FIXED window ADP applies automatically — the guide
 *     states "the last 90 days" and, per its FAQ, "requests that were made
 *     two years in the future." So the old chunk-by-6-weeks logic and
 *     `defaultWindow()`/`MAX_WINDOW_DAYS` are gone; one plain GET per
 *     employee returns everything ADP is willing to give us.
 *   - Response shapes for both endpoints are deeply nested and different
 *     from what this file originally guessed — see adpTimeOffNormalize.js
 *     for the exact real field paths, confirmed against ADP's own sample
 *     payloads (not guessed).
 */

const adpSvc = require("./adp.service");
const { extractRequestItems } = require("./adpTimeOffNormalize");

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — balances/requests don't change intraday
const _balanceCache = new Map(); // aoid -> { data, expiresAt }
const _requestsCache = new Map(); // aoid -> { data, expiresAt }

function isConfigured() {
  return adpSvc.isConfigured();
}

function isScopeError(e) {
  // 401/403 are the classic auth/scope failures. A 404 from these two ADP
  // endpoints has been observed in practice to mean "this canonical URI
  // hasn't been added to our app's CAR entry yet" (ADP literally returns
  // message: "Canonical URI Not Found") — not "no results." Treat it the
  // same as a scope failure so the UI shows the "ADP access pending"
  // banner instead of silently looking like nobody has any time off.
  return e?.statusCode === 401 || e?.statusCode === 403 || e?.statusCode === 404;
}

function isEmptyResult(e) {
  // 204 No Content is ADP's documented response for "no active time-off
  // policy assignment as of date" on the balances endpoint — a genuinely
  // empty (but authorized) result. Not separately documented for the
  // requests endpoint, but handled the same way defensively if ADP ever
  // sends it there too.
  return e?.statusCode === 204;
}

/**
 * Balances as of today for one employee. Returns:
 *   { authorized: true,  balances: [...] }        — success (balances may be [])
 *   { authorized: false, balances: [] }            — scope/module not available
 * `balances` here is the raw array of per-policy balance groups (each one
 * `{ paidTimeOffPolicy, policyBalances: [...] }`) straight from ADP —
 * normalizeBalanceGroup() in adpTimeOffNormalize.js turns each one into
 * our flat row shape. Throws only on unexpected (non-auth, non-empty)
 * errors.
 */
async function getTimeOffBalances(associateOID) {
  if (!associateOID) return { authorized: true, balances: [] };

  const cached = _balanceCache.get(associateOID);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let result;
  try {
    const data = await adpSvc.adpGet(`/time/v2/workers/${associateOID}/time-off-details/time-off-balances`);
    // Real shape: { paidTimeOffDetails: { paidTimeOffBalances: [ { positionRef,
    // asOfDate, paidTimeOffPolicyBalances: [ { paidTimeOffPolicy, policyBalances } ] } ] } }
    // A worker can (rarely) hold more than one position, each with its own
    // policy list — flatten across positions so every policy is captured.
    const positions = data?.paidTimeOffDetails?.paidTimeOffBalances || [];
    const balances = positions.flatMap((p) => (Array.isArray(p?.paidTimeOffPolicyBalances) ? p.paidTimeOffPolicyBalances : []));
    console.log(`[ADP Time Off] balances for ${associateOID}: status 200, ${balances.length} policy entries`);
    result = { authorized: true, balances };
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
 * Time-off requests for one employee, over ADP's own fixed window (last 90
 * days + requests made up to two years out — not something we control or
 * filter). Returns `{ authorized, requests }` where `requests` is a RAW
 * flat array of `{ req, entry }` pairs — one per individual day/period
 * within a request, since one ADP request can cover several non-contiguous
 * days (see extractRequestItems() in adpTimeOffNormalize.js). Each pair is
 * turned into our row shape by normalizeRequest() in the sync loop, same
 * pattern as balances.
 */
async function getTimeOffRequests(associateOID) {
  if (!associateOID) return { authorized: true, requests: [] };

  const cached = _requestsCache.get(associateOID);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let result;
  try {
    const data = await adpSvc.adpGet(`/time/v2/workers/${associateOID}/time-off-details/time-off-requests`);
    const items = extractRequestItems(data);
    console.log(`[ADP Time Off] requests for ${associateOID}: status 200, ${items.length} entries`);
    result = { authorized: true, requests: items };
  } catch (e) {
    console.log(`[ADP Time Off] requests for ${associateOID}: status ${e.statusCode ?? "?"} — ${e.message}`);
    if (isScopeError(e)) result = { authorized: false, requests: [] };
    else if (isEmptyResult(e)) result = { authorized: true, requests: [] };
    else throw e;
  }

  _requestsCache.set(associateOID, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
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
};
