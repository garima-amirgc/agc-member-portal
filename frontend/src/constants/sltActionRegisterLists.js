// SLT Tracker — Action Register dropdown option lists.
//
// Extracted from the uploaded source workbook's "Lists & Controls" sheet
// (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx) — the
// dropdown lists its Action Register sheet validates each column against.
// Status/Priority/Risk Impact/Escalation Required must stay in sync with
// the matching arrays in backend/src/services/sltActionRegister.service.js,
// which validates against them server-side (the Flag/Active Record/overdue
// logic there, and the Board Summary/Executive Dashboard logic in
// sltActionAnalytics.js, both key off these exact strings). Category,
// Owner, Strategic Objective, Financial Impact, and ASP Readiness Stream
// are shown as suggestions only (free text allowed, same as Category/
// Executive(s) on the Master Calendar form) — the workbook's own "Other"
// entries in Category/Owner show that even the source sheet didn't treat
// those as a closed set.

export const STATUS_OPTIONS = [
  "Not Started",
  "Assigned",
  "In Progress",
  "Waiting on Assignee",
  "Waiting on Information",
  "At Risk",
  "Stuck",
  "Deferred",
  "Completed",
  "Cancelled",
  "Visibility Only",
  "Gathering Info",
  "Waiting on Decision",
];

export const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

export const RISK_IMPACT_OPTIONS = ["High", "Medium", "Low"];

export const ESCALATION_OPTIONS = ["Yes", "No"];

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
  "Internal Communication",
  "Other",
];

export const FINANCIAL_IMPACT_OPTIONS = ["<$10K", "$10K-$50K", "$50K-$250K", ">$250K", "Unknown / TBD"];

export const ASP_READINESS_STREAM_SUGGESTIONS = [
  "Licensing",
  "Construction",
  "Operations Readiness",
  "HR Readiness",
  "Training",
  "ERP",
  "Capital Spend",
  "Customer Transition",
  "Risk Register",
  "N/A",
];

export const CATEGORY_SUGGESTIONS = [
  "Operations",
  "Finance",
  "People & Culture",
  "Commercial",
  "Customer",
  "Projects",
  "Risk & Compliance",
  "Governance & Controls",
  "ASP Go-Live",
  "Sierra",
  "Year-End Gala",
  "Sales",
  "IT",
  "Human Resources",
  "Compensation",
  "AQM",
  "Other",
];

export const OWNER_SUGGESTIONS = ["Tony", "Sandy", "Sherry", "Dave", "Adam", "Tom", "Gene", "Maurizio", "Colin", "Carol", "SLT", "Other"];
