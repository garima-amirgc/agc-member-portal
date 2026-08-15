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

// Lightweight, step-specific field sets for the "submit" steps so the form
// captures something more useful than a bare notes box. Any step not listed
// here falls back to a single Notes textarea.
export const NPD_STEP_FORM_FIELDS = {
  // Mirrors the fields captured on NpdNewRequestPage. Used when step 1 needs
  // to be edited and resubmitted — e.g. after a later approver sends the
  // request back with "request changes", which rewinds the workflow to
  // step 1 so the submitter can fix it.
  new_product_request: [
    { key: "customer_name", label: "Customer name", type: "text" },
    { key: "customer_number", label: "Customer number", type: "text" },
    { key: "customer_contact", label: "Customer contact", type: "text" },
    { key: "product_name", label: "Product name", type: "text" },
    { key: "product_description", label: "Product description", type: "textarea" },
    {
      key: "request_type",
      label: "Request type",
      type: "select",
      options: [
        { value: "new_product", label: "New product" },
        { value: "existing_product_modification", label: "Existing product modification" },
      ],
    },
    { key: "plant", label: "Plant", type: "text" },
    { key: "requested_launch_date", label: "Requested launch date", type: "date" },
    { key: "estimated_volume", label: "Estimated volume", type: "text" },
    { key: "packaging_requirement", label: "Packaging requirement", type: "text" },
    { key: "general_comments", label: "General comments", type: "textarea" },
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
