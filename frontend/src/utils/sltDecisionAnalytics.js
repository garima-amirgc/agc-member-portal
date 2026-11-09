// SLT Tracker — "Decisions" tab analytics.
//
// Decision Queue and Decision Register (see SltDecisionBoard.jsx) aren't
// separate backend endpoints — both are computed here, client-side, from
// the same GET /cfo/slt/v2/decisions list, exactly mirroring how
// sltActionAnalytics.js splits one Action Register list into Board
// Summary/Executive Dashboard/Action Register. A decision is "in the
// Queue" when `active` is true and "in the Register" when `decided` (i.e.
// `!active`) is true — both flags come straight from the backend's
// mapDecision() (sltDecisionRegister.service.js), which derives them from
// Status the same way the source workbook's own Active Record formula did
// (Completed/Cancelled = decided; everything else, Deferred included, is
// still pending).

function isDecisionOverdue(item) {
  return !!item.active && !!item.decision_deadline && item.decision_deadline < new Date().toISOString().slice(0, 10);
}

// Shared KPI strip shown on both the Decision Queue and Decision Register
// headers (same "one strip computed from the whole list, shown everywhere"
// pattern Action Register's header pills use).
function computeDecisionKpis(items) {
  const active = items.filter((i) => i.active);
  const decided = items.filter((i) => i.decided);
  return {
    total: items.length,
    pending: active.length,
    decided: decided.length,
    overdue: active.filter(isDecisionOverdue).length,
    highRisk: active.filter((i) => i.risk_impact === "High").length,
    ceoCfoAttention: active.filter((i) => i.ceo_cfo_attention && i.ceo_cfo_attention !== "No").length,
  };
}

export { isDecisionOverdue, computeDecisionKpis };
