// SLT Tracker — Action Register analytics.
//
// "Board Summary" and "Executive Dashboard" (the other two radio choices
// alongside "Action Register" under SLT Tracker — see
// SltActionTrackerBoard.jsx) aren't separate backend endpoints: both are
// computed here, client-side, from the same GET /cfo/slt/v2/action-items
// list the Action Register view itself uses. The logic mirrors the
// uploaded source workbook's own formulas —
// SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx — rather
// than inventing new rules:
//   - computeKpis(): the "Executive Dashboard" sheet's 7-tile KPI strip
//     (COUNTIFS over Active Record / Priority / Risk Impact / Escalation
//     Required / Strategic Objective).
//   - computeBoardSummary(): the "Board Summary" sheet's "Items Requiring
//     Executive Attention" table — a LET/FILTER/SORTBY array formula there,
//     translated straight into JS filter+sort below.
//   - computeOwnerBreakdown() / computeObjectiveBreakdown(): the
//     "Executive Dashboard" sheet's two accountability tables, computed
//     dynamically over whatever owners/objectives actually appear in the
//     data instead of the workbook's static named rows (Gene/Dave/
//     Maurizio/... — a hardcoded name list would silently go stale the
//     first time someone new is added as an Owner).
//
// Every item passed in here is expected to already be shaped like the
// backend's mapActionItem() output (sltActionRegister.service.js) — in
// particular `active`/`overdue`/`flag` are read directly from the item,
// never recomputed from scratch, so there's exactly one definition of what
// "active" means (status-based) shared by both ends.

function isOverdue(item) {
  return !!item.active && !!item.due_date && item.due_date < new Date().toISOString().slice(0, 10);
}

// KPI strip — 'Executive Dashboard'!A5/C5/F5/I5/K5/M5/O5 in the workbook.
export function computeKpis(items) {
  const active = items.filter((i) => i.active);
  return {
    openActions: active.length,
    overdue: active.filter(isOverdue).length,
    criticalPriority: active.filter((i) => i.priority === "Critical").length,
    highPriority: active.filter((i) => i.priority === "High").length,
    highRisk: active.filter((i) => i.risk_impact === "High").length,
    escalations: active.filter((i) => i.escalation_required === "Yes").length,
    aspGoLiveItems: active.filter((i) => i.strategic_objective === "ASP Go-Live").length,
  };
}

const PRIORITY_RANK = { Critical: 1, High: 2, Medium: 3, Low: 4 };
const RISK_RANK = { High: 1, Medium: 2, Low: 3 };

// 'Board Summary'!A12's LET/FILTER/SORTBY formula:
//   include = active && (priority in {Critical,High} || risk="High" ||
//             escalation="Yes" || due <= today)
//   sort by priority rank asc, then overdue desc, then escalation desc,
//   then risk rank asc.
export function computeBoardSummary(items) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const included = items.filter((i) => {
    if (!i.active) return false;
    const critOrHigh = i.priority === "Critical" || i.priority === "High";
    const highRisk = i.risk_impact === "High";
    const escalation = i.escalation_required === "Yes";
    const overdue = !!i.due_date && i.due_date <= todayIso;
    return critOrHigh || highRisk || escalation || overdue;
  });
  return included
    .slice()
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] || 9;
      const pb = PRIORITY_RANK[b.priority] || 9;
      if (pa !== pb) return pa - pb;
      const oa = a.due_date && a.due_date < todayIso ? 1 : 0;
      const ob = b.due_date && b.due_date < todayIso ? 1 : 0;
      if (oa !== ob) return ob - oa; // overdue first
      const ea = a.escalation_required === "Yes" ? 1 : 0;
      const eb = b.escalation_required === "Yes" ? 1 : 0;
      if (ea !== eb) return eb - ea; // escalation first
      const ra = RISK_RANK[a.risk_impact] || 9;
      const rb = RISK_RANK[b.risk_impact] || 9;
      return ra - rb;
    });
}

// 'Executive Dashboard'!A9:H.. — one row per distinct Owner that appears on
// any active item, in first-seen order (the workbook hardcoded its own
// owner list in this same row order; this keeps that "most-loaded people
// first" feel without needing to hardcode names).
export function computeOwnerBreakdown(items) {
  const active = items.filter((i) => i.active);
  const owners = [];
  for (const i of active) {
    const name = (i.owner || "").trim();
    if (name && !owners.includes(name)) owners.push(name);
  }
  return owners.map((owner) => {
    const mine = active.filter((i) => (i.owner || "").trim() === owner);
    return {
      owner,
      open: mine.length,
      overdue: mine.filter(isOverdue).length,
      criticalPriority: mine.filter((i) => i.priority === "Critical").length,
      highPriority: mine.filter((i) => i.priority === "High").length,
      highRisk: mine.filter((i) => i.risk_impact === "High").length,
      atRiskOrStuck: mine.filter((i) => i.status === "At Risk" || i.status === "Stuck").length,
      escalations: mine.filter((i) => i.escalation_required === "Yes").length,
    };
  });
}

// 'Executive Dashboard'!J9:O.. — same idea, keyed by Strategic Objective.
export function computeObjectiveBreakdown(items) {
  const active = items.filter((i) => i.active);
  const objectives = [];
  for (const i of active) {
    const obj = (i.strategic_objective || "").trim();
    if (obj && !objectives.includes(obj)) objectives.push(obj);
  }
  return objectives.map((objective) => {
    const mine = active.filter((i) => (i.strategic_objective || "").trim() === objective);
    return {
      objective,
      open: mine.length,
      overdue: mine.filter(isOverdue).length,
      criticalPriority: mine.filter((i) => i.priority === "Critical").length,
      highPriority: mine.filter((i) => i.priority === "High").length,
      highRisk: mine.filter((i) => i.risk_impact === "High").length,
    };
  });
}

export { isOverdue };
