import { FACILITY_CODES } from "./facilities";

// The real production plants (Garima: "there are 3 plants AQM, SCF, ASP").
// Reuses the app's existing FACILITY_CODES list rather than a separate
// hardcoded one, minus "AGC" — that's the parent company code, not a plant.
export const NPD_PLANT_OPTIONS = FACILITY_CODES.filter((c) => c !== "AGC").map((c) => ({ value: c, label: c }));

// Shared 1–5 option list for the Gate 1 scorecard's manual scores. 1/3/5 are
// anchored to the source workbook's own Scoring Guide wording; 2 and 4 get
// their own short in-between labels (not invented Excel content — just a
// plain-language midpoint) so every option looks filled in and consistent,
// rather than mixing worded options with bare numbers.
export function NPD_SCORE_OPTIONS(label1, label2, label3, label4, label5) {
  return [
    { value: "1", label: `1 — ${label1}` },
    { value: "2", label: `2 — ${label2}` },
    { value: "3", label: `3 — ${label3}` },
    { value: "4", label: `4 — ${label4}` },
    { value: "5", label: `5 — ${label5}` },
  ];
}

// The 4 manually-scored Gate 1 metrics — shared by NpdScorecardForm (used by
// both the New Request page and the request detail page's edit mode) so the
// anchor wording only has to be written once.
export const NPD_SCORECARD_METRIC_DEFS = [
  {
    key: "strategic_fit_score",
    label: "Strategic Fit",
    options: NPD_SCORE_OPTIONS(
      "Weak / opportunistic",
      "Limited strategic value",
      "Supports an established strategic priority",
      "Strong strategic fit",
      "Critical to a major strategic priority"
    ),
  },
  {
    key: "customer_market_value_score",
    label: "Customer / Market Value",
    options: NPD_SCORE_OPTIONS(
      "Small/niche opportunity",
      "Modest customer or market value",
      "Meaningful customer or market growth",
      "Significant customer or market growth",
      "Major customer, market entry or scalable platform"
    ),
  },
  {
    key: "complexity_score",
    label: "Complexity (easy to execute scores HIGH)",
    options: NPD_SCORE_OPTIONS(
      "Very complex / major changes",
      "Fairly complex",
      "Moderate complexity",
      "Mostly straightforward",
      "Fits current capabilities / simple execution"
    ),
  },
  {
    key: "speed_to_market_score",
    label: "Speed to Market (fast scores HIGH)",
    options: NPD_SCORE_OPTIONS("More than 9 months", "6–9 months", "3–6 months", "90 days – 3 months", "Less than 90 days"),
  },
];

// Channel values as actually used across the Launch Scorecard workbook's
// real rows (Co-man, Retail, Foodservice, Industrial Sales — one entry had
// a typo, "Industial Sales", normalized here). The workbook itself left this
// column as free text with no dropdown, but a fixed list keeps new entries
// consistent going forward.
export const NPD_CHANNEL_OPTIONS = [
  { value: "Co-man", label: "Co-man" },
  { value: "Retail", label: "Retail" },
  { value: "Foodservice", label: "Foodservice" },
  { value: "Industrial Sales", label: "Industrial Sales" },
];

// Gate 2 — Action Tracker (rebuilt 2026-11-15, same day, from Garima's
// dedicated Second_Gate_Action_Tracker.xlsx). This REPLACES the earlier
// fixed 8-item "Launch Gate" checklist (NPD_GATE2_ITEM_DEFS, now removed)
// with a flexible task/action tracker: any number of tasks per request,
// each with a free-text owner/department, a status, a priority, dates, a
// progress percentage, dependencies on other tasks, and a milestone flag.
// Mirror the status/priority value lists exactly against the backend's
// GATE2_TASK_STATUSES / GATE2_TASK_PRIORITIES in npdGate2.service.js.
export const NPD_GATE2_TASK_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

export function npdGate2TaskStatusBadgeClass(status) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "blocked":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "on_hold":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    default:
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export const NPD_GATE2_TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function npdGate2TaskPriorityBadgeClass(priority) {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200";
    case "low":
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  }
}

// Gantt-bar coloring by status, used by the mini Gantt view in
// NpdGate2Panel.jsx — mirrors the source workbook's "Legend" row on its
// Gantt View tab (Not Started/In Progress/On Hold/Blocked/Completed).
export function npdGate2TaskBarColor(status) {
  switch (status) {
    case "completed":
      return "#16A34A";
    case "blocked":
      return "#DC2626";
    case "on_hold":
      return "#D97706";
    case "in_progress":
      return "#2563EB";
    default:
      return "#94A3B8";
  }
}

// The fuller decision vocabulary the workbook's own "Decision" field
// describes (richer than Gate 1's Approved/Rejected/Hold) — used for the
// formal Gate 2 sign-off once all 8 items above are Ready/Not Applicable.
export const NPD_GATE2_DECISION_OPTIONS = [
  { value: "approved", label: "Approve", className: "bg-emerald-600 text-white hover:opacity-90" },
  { value: "conditional_approval", label: "Conditional Approval", className: "bg-teal-600 text-white hover:opacity-90" },
  { value: "rework", label: "Needs Rework", className: "bg-amber-500 text-white hover:opacity-90" },
  { value: "hold", label: "Hold", className: "border border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300" },
  { value: "rejected", label: "Reject", className: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300" },
];

export function npdGate2DecisionBadge(status) {
  const labels = {
    pending_review: ["Pending Gate 2 review", "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"],
    approved: ["Gate 2 Approved", "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"],
    conditional_approval: ["Gate 2 — Conditional Approval", "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"],
    rework: ["Gate 2 — Needs Rework", "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"],
    hold: ["Gate 2 — Hold", "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"],
    rejected: ["Gate 2 Rejected", "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"],
  };
  return labels[status] || ["Not yet submitted for Gate 2", "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"];
}
