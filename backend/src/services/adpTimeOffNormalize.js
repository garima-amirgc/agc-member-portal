"use strict";

/**
 * Shared ADP time-off field mapping — used by both the background sync
 * (adpTimeOffSync.service.js) and the on-demand year-history lookup
 * (managerTimeOff.service.js's getEmployeeYearHistory). Kept in one place
 * so there's a single spot to adjust if AGC's real ADP payloads turn out
 * shaped differently than these public-docs-based guesses (same kind of
 * fallback chains as adp.service.js's worker-profile mapping, for the
 * same reason — ADP's exact nesting varies by account configuration).
 */

function normalizeBalanceGroup(group) {
  const policyCode = group?.timeOffPolicyCode?.codeValue || group?.policyCode || group?.timeOffPolicyCode || null;
  const policyName = group?.timeOffPolicyCode?.shortName || group?.timeOffPolicyCode?.longName || policyCode;

  const entries = group?.balances || group?.balanceDetails || [];
  const pick = (needle) => {
    const hit = (Array.isArray(entries) ? entries : []).find((b) =>
      String(b?.typeCode?.codeValue || b?.typeCode || b?.balanceTypeCode || "")
        .toLowerCase()
        .includes(needle)
    );
    const qty = hit?.totalQuantity;
    if (qty == null) return null;
    return typeof qty === "object" ? Number(qty.quantityNumber ?? qty.quantityValue ?? qty.value ?? 0) : Number(qty);
  };

  return {
    policy_code: policyCode,
    policy_name: policyName,
    entitlement: pick("earn") ?? pick("adjust"),
    carried_over: pick("carry"),
    used: pick("taken") ?? pick("used"),
    scheduled: pick("sched"),
    available: pick("avail") ?? pick("remain"),
  };
}

function normalizeRequest(req) {
  const entries = req?.timeOffEntries || [{ datePeriod: req?.datePeriod, totalQuantity: req?.totalQuantity }];
  const first = entries[0] || {};
  const last = entries[entries.length - 1] || first;

  const policyCode =
    req?.timeOffPolicyCode?.codeValue || req?.timeOffPolicyCode || first?.timeOffPolicyCode?.codeValue || null;
  const policyName = req?.timeOffPolicyCode?.shortName || req?.timeOffPolicyCode?.longName || policyCode;

  const qty = req?.totalQuantity;
  const hours = qty == null ? null : typeof qty === "object" ? Number(qty.quantityNumber ?? qty.quantityValue ?? 0) : Number(qty);

  return {
    id: req?.timeOffRequestID || req?.itemID?.idValue || `${policyCode}-${first?.datePeriod?.startDate}`,
    policy_code: policyCode,
    policy_name: policyName,
    status: req?.requestStatusCode?.codeValue || req?.requestStatusCode || "Approved",
    start_date: first?.datePeriod?.startDate || req?.datePeriod?.startDate || null,
    end_date: last?.datePeriod?.endDate || req?.datePeriod?.endDate || null,
    hours,
  };
}

function isVacationPolicy(b) {
  return /vacation/i.test(b?.policy_name || "") || /^v$/i.test(b?.policy_code || "");
}

module.exports = { normalizeBalanceGroup, normalizeRequest, isVacationPolicy };
