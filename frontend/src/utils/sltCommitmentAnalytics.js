// SLT Tracker — "90 Day Commitments" analytics.
//
// All the due-date math (Original Due, 30/60-Day Check-In Due, Current Due,
// overdue, report_cue) is already computed server-side in mapCommitment()
// (sltCommitmentRegister.service.js), exactly mirroring the source
// workbook's own formulas — this file just turns that one list into the
// header KPI strip shown on the board, same "one strip computed from the
// whole list" pattern Action Register's and Decisions' headers use.

function isCommitmentOverdue(item) {
  return !!item.overdue;
}

function computeCommitmentKpis(items) {
  const open = items.filter((i) => i.open);
  return {
    total: items.length,
    open: open.length,
    closed: items.length - open.length,
    overdue: open.filter((i) => i.overdue).length,
    needsReport: open.filter((i) => i.report_cue).length,
    onTrack: open.filter((i) => i.rag_status === "Met / On Track").length,
  };
}

export { isCommitmentOverdue, computeCommitmentKpis };
