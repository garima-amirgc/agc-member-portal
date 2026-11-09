// SLT Tracker — "Decisions" tab — Decision Queue / Decision Register
// dropdown option lists.
//
// Extracted from the uploaded source workbook's "Lists & Controls" sheet
// (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx) — the
// same x14:dataValidation ranges that feed the Decision Queue and Decision
// Register sheets' own dropdowns (both sheets validate against the exact
// same ranges, confirmed column-for-column). Status/Decision Type/CEO-CFO
// Attention/Financial Impact/Risk Impact/Further Action Required must stay
// in sync with the matching arrays in
// backend/src/services/sltDecisionRegister.service.js, which validates
// against them server-side. Workstream/Assigned To/Owned By/Requested By/
// Strategic Objective are shown as suggestions only (free text allowed) —
// same convention as Action Register's Category/Owner.
//
// Status, Financial Impact, and Risk Impact are the exact same lists
// Action Register uses, so they're imported from there rather than
// duplicated — one source of truth for "what counts as Completed", etc.
export { STATUS_OPTIONS, FINANCIAL_IMPACT_OPTIONS, RISK_IMPACT_OPTIONS, OWNER_SUGGESTIONS as PEOPLE_SUGGESTIONS } from "./sltActionRegisterLists";

export const DECISION_TYPE_OPTIONS = [
  "Information Only",
  "Recommendation Required",
  "Approval Required",
  "Capital Approval",
  "Policy Approval",
  "Strategic Decision",
  "Governance Decision",
];

export const CEO_CFO_ATTENTION_OPTIONS = ["CEO", "CFO", "CEO & CFO", "SLT", "No", "President", "VP OPS"];

export const FURTHER_ACTION_OPTIONS = ["Yes", "No"];

// Decision Queue/Register's own "Workstream" list (Lists & Controls!K) —
// narrower than Action Register's Category suggestions, so kept separate
// rather than reusing CATEGORY_SUGGESTIONS.
export const WORKSTREAM_SUGGESTIONS = [
  "Operations",
  "Finance",
  "People & Culture",
  "Commercial",
  "Projects",
  "Risk & Compliance",
  "Governance",
  "ASP Go-Live",
  "Sierra",
  "Other",
];

// Decision Queue/Register's own "Strategic Objective" list (Lists &
// Controls!F) — same set as Action Register's, slightly different order in
// the source sheet, kept faithful to this sheet's own extraction.
export const STRATEGIC_OBJECTIVE_SUGGESTIONS = [
  "ASP Go-Live",
  "Sierra Growth",
  "Cost Reduction",
  "Federal Licence",
  "Food Safety",
  "Culture",
  "Governance",
  "Commercial Growth",
  "People & Culture",
  "Other",
  "Internal Communication",
];
