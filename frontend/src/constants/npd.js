import { FACILITY_CODES } from "./facilities";

// The real production plants (Garima: "there are 3 plants AQM, SCF, ASP").
// Reuses the app's existing FACILITY_CODES list rather than a separate
// hardcoded one, minus "AGC" — that's the parent company code, not a plant.
export const NPD_PLANT_OPTIONS = FACILITY_CODES.filter((c) => c !== "AGC").map((c) => ({ value: c, label: c }));

// Mirrors backend/src/services/npdWorkflow.service.js STEP_DEFS. The
// backend is the source of truth for what's allowed — this is display-only.
// `skippable: false` on steps 1 and 3 mirrors NON_SKIPPABLE_STEP_NUMBERS on
// the backend (step 1 creates the request itself; step 3's PLU feeds later
// steps) — the server enforces this regardless, this just hides the button.
export const NPD_STEP_DEFS = [
  { number: 1, key: "new_product_request", name: "Create New Product Request", department: "Sales", type: "submit", skippable: false },
  { number: 2, key: "management_approval", name: "Management Approval", type: "approval", approvalType: "management_approval", skippable: true },
  { number: 3, key: "plu_creation", name: "PLU Creation Form", department: "Sales", type: "submit", skippable: false },
  { number: 4, key: "spec_sheet", name: "Complete Spec Sheet", department: "FSQA", type: "submit", skippable: true },
  { number: 5, key: "sample_request", name: "Sample Request", department: ["Sales", "Production"], type: "submit", skippable: true },
  { number: 6, key: "production_confirmation", name: "Production Confirmation", department: "Production", type: "submit", skippable: true },
  { number: 7, key: "finance_costing", name: "Finance Costing", department: "Finance", type: "submit", skippable: true },
  { number: 8, key: "finance_approval", name: "Finance Approval", type: "approval", approvalType: "finance_approval", skippable: true },
  { number: 9, key: "customer_approval", name: "Customer Approval", department: "Sales", type: "submit", skippable: true },
  { number: 10, key: "final_setup", name: "Final PLU / Routing / BOM Setup", department: "Sales", type: "submit", skippable: true },
  {
    number: 11,
    key: "final_verification",
    name: "Final Verification (FSQA / Production / Sales)",
    type: "multi_confirm",
    confirmations: ["FSQA", "Production", "Sales"],
    skippable: true,
  },
  { number: 12, key: "final_authorization", name: "Final Authorization", type: "approval", approvalType: "final_authorization", skippable: true },
  { number: 13, key: "first_shipment", name: "First Shipment Confirmation", department: "Sales", type: "submit", skippable: true },
];

// Shared 1–5 option list for the Gate 1 scorecard's manual scores. 1/3/5 are
// anchored to the Scoring Guide's own wording; 2 and 4 get their own short
// in-between labels (not invented Excel content — just a plain-language
// midpoint) so every option looks filled in and consistent, rather than
// mixing worded options with bare numbers.
export function NPD_SCORE_OPTIONS(label1, label2, label3, label4, label5) {
  return [
    { value: "1", label: `1 — ${label1}` },
    { value: "2", label: `2 — ${label2}` },
    { value: "3", label: `3 — ${label3}` },
    { value: "4", label: `4 — ${label4}` },
    { value: "5", label: `5 — ${label5}` },
  ];
}

// The 4 manual Gate 1 scores, as their own list — reused by both
// NPD_STEP_FORM_FIELDS.new_product_request (the generic resubmit-step
// editor) and NpdNewRequestPage's dedicated scorecard section with its live
// weighted-score preview, so the anchor wording only has to be written once.
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
// a typo, "Industial Sales", normalized here). The workbook itself left
// this column as free text with no dropdown, but a fixed list keeps new
// entries consistent going forward.
export const NPD_CHANNEL_OPTIONS = [
  { value: "Co-man", label: "Co-man" },
  { value: "Retail", label: "Retail" },
  { value: "Foodservice", label: "Foodservice" },
  { value: "Industrial Sales", label: "Industrial Sales" },
];

// Lightweight, step-specific field sets for the "submit" steps so the form
// captures something more useful than a bare notes box. Any step not listed
// here falls back to a single Notes textarea.
export const NPD_STEP_FORM_FIELDS = {
  // Mirrors the single unified Gate 1 — Launch Scorecard form on
  // NpdNewRequestPage (field set and order match the original Launch
  // Scorecard workbook's own columns: Product/SKU, Customer, Channel, Plant,
  // Start Date, Target Launch Date, then economics/scores/commercial
  // detail). Used when step 1 needs to be edited and resubmitted — e.g.
  // after a later approver sends the request back with "request changes",
  // which rewinds the workflow to step 1 so the submitter can fix it.
  new_product_request: [
    { key: "customer_name", label: "Customer", type: "text" },
    { key: "product_name", label: "Product / SKU", type: "text" },
    { key: "channel", label: "Channel", type: "select", options: NPD_CHANNEL_OPTIONS },
    { key: "plant", label: "Plant", type: "select", options: NPD_PLANT_OPTIONS },
    { key: "start_date", label: "Start date", type: "date" },
    { key: "requested_launch_date", label: "Target launch date", type: "date" },
    // Gate 1 launch scorecard — economics + qualitative scoring, so
    // Management Approval (step 2) has a weighted score/priority to act on
    // instead of a bare yes/no. The 4 manual scores reuse NPD_SCORE_OPTIONS
    // so the Scoring Guide's anchor wording lives in one place.
    { key: "annual_volume_kg", label: "Annual Volume (kg)", type: "number" },
    { key: "annual_revenue", label: "Annual Revenue ($)", type: "number" },
    { key: "annual_gp_dollars", label: "Annual GP$ ($)", type: "number" },
    { key: "gp_percent", label: "GP% (e.g. 11 for 11%)", type: "number" },
    ...NPD_SCORECARD_METRIC_DEFS.map((m) => ({ key: m.key, label: `${m.label} (1–5)`, type: "select", options: m.options })),
    { key: "capex_required", label: "CapEx Required ($)", type: "number" },
    { key: "customer_commitment", label: "Customer Commitment (e.g. Confirmed, RFP, Not Confirmed)", type: "text" },
    { key: "key_strategic_rationale", label: "Key Strategic Rationale", type: "textarea" },
    { key: "key_risks_comments", label: "Key Risks / Comments", type: "textarea" },
    { key: "decision", label: "SLT Decision (e.g. SLT Approved, Hold, Hold need more details)", type: "text" },
  ],
  plu_creation: [
    { key: "plu_number", label: "PLU number", type: "text" },
    { key: "uom", label: "Unit of measure", type: "text" },
    { key: "case_pack", label: "Case pack", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  spec_sheet: [
    { key: "ingredients", label: "Ingredients", type: "textarea" },
    { key: "nutrition_notes", label: "Nutrition / allergen notes", type: "textarea" },
    { key: "shelf_life", label: "Shelf life", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  sample_request: [
    { key: "sample_quantity", label: "Sample quantity", type: "text" },
    { key: "ship_to", label: "Ship to", type: "text" },
    { key: "needed_by", label: "Needed by", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  production_confirmation: [
    { key: "production_date", label: "Production date", type: "date" },
    { key: "line", label: "Production line", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  finance_costing: [
    { key: "unit_cost", label: "Unit cost", type: "text" },
    { key: "sell_price", label: "Sell price", type: "text" },
    { key: "margin_notes", label: "Margin notes", type: "textarea" },
  ],
  customer_approval: [
    {
      key: "customer_decision",
      label: "Customer decision",
      type: "select",
      options: [
        { value: "approved", label: "Customer approved" },
        { value: "rejected", label: "Customer did not approve" },
      ],
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  final_setup: [
    { key: "final_plu", label: "Final PLU", type: "text" },
    { key: "routing", label: "Routing", type: "text" },
    { key: "bom_reference", label: "BOM reference", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  first_shipment: [
    { key: "ship_date", label: "First ship date", type: "date" },
    { key: "customer_po", label: "Customer PO #", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const NPD_APPROVAL_TYPES = [
  { key: "management_approval", label: "Management Approval (Step 2)" },
  { key: "finance_approval", label: "Finance Approval (Step 8)" },
  { key: "final_authorization", label: "Final Authorization (Step 12)" },
];

export const NPD_REQUEST_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  waiting_approval: "Waiting on approval",
  in_progress: "In progress",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  customer_rejected: "Customer did not approve",
  authorized_for_production: "Authorized for production",
  completed: "Completed",
  cancelled: "Cancelled",
  on_hold: "On hold",
};

export function npdRequestStatusBadgeClass(status) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "rejected":
    case "customer_rejected":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "changes_requested":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "cancelled":
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "waiting_approval":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  }
}

export const NPD_STEP_STATUS_LABELS = {
  locked: "Not started",
  in_progress: "In progress",
  waiting_approval: "Waiting on approval",
  completed: "Completed",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  skipped: "Skipped",
};

export function npdStepStatusBadgeClass(status) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "skipped":
    case "rejected":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "changes_requested":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "in_progress":
    case "waiting_approval":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    default:
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export function npdStepDef(number) {
  return NPD_STEP_DEFS.find((s) => s.number === Number(number)) || null;
}

// Best-effort "who currently owns this" label for a step — submit steps
// carry an explicit department, approval steps don't (mapped by approval
// type instead), and the multi-confirm step lists all three departments at
// once. Used anywhere the board needs a single display label per step.
export function npdStepOwnerLabel(stepDef) {
  if (!stepDef) return "—";
  if (stepDef.type === "multi_confirm") return (stepDef.confirmations || []).join(" / ");
  if (stepDef.department) return Array.isArray(stepDef.department) ? stepDef.department.join(" / ") : stepDef.department;
  if (stepDef.type === "approval") return stepDef.approvalType === "finance_approval" ? "Finance" : "Management";
  return "—";
}

export const NPD_DEPARTMENT_FILTERS = ["Sales", "FSQA", "Production", "Finance", "Management"];

export function stepMatchesDepartmentFilter(stepDef, department) {
  if (!department) return true;
  return npdStepOwnerLabel(stepDef).split(" / ").includes(department);
}
