import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { hasAnyAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import SltTrackerV2 from "./SltTrackerV2";
import SltActionTrackerBoard from "./SltActionTrackerBoard";
import SltDecisionBoard from "./SltDecisionBoard";
import SltCommitmentBoard from "./SltCommitmentBoard";

// This page used to also hold an "Incident Report" tab, picked via a tab bar
// alongside "SLT Master Calendar & Tracker" on one combined page/nav item
// ("SLT and Incident Tracker"). Split into its own nav item and page at the
// user's explicit request ("make a separate nav item for Incident Report...
// so this nav item is just for SLT master calendar and tracker") — see
// IncidentTrackerPage.jsx (mounted at /incident-tracker) for everything that
// moved: facilities, severity meta, the native incident CRUD dashboard/form,
// and their shared chart helpers. This page (still mounted at /cfo) is now
// SLT-only, so the top-level tab bar and per-tab grant filtering are gone —
// access is enforced once, at the route, by this page's ProtectedRoute in
// App.jsx (CFO / slt_view / slt_edit).

// The page holds four views, picked with a radio button:
//   - "SLT Master Calendar" — everything that used to be the whole page
//     (Calendar / Lists / Read Me / Administration), via SltTrackerV2 below.
//   - "Action Tracker" — Board Summary / Executive Dashboard / Action
//     Register, via SltActionTrackerBoard.jsx.
//   - "Decisions" — Decision Queue / Decision Register, via
//     SltDecisionBoard.jsx.
//   - "90 Day Commitments" — the full commitment register, via
//     SltCommitmentBoard.jsx, built from the uploaded workbook's
//     "90-Commitments" sheet (CommitmentsTable).
// "Action Tracker" and "Decisions" used to be combined under one "SLT
// Tracker" radio choice (as a top-level tab bar inside
// SltActionTrackerBoard.jsx's own default export) — split into their own
// radio choices here at the user's explicit request, so each is reachable
// in one click instead of two.
const SLT_VIEWS = [
  { key: "master_calendar", label: "SLT Master Calendar" },
  { key: "action_tracker", label: "Action Tracker" },
  { key: "decisions", label: "Decisions" },
  { key: "commitments", label: "90 Day Commitments" },
];

// SLT Tracker legacy combined list (SltPerformanceDashboard, SltCombinedList,
// SltItemCard, SltPersonRow, SltItemFormModal, and their helpers) was
// already dead code — SltTrackerV2 fully replaced it and nothing rendered
// these any more. Removed along with the rest of the Action Tracker
// Executive Board / legacy SLT report system by explicit request
// ("completely remove this... delete everything related to this").

export default function CfoReportsPage() {
  const { user } = useAuth();
  const canEditSlt = hasAnyAdminGrant(user, [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_EDIT]);
  // Which of the two SLT views is showing — defaults to the Master Calendar
  // since that's the one with real content today; "tracker" is a scaffold.
  const [sltView, setSltView] = useState("master_calendar");

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="SLT Master Calendar & Tracker" />

      <fieldset className="mb-4 flex flex-wrap items-center gap-5 rounded border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        <legend className="sr-only">SLT view</legend>
        {SLT_VIEWS.map((v) => (
          <label
            key={v.key}
            className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"
          >
            <input
              type="radio"
              name="slt-view"
              value={v.key}
              checked={sltView === v.key}
              onChange={() => setSltView(v.key)}
              className="h-4 w-4 accent-[#0B3EAF]"
            />
            {v.label}
          </label>
        ))}
      </fieldset>

      {sltView === "master_calendar" ? (
        // SLT Master Calendar — placeholder pending rebuild. The previous
        // build (Action Register, Decision Queue + Register, 90-Day
        // Commitments, Executive Calendar, Dashboard, Weekly Review, and the
        // backend's /cfo/slt/v2/* routes/services) was removed on request;
        // see SltTrackerV2.jsx for details. The old combined-list view above
        // (SltPerformanceDashboard etc.) is left in place, unused, rather
        // than deleted, in case it's needed for comparison.
        <SltTrackerV2 canEdit={canEditSlt} />
      ) : sltView === "action_tracker" ? (
        <SltActionTrackerBoard canEdit={canEditSlt} />
      ) : sltView === "decisions" ? (
        <SltDecisionBoard canEdit={canEditSlt} />
      ) : sltView === "commitments" ? (
        <SltCommitmentBoard canEdit={canEditSlt} />
      ) : null}
    </div>
  );
}
