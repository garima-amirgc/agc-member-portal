"use strict";

/**
 * Shared ADP time-off field mapping — used by both the background sync
 * (adpTimeOffSync.service.js) and adpTimeOff.service.js's request parsing.
 * Kept in one place so there's a single spot to adjust if ADP's payload
 * shape ever changes.
 *
 * 2026-09-21 — rewritten against ADP's own real sample responses (see
 * PROJECT_NOTES.md, "Real ADP payload shapes confirmed — 2026-09-21").
 * Everything below reflects confirmed field paths, not guesses — the
 * previous version of this file was written from ADP's general docs
 * before any real request had ever synced, and several of its field
 * paths (timeOffPolicyCode, typeCode, timeOffEntries...) don't exist in
 * the account's actual payloads at all.
 */

// ─── Balances ───────────────────────────────────────────────────────────

/**
 * One policy's balance, straight from
 * `paidTimeOffDetails.paidTimeOffBalances[].paidTimeOffPolicyBalances[]`:
 *   { paidTimeOffPolicy: { code, labelName },
 *     policyBalances: [ { balanceType: { code, labelName },
 *                          totalQuantity: { valueNumber, unitTimeCode, labelName } | null } ] }
 *
 * balanceType.code values seen in practice: available, taken, scheduled,
 * earned, carryover, transferred, futureEarned, unlimited (the last one —
 * e.g. an "as required" unpaid-leave policy — has no totalQuantity at all,
 * which is fine: it just won't match any of the codes below, so every
 * numeric field comes back null and the UI shows "—" for it, same as any
 * other policy with nothing to report).
 *
 * ADP's own balances API guide only documents earned/taken/scheduled/
 * available — carryover/transferred/futureEarned appear in the real
 * response but aren't in that guide's data dictionary. transferred and
 * futureEarned aren't surfaced (no column for them yet); carryover is.
 *
 * "taken" and "scheduled" come back as NEGATIVE numbers in ADP's response
 * (e.g. -25.0 for 25 days taken) — this file takes the absolute value so
 * "Used"/"Scheduled" display as positive day counts, matching every other
 * balance figure and how a manager would actually read them.
 */
function normalizeBalanceGroup(group) {
  const policyCode = group?.paidTimeOffPolicy?.code || null;
  const policyName = group?.paidTimeOffPolicy?.labelName || policyCode;

  const entries = Array.isArray(group?.policyBalances) ? group.policyBalances : [];
  const pick = (code) => {
    const hit = entries.find((b) => String(b?.balanceType?.code || "").toLowerCase() === code);
    const qty = hit?.totalQuantity?.valueNumber;
    return qty == null ? null : Number(qty);
  };

  const taken = pick("taken");
  const scheduled = pick("scheduled");

  return {
    policy_code: policyCode,
    policy_name: policyName,
    entitlement: pick("earned"),
    carried_over: pick("carryover"),
    used: taken == null ? null : Math.abs(taken),
    scheduled: scheduled == null ? null : Math.abs(scheduled),
    available: pick("available"),
  };
}

// ─── Requests ───────────────────────────────────────────────────────────

/**
 * Flatten ADP's deeply-nested time-off-requests response down to one raw
 * `{ req, entry }` pair per individual day/period entry.
 *
 * Real shape: `paidTimeOffDetails.paidTimeOffRequests[]` (one per worker
 * position) → `.paidTimeOffRequestEntries[]` (grouped by status) →
 * `.requests[]` (individual requests) → `.paidTimeOffEntries[]` (the
 * actual day-by-day entries).
 *
 * Critically: ONE ADP request (one requestID) can cover several
 * non-contiguous days — e.g. a real sample request covered 16 separate
 * dates spread across three weeks, not one continuous range. Our DB
 * schema stores one row per synced item with a single start/end date, so
 * syncing at the WHOLE-REQUEST level would force collapsing those 16
 * dates into one 2026-09-04→2026-09-28 range — which would make the
 * calendar wrongly show the employee on leave for every day in between,
 * including days they're not actually off. Syncing at the ENTRY level
 * instead (each entry already has its own unique `paidTimeOffID` and its
 * own single date/period) keeps the calendar accurate for both simple
 * single-day requests and multi-day/non-contiguous ones.
 */
function extractRequestItems(data) {
  const positions = data?.paidTimeOffDetails?.paidTimeOffRequests || [];
  const out = [];
  for (const pos of positions) {
    for (const group of pos?.paidTimeOffRequestEntries || []) {
      for (const req of group?.requests || []) {
        for (const entry of req?.paidTimeOffEntries || []) {
          out.push({ req, entry });
        }
      }
    }
  }
  return out;
}

/** Turn one raw `{ req, entry }` pair (from extractRequestItems) into our row shape. */
function normalizeRequest({ req, entry } = {}) {
  const policyCode = entry?.paidTimeOffPolicy?.code || null;
  const policyName = entry?.paidTimeOffPolicy?.labelName || policyCode;
  const qty = entry?.totalQuantity?.valueNumber;
  const start = entry?.timePeriod?.startDateTime || null;

  return {
    id: entry?.paidTimeOffID || `${req?.requestID || "req"}-${start || "?"}`,
    policy_code: policyCode,
    policy_name: policyName,
    // entryStatus is the specific day's status; requestStatus is the
    // request's overall status — prefer the entry-level one, fall back to
    // the request, then assume approved (ADP's documented default for
    // this endpoint when nothing else is available).
    status: entry?.entryStatus?.code || req?.requestStatus?.code || "approved",
    start_date: start,
    end_date: entry?.timePeriod?.endDateTime || start,
    hours: qty == null ? null : Number(qty),
  };
}

function isVacationPolicy(b) {
  return /vacation/i.test(b?.policy_name || "") || /^v$/i.test(b?.policy_code || "");
}

/**
 * The Manager Vacation Board is approved-only for now — see PROJECT_NOTES.md
 * ("Approved-only board, built for later pending support — 2026-09-15").
 * A denylist rather than an allowlist, on purpose: ADP's real sample data
 * uses lowercase words ("approved"), but ADP's own PDF guide documents
 * single-letter codes for this same field (A/P/D/I/C) — since the two
 * disagree, both conventions are covered below instead of trusting one.
 */
const NOT_APPROVED_STATUSES = new Set([
  "pending",
  "requested",
  "submitted",
  "in progress",
  "inprogress",
  "cancelled",
  "canceled",
  "denied",
  "rejected",
  "withdrawn",
  "revoked",
  // ADP's PDF guide's single-letter codes for pending/denied/in-progress/
  // cancelled (its "A" for approved is deliberately NOT here).
  "p",
  "d",
  "i",
  "c",
]);

function isApprovedStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return true; // no status at all — treat like ADP's documented default (approved)
  return !NOT_APPROVED_STATUSES.has(s);
}

module.exports = {
  normalizeBalanceGroup,
  extractRequestItems,
  normalizeRequest,
  isVacationPolicy,
  isApprovedStatus,
};
