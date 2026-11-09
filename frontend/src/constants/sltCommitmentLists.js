// SLT Tracker — "90 Day Commitments" dropdown option lists.
//
// Extracted from the uploaded source workbook's "90-Commitments" sheet and
// its "Lists & Controls" sheet (SLT_Action_Tracker_Board_Ready_Executive_
// v4_2026_Master_1.xlsx) — the x14:dataValidation ranges that sheet's own
// RAG Status (column E, 'Lists & Controls'!$AG$2:$AG$4) and Extension
// Approved By (column O, 'Lists & Controls'!$O$5:$O$21) dropdowns validate
// against. RAG Status/Completion Status/Extension Approved By must stay in
// sync with the matching arrays in
// backend/src/services/sltCommitmentRegister.service.js, which validates
// against them server-side (the open/overdue/report-cue logic there, and in
// sltCommitmentAnalytics.js, both key off these exact strings). Owner is
// shown as a suggestion only (free text allowed) — reusing Action
// Register's own OWNER_SUGGESTIONS list, since every real owner found in
// the 90-Commitments sheet (Adam, Dave, Gene, Maurizio, Tom, Tony) is
// already on it.
export { OWNER_SUGGESTIONS } from "./sltActionRegisterLists";

// The sheet's own three RAG Status options, with the leading emoji
// stripped (the UI renders its own colored badge from the plain text
// instead, same convention as Action Register's Priority/Risk badges).
export const RAG_STATUS_OPTIONS = ["Not Started / At Risk", "In Progress / Carried Forward", "Met / On Track"];

export const COMPLETION_STATUS_OPTIONS = ["Open", "Closed"];

// Closed list, not free text — mirrors the sheet's own enforced "Not
// Authorized Approver" data-validation error message on this column.
export const EXTENSION_APPROVER_OPTIONS = ["Tony", "Sherry", "Adam", "Tom"];
