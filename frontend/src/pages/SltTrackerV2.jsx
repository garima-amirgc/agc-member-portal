import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAdministrator } from "../utils/adminAccess";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import ActionTrackerBoard from "../components/ActionTrackerBoard";

/**
 * SLT Tracker — rebuild in progress, built step by step per instructions.
 *
 * Step 1: a choice between the two source boards this tracker covers —
 * Action Tracker Executive Board and Master Calendar.
 *
 * Step 2 (this one): Master Calendar is wired up to the backend's
 * /cfo/slt/v2/calendar routes (sltCalendar.service.js / slt_calendar
 * table). Field set, column order, and the two computed columns (Days
 * Until Event, Prep Days Left) all mirror the source workbook's "Master
 * Calendar" sheet exactly — see sltCalendar.service.js for the field
 * mapping. Event Date accepts either a real date ("2026-08-19") or a text
 * range ("Oct 17-21, 2026"), same as the sheet allows. Category,
 * Executive(s), and Month are free text with suggestions drawn from the
 * workbook's Lists sheet, not locked dropdowns — matching the house
 * pattern already used for status fields elsewhere in this app (status
 * vocabulary isn't forced into a fixed list).
 *
 * Step 3 (this one): the workbook's other sheets, nested under Master
 * Calendar as sub-tabs (Calendar / Lists / Read Me) — they're all facets
 * of the same workbook, not separate boards:
 *   - Lists: the workbook's reference/lookup sheet. Shown read-only here;
 *     its Categories/Executives/Months values already power the
 *     suggestion dropdowns on the Add/Edit form above. Its Statuses and
 *     Risk Levels columns aren't wired to anything — the Master Calendar
 *     sheet itself has no Status or Risk column, so there's nothing in
 *     the data for those two lists to apply to.
 *   - Read Me: shown as-is. It references two sheets ("Monthly Exec
 *     View", "Calendar Export") that don't exist in the uploaded
 *     workbook — flagged inline rather than silently ignored.
 * Lists and Read Me are admin-only (see ADMIN_ONLY_SUB_TAB_KEYS below) —
 * everyone else just sees Calendar.
 *
 * Step 3b: Master Calendar originally also had its own Weekly Review
 * sub-tab (a reconstruction of the source sheet's broken
 * `=FILTER('Master Calendar'!A3:M104, 'Master Calendar'!#REF!="Include",
 * ...)` formula — the column it filtered on was deleted from Master
 * Calendar at some point, so Excel shows #REF! there too). It was removed
 * by explicit request, leaving just Calendar / Lists / Read Me. (Action
 * Tracker Executive Board has its own, unrelated Weekly Review sub-tab —
 * see components/ActionTrackerBoard.jsx — which this did not touch.)
 *
 * Step 4 (this one): Action Tracker Executive Board is now built out too
 * — see components/ActionTrackerBoard.jsx for the full sub-tab set
 * (Dashboard, Action Register, Decisions, 90-Day Commitments, Weekly
 * Review, Reference) and the backend services it talks to
 * (sltActions/sltDecisions/sltCommitments/sltOverview/sltAudit.service.js).
 *
 * The "SLT Tracker" tab mount point (CfoReportsPage.jsx) and the
 * slt_view/slt_edit grants were kept from the previous build. The other
 * database tables from the previous build (actions, decisions,
 * commitments, etc.) still exist (empty) in case they're reused later —
 * see the DB config for the full list.
 */
const SLT_TRACKER_VIEWS = [
  { key: "master_calendar", label: "Master Calendar" },
  { key: "action_tracker", label: "Action Tracker Executive Board" },
];

const MONTH_SUGGESTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CATEGORY_SUGGESTIONS = [
  "Governance",
  "Finance",
  "People / HR",
  "Operations",
  "Commercial",
  "Compliance",
  "Board",
  "Events",
  "Travel",
  "Legal / Insurance",
  "Strategy",
  "Customer",
  "Communication",
  "FSQA",
];

const EXECUTIVE_SUGGESTIONS = [
  "CEO",
  "CFO",
  "President",
  "CEO / CFO",
  "CEO / President",
  "CFO / Finance",
  "HR / CEO",
  "Operations / President",
  "All Executives",
  "SLT",
];

// The workbook's "Lists" sheet, read-only reference display. Categories,
// Executives, and Months already power the suggestion dropdowns above;
// Statuses and Risk Levels are shown for completeness but aren't wired to
// anything — Master Calendar has no Status or Risk column to apply them to.
const REFERENCE_LISTS = [
  { label: "Statuses", values: ["Not Started", "In Progress", "Ready", "Deferred", "Completed", "At Risk", "Cancelled"] },
  { label: "Categories", values: CATEGORY_SUGGESTIONS },
  { label: "Risk Levels", values: ["Low", "Medium", "High"] },
  { label: "Executives", values: EXECUTIVE_SUGGESTIONS },
  { label: "Digital Calendar", values: ["Yes", "No"] },
  { label: "Months", values: MONTH_SUGGESTIONS },
];

// The workbook's "Read Me" sheet, verbatim.
const READ_ME_ITEMS = [
  {
    heading: "Purpose",
    body: "This workbook is a draft EA control calendar for tracking executive events, deadlines, prep work, ownership, materials, and weekly follow-up.",
  },
  {
    heading: "Recommended workflow",
    body: 'Maintain all events in Master Calendar. Use Monthly Exec View for a clean monthly briefing. Use Weekly Review to see what needs attention in the next 14 days or is overdue/at risk.',
  },
  {
    heading: "Digital calendar",
    body: "Use Calendar Export to create Outlook/Google calendar entries for key dates only. Do not put every tracker note on the calendar.",
  },
  {
    heading: "Do not delete deferred items",
    body: "Keep deferred items in Master Calendar and update the Return/Notes fields. Only remove items from the weekly agenda view if they are not due this week.",
  },
  {
    heading: "Suggested owner",
    body: "The EA owns the workbook structure; each functional owner owns their event inputs, materials, and deadlines.",
  },
];

// Form fields are kept in lockstep with the table columns on purpose — the
// workbook also had Month/Prep Start/Prep Deadline/Materials Needed/Notes
// fields, but those were dropped from the table earlier, and per explicit
// request the Add/Edit form should only collect what the table displays.
// "Created by" isn't here because it's never a form field — createCalendarEvent
// sets it server-side from the logged-in user (see sltCalendar.service.js).
const CALENDAR_FIELDS = [
  { key: "event_date", label: "Event Date", type: "event_date", required: true },
  { key: "event_title", label: "Event", type: "text", required: true },
  { key: "category", label: "Category", type: "select_other", suggestions: CATEGORY_SUGGESTIONS },
  { key: "executives", label: "Executive(s)", type: "select_other", suggestions: EXECUTIVE_SUGGESTIONS },
  { key: "owner_lead", label: "Owner / Lead", type: "text" },
  { key: "executive_action_required", label: "Executive Action Required", type: "text" },
];

function fieldDefault(type) {
  return "";
}

function emptyFormValues() {
  const v = {};
  for (const f of CALENDAR_FIELDS) v[f.key] = fieldDefault(f.type);
  return v;
}

function fmtDate(d) {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return String(d);
}

function fmtDays(n) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "Today";
  if (n > 0) return `${n}d`;
  return `${Math.abs(n)}d ago`;
}

// Event Date display — day + date only, never a time or timezone. Handles
// three shapes: a clean ISO date ("2026-08-19"), a genuine text range
// ("Oct 17-21, 2026", left as-is since it's not a single date), and a
// leftover full JS Date string from an earlier import bug
// ("Tue Aug 18 2026 20:00:00 GMT-0400 (Eastern Daylight Time)") — reparsed
// and reformatted rather than shown raw.
function fmtEventDate(raw, isTextRange) {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00`);
    return dt.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }
  if (!isTextRange) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    }
  }
  return s;
}

// Same visual language as the IT Ticket Board (ItTicketsMonitorTable.jsx):
// colored pill badges, a gradient stat header, and expandable row-cards
// instead of a wide table — so nothing here ever needs horizontal scroll.
// No "truncate" here on purpose — category/executive pills wrap instead of
// clipping, same "nothing gets cut off" rule as the rest of this board.
// rounded-md, not rounded-full/capsule: a fully-rounded pill looks fine for
// one short word, but stretches into an ugly lumpy blob once text wraps to
// two or three lines (which is exactly what a long "CEO / CFO / VP OPS /
// PRESIDENT" string did) — see PillGroup below, which also avoids that by
// splitting a "/"-separated value into several short individual chips
// instead of one long wrapped one.
// Request: "why Operations is going out of the green box" — all-caps text
// with the browser's default line-height sits slightly toward the top of
// its own line box (caps have no descenders, but line-height still reserves
// descender space below the baseline), so a pill with tight symmetric
// padding (py-0.5 = 2px) reads as having almost no margin above the letters
// and more below — against the Category/Executive(s) columns' new tinted
// cell background (see calBodyColBg) that imbalance became visible as text
// "spilling out" of the pill. Fixed with `leading-none` (collapses the line
// box down to the font's own cap height, removing the reserved descender
// gap) plus a bit more padding all around, so there's a clear, even margin
// between the text and the pill's rounded edge on every side.
const PILL_BASE = "inline-flex min-w-0 max-w-full items-center whitespace-normal break-words rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide leading-none";

const PILL_PALETTE = [
  "bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800",
  "bg-violet-100 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800",
  "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800",
  "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800",
  "bg-orange-100 text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-800",
  "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:ring-fuchsia-800",
  "bg-blue-100 text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800",
];

// Category/Executive(s) are open free text, not a fixed small set like IT
// ticket issue types, so colors are assigned deterministically by hashing
// the text — the same value always gets the same color.
function pillClassFor(text) {
  const s = String(text || "").trim();
  if (!s) return "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PILL_PALETTE[hash % PILL_PALETTE.length];
}

// Category and Executive(s) are both sometimes a single value ("FSQA") and
// sometimes a "/"-separated list ("CEO / CFO / VP OPS / PRESIDENT"). A list
// rendered as one pill has to wrap its own text across multiple lines,
// which looks like a stretched blob (reported — see the PILL_BASE comment
// above). Splitting it into one short chip per value instead, wrapping at
// the chip level via flex-wrap, reads as a clean tag group no matter how
// many values there are. All chips for one cell share a color (hashed off
// the original full string) so they still read as one field at a glance;
// a different row with different executives gets a different color.
function splitMultiValue(text) {
  return String(text || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

// A flat gray style, no hashed color — used for Category per explicit
// request ("you didn't remove light green and blue color from the category
// background?" — the colored pill fill itself was what read as "background
// color", not the table cell behind it, which was already made neutral in
// an earlier fix). Executive(s) keeps the hashed color palette; only
// Category is affected by the `neutral` prop below.
const PILL_NEUTRAL = "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15";

function PillGroup({ text, neutral = false }) {
  const parts = splitMultiValue(text);
  if (parts.length === 0) return <span className="text-slate-400">—</span>;
  const cls = neutral ? PILL_NEUTRAL : pillClassFor(text);
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {parts.map((part, i) => (
        <span key={`${part}-${i}`} className={`${PILL_BASE} ${cls}`}>
          {part}
        </span>
      ))}
    </div>
  );
}

// Overdue (red) / due within 14 days (amber) / later or unknown (slate) —
// same traffic-light pattern as the IT ticket priority badge.
function dueBadgeClass(days) {
  if (days === null || days === undefined) {
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  }
  if (days < 0) return "bg-red-100 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  if (days <= 14) return "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
}

function StatPill({ label, value, accent }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${accent}`}>
      {value}
      <span className="font-semibold opacity-80">{label}</span>
    </span>
  );
}

function DetailField({ label, value, className = "" }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{value || "—"}</div>
    </div>
  );
}

// Small round icon button — used for the always-visible Edit/Delete
// controls on each event (table row and card), so a user with access never
// has to expand a row first to find them.
function IconButton({ onClick, label, tone = "neutral", children }) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
      : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

const EDIT_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DELETE_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

// Request: "design this table just like it ticket board table" — this is the
// IT Ticket Board's TicketRowActions, same stacked-text-button card (instead
// of the round icon buttons used before), in place in the Master Calendar
// table's Actions column. Row clicks elsewhere toggle the expand panel (see
// CalendarEventTableRow's <tr onClick>), so both buttons stop propagation.
const CAL_ACTION_BTN_STACK =
  "flex h-7 w-full items-center justify-center whitespace-nowrap px-2 text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF]/35 disabled:opacity-50";

function CalendarRowActions({ onEdit, onDelete }) {
  return (
    <div
      className="flex w-full max-w-[5.25rem] flex-col divide-y divide-slate-200/90 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-[#1a1a1a]"
      role="group"
      aria-label="Event actions"
    >
      <button
        type="button"
        className={`${CAL_ACTION_BTN_STACK} text-[#0B3EAF] hover:bg-[#0B3EAF]/5 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className={`${CAL_ACTION_BTN_STACK} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        Delete
      </button>
    </div>
  );
}

// A professional confirm dialog, in place of the browser's native
// window.confirm() — used before any irreversible action (currently just
// permanently deleting a calendar event).
function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel }) {
  // Portaled to document.body: this page's own root wrapper is the shared
  // `.card` class, which carries Tailwind's `transition` utility. That
  // utility's default transition-property list includes transform/filter/
  // backdrop-filter, which makes Chrome/Firefox treat `.card` as a
  // containing block for `position: fixed` descendants instead of the
  // viewport — so without the portal this dialog renders clipped/offset
  // relative to the scrolled page instead of as a true full-screen overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onCancel} disabled={busy}>
            Cancel
          </GhostButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0B3EAF] hover:bg-[#0a3399]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Shown after a dry-run import pass, before anything is actually written —
// lets the person confirm the counts look right (how many new rows, how
// many existing rows would change) before committing. Same portal pattern
// as ConfirmDialog above, just with a richer body.
function ImportPreviewModal({ preview, busy, onConfirm, onCancel }) {
  const details = Array.isArray(preview?.details) ? preview.details : [];
  const shown = details.slice(0, 12);
  const extra = details.length - shown.length;
  const totalChanges = (preview?.inserted || 0) + (preview?.updated || 0);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Review import</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Nothing has been saved yet — this is a preview of what will happen if you continue.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-emerald-50 p-2 text-center dark:bg-emerald-950/30">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{preview?.inserted ?? 0}</div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">new</div>
          </div>
          <div className="rounded-md bg-amber-50 p-2 text-center dark:bg-amber-950/30">
            <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{preview?.updated ?? 0}</div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80">updated</div>
          </div>
          <div className="rounded-md bg-slate-100 p-2 text-center dark:bg-white/10">
            <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{preview?.unchanged ?? 0}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">unchanged</div>
          </div>
          <div className="rounded-md bg-slate-100 p-2 text-center dark:bg-white/10">
            <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{preview?.skippedBlank ?? 0}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">blank rows</div>
          </div>
        </div>

        {shown.length ? (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
            {shown.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5 text-xs last:border-b-0 dark:border-slate-800"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">{d.title}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                    d.action.includes("insert")
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {d.action}
                </span>
              </div>
            ))}
            {extra > 0 ? (
              <div className="px-2.5 py-1.5 text-center text-[11px] text-slate-400">and {extra} more…</div>
            ) : null}
          </div>
        ) : null}

        {totalChanges === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nothing in this file is different from what's already here.
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onCancel} disabled={busy}>
            Cancel
          </GhostButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || totalChanges === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3EAF] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3399] disabled:opacity-50"
          >
            {busy ? "Importing…" : "Confirm import"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// One expandable card per event — collapsed shows date, title, and quick
// badges; expanded reveals the rest of the fields in a label/value grid.
// Never scrolls horizontally, unlike a wide multi-column table.
function CalendarEventCard({ event, onEdit, onDelete, expanded, onToggle, highlighted }) {
  const ev = event;
  const canEdit = !!ev.can_edit;
  return (
    <div
      id={`cal-event-${ev.id}`}
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition hover:border-[#0B3EAF]/30 dark:bg-slate-900 dark:hover:border-[#A7D344]/30 ${
        highlighted
          ? "border-[#0B3EAF] ring-2 ring-[#0B3EAF]/40 dark:border-[#A7D344] dark:ring-[#A7D344]/40"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex w-full items-start gap-2 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-expanded={expanded}>
          <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
            <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
              {fmtEventDate(ev.event_date, ev.is_text_date_range)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{ev.event_title}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {ev.category ? <PillGroup text={ev.category} neutral /> : null}
              {ev.executives ? <PillGroup text={ev.executives} /> : null}
              <span className={`${PILL_BASE} ${dueBadgeClass(ev.days_until_event)}`}>{fmtDays(ev.days_until_event)}</span>
            </div>
            {ev.owner_lead ? (
              <div className="mt-1.5 whitespace-normal break-words text-xs text-slate-500 dark:text-slate-400">Owner: {ev.owner_lead}</div>
            ) : null}
            {ev.executive_action_required ? (
              <div className="mt-0.5 whitespace-normal break-words text-xs text-slate-500 dark:text-slate-400">
                Action: {ev.executive_action_required}
              </div>
            ) : null}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
          {canEdit ? (
            <>
              <IconButton label="Edit event" onClick={() => onEdit(ev)}>
                {EDIT_ICON}
              </IconButton>
              <IconButton label="Delete event" tone="danger" onClick={() => onDelete(ev)}>
                {DELETE_ICON}
              </IconButton>
            </>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className={`inline-block text-xs transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Owner / Lead" value={ev.owner_lead} />
            <DetailField label="Executive Action Required" value={ev.executive_action_required} />
            <DetailField label="Created by" value={ev.created_by_name} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Same per-column tinted-header / tinted-zebra-row look as the IT Ticket
// Board (ItTicketsMonitorTable.jsx's thClass/tdClass/HEADER_COL_BG/bodyColBg/
// vline) — each column gets its own faint color family, alternating with row
// zebra, plus a thin divider between columns. An earlier pass here had
// dropped the per-column tint in favor of flat zebra only, over concern that
// a short cell (e.g. a single-word Category) would sit in a tall mostly-empty
// colored block next to a long wrapped Executive(s) cell — per explicit
// request to match the IT Ticket Board look again, that's reinstated below.
const CAL_TH_BASE = "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const CAL_TD_BASE = "px-3 py-3 align-top text-xs leading-relaxed text-slate-700 dark:text-slate-200";

function calVline(isLast) {
  return isLast ? "" : "border-r border-slate-200 dark:border-slate-600/55";
}

// One color family per column, same approach as the IT Ticket Board's
// HEADER_COL_BG map.
// Request: "if you are not able to fix this background color then remove
// them from the category" — the tinted Category header/cell background kept
// reading as the pill's green/blue "spilling out" of its box even after the
// padding fix, so Category is reverted to the plain neutral header color
// (same gray every other untinted column used before this per-column
// scheme existed) rather than keep chasing it.
const CAL_HEADER_COL_BG = {
  date: "bg-slate-200/70 dark:bg-slate-800",
  title: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  category: "bg-slate-100/85 dark:bg-slate-800/70",
  executives: "bg-violet-100/45 dark:bg-violet-950/30",
  owner: "bg-emerald-100/55 dark:bg-emerald-950/35",
  action: "bg-sky-100/55 dark:bg-sky-950/35",
  createdBy: "bg-slate-200/55 dark:bg-slate-800/80",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

// Same column, one shade lighter, alternating by row (zebra) — the IT
// Ticket Board's bodyColBg, with the column keys renamed to the Calendar's.
function calBodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    date: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    title: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    category: alt ? "bg-slate-50 dark:bg-white/[0.03]" : "bg-white dark:bg-transparent",
    executives: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    owner: alt ? "bg-emerald-50/90 dark:bg-emerald-950/20" : "bg-emerald-50/50 dark:bg-emerald-950/10",
    action: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    createdBy: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    actions: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
  };
  return `${map[col] || (alt ? "bg-[#eef3fa]" : "bg-white")} transition-colors group-hover:brightness-[0.97] dark:group-hover:brightness-110`;
}

function calThClass(col, extra = "", isLast = false) {
  return [CAL_TH_BASE, CAL_HEADER_COL_BG[col] || "", calVline(isLast), extra].filter(Boolean).join(" ");
}

function calTdClass(col, rowIdx, extra = "", isLast = false) {
  return [CAL_TD_BASE, calBodyColBg(col, rowIdx), calVline(isLast), extra].filter(Boolean).join(" ");
}

// Desktop table view — columns match the Master Calendar sheet exactly:
// Event Date, Event/Deadline, Category, Executive(s), Owner/Lead, Executive
// Action Required, plus a "Created by" column showing whoever raised the
// event, and an always-visible Edit/Delete pair (no need to expand the row
// first) for anyone with access to this event. Same tinted-column /
// zebra-row look as the IT Ticket Board. Sized with table-fixed % widths,
// but — unlike the IT board — nothing here truncates or clamps: every
// cell wraps (whitespace-normal break-words), so a row simply grows
// taller to fit a long value instead of ever cutting text off. The
// expand-a-row panel is kept as a quick read-only summary of the same
// four text fields (handy since nothing truncates, there's no longer a
// hidden-text reason to open it, but it's harmless to leave in place).
function CalendarEventTableRow({ event, rowIdx, onEdit, onDelete, expanded, onToggle, highlighted }) {
  const ev = event;
  const canEdit = !!ev.can_edit;
  return (
    <>
      <tr
        id={`cal-event-${ev.id}`}
        className={`group cursor-pointer border-b transition-colors ${
          highlighted
            ? "border-[#0B3EAF]/60 bg-[#0B3EAF]/5 ring-1 ring-inset ring-[#0B3EAF]/40 dark:border-[#A7D344]/60 dark:bg-[#A7D344]/10 dark:ring-[#A7D344]/40"
            : "border-slate-200/80 dark:border-slate-700/50"
        }`}
        onClick={onToggle}
      >
        <td className={calTdClass("date", rowIdx, "w-[11%]")}>
          <div className="whitespace-normal break-words font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {fmtEventDate(ev.event_date, ev.is_text_date_range)}
          </div>
        </td>
        <td className={calTdClass("title", rowIdx, "w-[20%]")}>
          <div className="whitespace-normal break-words font-semibold leading-snug text-slate-900 dark:text-white">{ev.event_title}</div>
        </td>
        <td className={calTdClass("category", rowIdx, "w-[10%]")}>
          <PillGroup text={ev.category} neutral />
        </td>
        <td className={calTdClass("executives", rowIdx, "w-[10%]")}>
          <PillGroup text={ev.executives} />
        </td>
        <td className={calTdClass("owner", rowIdx, "w-[10%] whitespace-normal break-words")}>{ev.owner_lead || "—"}</td>
        <td className={calTdClass("action", rowIdx, "w-[15%] whitespace-normal break-words")}>
          {ev.executive_action_required || "—"}
        </td>
        <td className={calTdClass("createdBy", rowIdx, "w-[10%] whitespace-normal break-words")}>
          {ev.created_by_name || "—"}
        </td>
        <td className={calTdClass("actions", rowIdx, "w-[14%]", true)}>
          <div className="flex items-center justify-end gap-1.5">
            {canEdit ? (
              <CalendarRowActions
                onEdit={() => onEdit(ev)}
                onDelete={() => onDelete(ev)}
              />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
            <span className={`inline-block px-1 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
              ▾
            </span>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-slate-200/80 dark:border-slate-700/50">
          <td colSpan={8} className={`${calBodyColBg("title", rowIdx)} px-4 py-3`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Event" value={ev.event_title} />
              <DetailField label="Owner / Lead" value={ev.owner_lead} />
              <DetailField label="Executive Action Required" value={ev.executive_action_required} />
              <DetailField label="Created by" value={ev.created_by_name} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// Renders events as a real table on md+ screens (matching the source
// workbook's column order) and as expandable cards below md — same
// responsive split, and the same tinted-column visual language, as the IT
// Ticket Board. Neither view ever needs horizontal scroll: the table uses
// table-fixed % widths, and every cell wraps rather than truncating, so a
// row grows taller for long text instead of ever cutting it off.
function CalendarEventList({ events, onEdit, onDelete, expandedIds, onToggle, emptyMessage, highlightId }) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-700 dark:bg-white/[0.03]">
        <p className="text-sm italic text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2 md:hidden">
        {events.map((ev) => (
          <CalendarEventCard
            key={ev.id}
            event={ev}
            onEdit={onEdit}
            onDelete={onDelete}
            expanded={expandedIds.has(ev.id)}
            onToggle={() => onToggle(ev.id)}
            highlighted={Number(highlightId) === Number(ev.id)}
          />
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse border border-slate-200 text-xs dark:border-slate-600/50">
          <thead className="border-b-2 border-slate-300 dark:border-slate-600">
            <tr>
              <th className={calThClass("date", "w-[11%]")}>Event Date</th>
              <th className={calThClass("title", "w-[20%]")}>Event</th>
              <th className={calThClass("category", "w-[10%]")}>Category</th>
              <th className={calThClass("executives", "w-[10%]")}>Executive(s)</th>
              <th className={calThClass("owner", "w-[10%]")}>Owner / Lead</th>
              <th className={calThClass("action", "w-[15%]")}>Executive Action Required</th>
              <th className={calThClass("createdBy", "w-[10%]")}>Created by</th>
              <th className={calThClass("actions", "w-[14%] text-right", true)}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, rowIdx) => (
              <CalendarEventTableRow
                key={ev.id}
                event={ev}
                rowIdx={rowIdx}
                onEdit={onEdit}
                onDelete={onDelete}
                expanded={expandedIds.has(ev.id)}
                onToggle={() => onToggle(ev.id)}
                highlighted={Number(highlightId) === Number(ev.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
        props.className || ""
      }`}
    />
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#0B3EAF] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3399] disabled:opacity-50 ${
        props.className || ""
      }`}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 ${
        props.className || ""
      }`}
    >
      {children}
    </button>
  );
}

function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Event Date in the source sheet is almost always a real date, but one row
// ("SIAL Paris 2026") uses a text range ("Oct 17-21, 2026") instead — this
// gives a native calendar picker for the normal case, with a checkbox to
// switch to free text for the rare multi-day-range case.
function EventDateField({ value, onChange }) {
  const [rangeMode, setRangeMode] = useState(() => !!value && !isIsoDate(value));

  return (
    <div>
      {rangeMode ? (
        <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Oct 17-21, 2026" />
      ) : (
        <TextInput type="date" value={isIsoDate(value) ? value : ""} onChange={(e) => onChange(e.target.value)} />
      )}
      <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          checked={rangeMode}
          onChange={(e) => {
            setRangeMode(e.target.checked);
            onChange("");
          }}
          className="h-3 w-3"
        />
        Multi-day event — enter as a text range (e.g. "Oct 17-21, 2026") instead of a single date
      </label>
    </div>
  );
}

// A dropdown of preset values plus an explicit "Other" choice that reveals a
// free-text input — used for Category and Executive(s), which previously
// were a text input with a <datalist> of suggestions (technically already
// free-typeable, but that wasn't obvious from the UI). Request: "add an
// option other as well and when someone selects that allow user to add
// custom text." Mode is decided once on mount from the current value (same
// pattern as EventDateField's rangeMode above): a value that isn't one of
// the presets (including a pre-existing custom value when editing an event)
// starts in "other" mode with the text box already showing it.
function SelectWithOtherField({ value, options, onChange }) {
  const [mode, setMode] = useState(() => (value && !options.includes(value) ? "other" : "select"));

  return (
    <div>
      <select
        value={mode === "other" ? "__other__" : value || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") {
            setMode("other");
            onChange("");
          } else {
            setMode("select");
            onChange(v);
          }
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">— Select —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__other__">Other (type your own)…</option>
      </select>
      {mode === "other" ? (
        <TextInput
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a custom value"
          className="mt-1.5"
        />
      ) : null}
    </div>
  );
}

function FieldInput({ def, value, onChange }) {
  if (def.type === "event_date") {
    return <EventDateField value={value} onChange={onChange} />;
  }
  if (def.type === "textarea") {
    return (
      <textarea
        rows={2}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    );
  }
  if (def.type === "date") {
    return <TextInput type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (def.type === "select_other") {
    return <SelectWithOtherField value={value} options={def.suggestions} onChange={onChange} />;
  }
  return <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} />;
}

function CalendarEventFormModal({ title, initialValues, onClose, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState(() => ({ ...emptyFormValues(), ...initialValues }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save this calendar event."));
    } finally {
      setSaving(false);
    }
  };

  // Portaled to document.body for the same reason as ConfirmDialog above —
  // see the comment there. Without this, the modal is a DOM descendant of
  // this page's `.card` wrapper, which Tailwind's `transition` utility turns
  // into a containing block for `position: fixed`, clipping/offsetting the
  // modal's top behind the sticky top navbar instead of centering it over
  // the full viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CALENDAR_FIELDS.map((def) => (
            <div key={def.key} className={def.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {def.label}
                {def.required ? " *" : ""}
              </label>
              <FieldInput def={def} value={values[def.key]} onChange={(v) => setValues({ ...values, [def.key]: v })} />
              {def.help ? <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{def.help}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose} disabled={saving}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Weekly Review used to live here too (a reconstruction of the source
// workbook's broken FILTER-formula sheet) but was removed by explicit
// request — Master Calendar now only has the Calendar view plus the
// admin-only reference tabs below.
const MASTER_CALENDAR_SUB_TABS = [
  { key: "calendar", label: "Calendar" },
  { key: "lists", label: "Lists" },
  { key: "read_me", label: "Read Me" },
  { key: "administration", label: "Administration" },
];

// Lists, Read Me, and Administration are all admin-only: anyone granted
// slt_view/slt_edit/cfo access (including a non-admin member an admin
// delegated access to) sees just Calendar. Only an actual Admin-role
// account sees the rest. See isAdministrator() in utils/adminAccess.js.
const ADMIN_ONLY_SUB_TAB_KEYS = new Set(["lists", "read_me", "administration"]);

// Collapsed by default — click the header to open it. Keeps the screen from
// being wall-to-wall explanatory text while still surfacing every caveat for
// whoever wants to read it. (Same component/behavior as ActionTrackerBoard's
// NoteBanner — kept as its own copy here since this file doesn't import
// from that one.)
function NoteBanner({ children, label = "Note" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 overflow-hidden rounded border border-amber-200 bg-amber-50 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left font-semibold"
        aria-expanded={open}
      >
        <span>ⓘ {label}</span>
        <span className={`shrink-0 transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? <div className="border-t border-amber-200/70 px-2.5 py-2 dark:border-amber-900/50">{children}</div> : null}
    </div>
  );
}

function SubTabBar({ tabs, active, onChange }) {
  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/40">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            active === t.key
              ? "bg-white text-[#0B3EAF] shadow-sm dark:bg-slate-800 dark:text-[#A7D344]"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ListsView() {
  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        The workbook's "Lists" reference sheet, read-only. Categories, Executives, and Months already power the
        suggestions on the Add/Edit form; Statuses and Risk Levels are shown for completeness — Master Calendar has
        no Status or Risk column, so those two lists aren't wired to anything.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REFERENCE_LISTS.map((list) => (
          <div key={list.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{list.label}</h4>
            <div className="flex flex-wrap gap-1.5">
              {list.values.map((v) => (
                <span
                  key={v}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadMeView() {
  return (
    <div>
      <NoteBanner>
        This note mentions "Monthly Exec View" and "Calendar Export" — those two sheets aren't in the uploaded
        workbook (only Read Me, Master Calendar, Weekly Review, and Lists are), so those specific steps aren't
        available here.
      </NoteBanner>
      <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Executive Calendar Draft – How to Use</h3>
      <dl className="space-y-3">
        {READ_ME_ITEMS.map((item) => (
          <div key={item.heading}>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.heading}</dt>
            <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{item.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const SUBSCRIPTION_WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const SUBSCRIPTION_HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`,
}));

const SUBSCRIPTION_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "UTC", label: "UTC" },
];

const SUBSCRIPTION_SELECT_CLASS =
  "h-[38px] w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

// Admin-only "Administration" sub-tab — lets an Admin-role account turn on
// an automatic email of the whole Master Calendar (same file Export
// produces) on a schedule, instead of everyone relying on clicking Export
// themselves. See cfo.routes.js's GET/PATCH /slt/v2/calendar/subscription
// and sltCalendar.service.js's checkAndRunScheduledCalendarDigest for the
// backend half.
function SubscriptionAdminView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [banner, setBanner] = useState(null); // { tone: "ok" | "warn", text } | null

  const formFromSettings = (data) => ({
    enabled: !!data.enabled,
    frequency: data.frequency,
    day_of_week: data.day_of_week,
    day_of_month: data.day_of_month,
    send_hour: data.send_hour,
    timezone: data.timezone,
    recipient_mode: data.recipient_mode,
    recipient_emails_text: (data.recipient_emails || []).join("\n"),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/calendar/subscription");
      setSettings(data);
      setForm(formFromSettings(data));
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load subscription settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setBanner(null);
    try {
      const { data } = await api.patch("/cfo/slt/v2/calendar/subscription", {
        enabled: form.enabled,
        frequency: form.frequency,
        day_of_week: form.day_of_week,
        day_of_month: form.day_of_month,
        send_hour: form.send_hour,
        timezone: form.timezone,
        recipient_mode: form.recipient_mode,
        recipient_emails: form.recipient_emails_text,
      });
      setSettings(data);
      setForm(formFromSettings(data));
      setBanner({ tone: "ok", text: "Subscription settings saved." });
    } catch (e) {
      setBanner({ tone: "warn", text: friendlyErrorMessage(e, "Could not save subscription settings.") });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestBusy(true);
    setBanner(null);
    try {
      const { data } = await api.post("/cfo/slt/v2/calendar/subscription/test");
      setBanner({
        tone: data.sent > 0 ? "ok" : "warn",
        text:
          data.sent > 0
            ? "Test email sent to your own inbox."
            : `Test email could not be sent${data.failureReasons?.[0] ? `: ${data.failureReasons[0]}` : "."}`,
      });
    } catch (e) {
      setBanner({ tone: "warn", text: friendlyErrorMessage(e, "Could not send test email.") });
    } finally {
      setTestBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading subscription settings…</p>;
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        {error}
      </div>
    );
  }
  if (!form) return null;

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Automatically email the whole Master Calendar (the same file the Export button downloads) on a schedule —
        handy for anyone who wants it in their inbox without opening the portal, or as a standing backup if the
        server ever goes down.
      </p>

      {banner ? (
        <div
          className={`mb-4 flex items-start justify-between gap-3 rounded border p-2.5 text-sm ${
            banner.tone === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="shrink-0 text-xs font-semibold underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <label className="mb-4 flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-[#0B3EAF] focus:ring-[#0B3EAF]"
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Send this calendar automatically</span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Frequency</label>
          <select
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            className={SUBSCRIPTION_SELECT_CLASS}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {form.frequency === "weekly" ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Day of week</label>
            <select
              value={form.day_of_week}
              onChange={(e) => setForm((f) => ({ ...f, day_of_week: Number(e.target.value) }))}
              className={SUBSCRIPTION_SELECT_CLASS}
            >
              {SUBSCRIPTION_WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {form.frequency === "monthly" ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Day of month</label>
            <select
              value={form.day_of_month}
              onChange={(e) => setForm((f) => ({ ...f, day_of_month: Number(e.target.value) }))}
              className={SUBSCRIPTION_SELECT_CLASS}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Send at</label>
          <select
            value={form.send_hour}
            onChange={(e) => setForm((f) => ({ ...f, send_hour: Number(e.target.value) }))}
            className={SUBSCRIPTION_SELECT_CLASS}
          >
            {SUBSCRIPTION_HOURS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Time zone</label>
          <select
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            className={SUBSCRIPTION_SELECT_CLASS}
          >
            {SUBSCRIPTION_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Recipients</label>
        <div className="mb-2 flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="recipient_mode"
              checked={form.recipient_mode === "calendar_access"}
              onChange={() => setForm((f) => ({ ...f, recipient_mode: "calendar_access" }))}
            />
            Everyone with calendar access
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="recipient_mode"
              checked={form.recipient_mode === "custom"}
              onChange={() => setForm((f) => ({ ...f, recipient_mode: "custom" }))}
            />
            Specific email addresses
          </label>
        </div>
        {form.recipient_mode === "custom" ? (
          <textarea
            value={form.recipient_emails_text}
            onChange={(e) => setForm((f) => ({ ...f, recipient_emails_text: e.target.value }))}
            rows={4}
            placeholder="One email per line (or comma-separated)"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sent to everyone who currently holds Master Calendar access (cfo / SLT Report view or edit) — the same
            list the "new event" notification already uses.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save subscription settings"}
        </PrimaryButton>
        <GhostButton onClick={handleTest} disabled={testBusy}>
          {testBusy ? "Sending…" : "Send test email to myself"}
        </GhostButton>
      </div>

      {settings?.last_sent_at ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Last sent: {new Date(settings.last_sent_at).toLocaleString()}</p>
      ) : (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Not sent yet.</p>
      )}
    </div>
  );
}

// Current calendar month as [first day, last day] ISO strings — the
// default date-range filter on the Calendar sub-tab.
function currentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

// An event is "in range" if its date (or date range) overlaps [from, to]
// at all. Changed by explicit request: an event with no computable start
// date (an Event Date value the importer/date parser couldn't make sense
// of, e.g. "January 26, 2027 (Auditor: TBC)" — shown as "—" in the table)
// used to always be kept regardless of the filter, on the theory that its
// real timing just couldn't be auto-determined. In practice that meant a
// badly-typed date silently bypassed filtering and showed up in every date
// range, including ones its real date has nothing to do with — reported as
// "if events doesn't exist then don't show them." Now it's excluded
// whenever an actual From/To filter is applied (it can't honestly match
// one); it still appears when the filter is empty/cleared (viewing
// everything), so it isn't permanently hidden — just not shown inside a
// date range it can't be confirmed to belong to. Fix the Event Date value
// (even approximately) to make it filterable again.
function eventInDateRange(ev, from, to) {
  if (!ev.start_date) return !from && !to;
  const end = ev.end_date || ev.start_date;
  if (from && end < from) return false;
  if (to && ev.start_date > to) return false;
  return true;
}

// Unstyled on purpose — just the From/To inputs as plain flex items, so
// MasterCalendarView can lay them out in the same row as the Owner/Created-by
// dropdowns (see the filter-row container below) instead of as a separate
// block. The "current month by default" note lives once in that shared row,
// not here, to keep this short per request.
function DateRangeFilterBar({ from, to, onChange }) {
  return (
    <>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">From</label>
        <TextInput type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} className="w-full" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">To</label>
        <TextInput type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} className="w-full" />
      </div>
    </>
  );
}

// Unstyled on purpose, same as DateRangeFilterBar — a plain labeled <select>
// for filtering the Master Calendar by one text field (Owner / Lead, or
// Created by). `options` is the distinct, sorted list of values actually
// present among the loaded events, so the dropdown never offers a choice
// that would return zero results.
function TextFieldFilterDropdown({ label, value, options, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[38px] w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// Turns the backend's { notified, failed, error } notification result
// (see createCalendarEvent in sltCalendar.service.js) into one plain-English
// line, so whoever creates an event can see immediately whether anyone was
// actually emailed, instead of that only showing up in a server console.
// The create-event response no longer waits for notification emails to
// finish sending (see createCalendarEvent in sltCalendar.service.js — it's
// fire-and-forget now so "Add event" isn't held up by an SMTP round trip
// per recipient). That means this can only report that sending started,
// not whether it actually succeeded — the per-recipient result (and any
// failure reasons) still goes to the server console via
// notifyCalendarAccessUsersOfNewEvent's own logging, same as before.
function summarizeNotification(n) {
  if (!n) return null;
  if (n.status === "sending") {
    return { tone: "ok", text: "Event saved. Notifying everyone with Master Calendar access by email now." };
  }
  if (n.error) {
    return { tone: "warn", text: `Event saved, but the notification email failed to start: ${n.error}` };
  }
  return null;
}

function MasterCalendarView({ canEdit, isAdmin, deepLinkEventId }) {
  const visibleSubTabs = isAdmin
    ? MASTER_CALENDAR_SUB_TABS
    : MASTER_CALENDAR_SUB_TABS.filter((t) => !ADMIN_ONLY_SUB_TAB_KEYS.has(t.key));
  const [subTab, setSubTab] = useState(MASTER_CALENDAR_SUB_TABS[0].key);
  // Belt-and-suspenders: even if subTab somehow held "lists"/"read_me" (it
  // can't via the UI below, since those tabs aren't rendered for a
  // non-admin), never actually show that content to a non-admin.
  const effectiveSubTab = !isAdmin && ADMIN_ONLY_SUB_TAB_KEYS.has(subTab) ? "calendar" : subTab;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "add" } | { mode: "edit", event }
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [dateRange, setDateRange] = useState(currentMonthRange);
  // Owner / Lead and Created-by dropdown filters, added alongside the date
  // range per explicit request ("add slicer for owner and created by too
  // add dropdown for them"). Empty string means "All" for both.
  const [ownerFilter, setOwnerFilter] = useState("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // event pending delete confirmation
  const [deleting, setDeleting] = useState(false);
  // Shown right after creating an event so the "was anyone notified?"
  // question never has to go dig through a server console again — the
  // backend now returns a `notification` summary on the create response
  // (see createCalendarEvent in sltCalendar.service.js) and this just
  // reports it plainly, success or not.
  const [notifyBanner, setNotifyBanner] = useState(null); // { tone: "ok" | "warn", text } | null

  // Export/Import to Excel — offline continuity if the server is down: a
  // viewer can always pull a copy shaped like the source sheet; an editor
  // can bring an edited copy back in. importFile holds the File between the
  // dry-run preview and the actual commit, so the person isn't asked to
  // re-pick it.
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);

  // Resolves a "?calEvent=<id>" link from a notification email: once that
  // event has loaded, expand it, widen the date filter if it would
  // otherwise be hidden, and scroll it into view. deepLinkHandledRef makes
  // this a one-time jump — it won't keep re-scrolling or re-widening the
  // filter on every subsequent events/dateRange change.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || !deepLinkEventId || loading) return;
    const targetId = Number(deepLinkEventId);
    const target = events.find((e) => Number(e.id) === targetId);
    if (!target) return;
    deepLinkHandledRef.current = true;
    setExpandedIds((prev) => (prev.has(target.id) ? prev : new Set(prev).add(target.id)));
    if (!eventInDateRange(target, dateRange.from, dateRange.to)) {
      setDateRange({ from: "", to: "" });
    }
    const timer = setTimeout(() => {
      document.getElementById(`cal-event-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => clearTimeout(timer);
  }, [events, loading, deepLinkEventId, dateRange.from, dateRange.to]);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/calendar");
      setEvents(data.events || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load the Master Calendar."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (values) => {
    const { data } = await api.post("/cfo/slt/v2/calendar", values);
    setModal(null);
    setNotifyBanner(summarizeNotification(data?.notification));
    await load();
  };

  const handleUpdate = async (eventId, values) => {
    await api.patch(`/cfo/slt/v2/calendar/${eventId}`, values);
    setModal(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cfo/slt/v2/calendar/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not delete this calendar event."));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/cfo/slt/v2/calendar/export", { responseType: "blob" });
      const blob = res.data;
      const ct = String(res.headers["content-type"] || "");
      if (ct.includes("application/json")) {
        const text = await blob.text();
        let msg = "Could not export the calendar.";
        try {
          msg = JSON.parse(text)?.message || msg;
        } catch {
          // ignore — keep the default message
        }
        window.alert(msg);
        return;
      }
      let filename = `AGC_SLT_Master_Calendar_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const cd = res.headers["content-disposition"];
      const m = cd ? /filename="([^"]+)"/i.exec(cd) : null;
      if (m && m[1]) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // With responseType: "blob", a non-2xx response's JSON error body
      // also arrives as a Blob (axios doesn't parse it for us), so the
      // real server message ("Export is not available on this server.",
      // a grant-check 403, etc.) has to be read out of it by hand — same
      // fallback AdminPollsPage.jsx's exportSubmissionsExcel uses — or
      // every failure here would just say the generic default text below.
      let msg = friendlyErrorMessage(e, "Could not export the calendar.");
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text);
          if (j?.message) msg = j.message;
        } catch {
          // ignore — keep the default message
        }
      }
      window.alert(msg);
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (file, dryRun) => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/cfo/slt/v2/calendar/import?dryRun=${dryRun ? "true" : "false"}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  };

  const handleImportFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same filename again still fires onChange
    if (!file) return;
    setImportBusy(true);
    try {
      const preview = await runImport(file, true);
      setImportFile(file);
      setImportPreview(preview);
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not read that file."));
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const result = await runImport(importFile, false);
      setImportPreview(null);
      setImportFile(null);
      setNotifyBanner({
        tone: "ok",
        text: `Import complete — ${result.inserted} added, ${result.updated} updated, ${result.unchanged} already up to date${
          result.skippedBlank ? `, ${result.skippedBlank} blank rows skipped` : ""
        }.`,
      });
      await load();
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not import that file."));
    } finally {
      setImportBusy(false);
    }
  };

  const cancelImport = () => {
    setImportPreview(null);
    setImportFile(null);
  };

  // Distinct, sorted option lists for the Owner/Lead and Created-by
  // dropdowns, drawn from every loaded event (not just the ones already
  // passing the date filter) so switching the date range never silently
  // removes an option the user had selected.
  const ownerOptions = useMemo(
    () => Array.from(new Set(events.map((ev) => ev.owner_lead).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [events]
  );
  const createdByOptions = useMemo(
    () => Array.from(new Set(events.map((ev) => ev.created_by_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  const eventsInRange = events.filter(
    (ev) =>
      eventInDateRange(ev, dateRange.from, dateRange.to) &&
      (!ownerFilter || ev.owner_lead === ownerFilter) &&
      (!createdByFilter || ev.created_by_name === createdByFilter)
  );

  return (
    <div>
      <SubTabBar tabs={visibleSubTabs} active={effectiveSubTab} onChange={setSubTab} />

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {notifyBanner ? (
        <div
          className={`mb-3 flex items-start justify-between gap-3 rounded border p-2.5 text-sm ${
            notifyBanner.tone === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          }`}
        >
          <span>{notifyBanner.text}</span>
          <button
            type="button"
            onClick={() => setNotifyBanner(null)}
            className="shrink-0 text-xs font-semibold underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {effectiveSubTab === "calendar" ? (
        // One unified card (header → filter row → table), same shape as
        // the IT Ticket Board's <section> in ItTicketsMonitorTable.jsx,
        // instead of a floating gradient banner sitting above a separate
        // boxed table.
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
          <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-bold tracking-tight sm:text-lg">Master Calendar</h3>
                <p className="mt-0.5 text-xs text-white/75">Executive events, deadlines, and owners in one place.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatPill label="shown" value={eventsInRange.length} accent="bg-white/15 ring-1 ring-white/20" />
                <StatPill label="total" value={events.length} accent="bg-[#A7D344] text-[#0a0a0a]" />
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  title="Download this calendar as an Excel file — handy if the portal goes down and the team needs to keep working from a spreadsheet."
                  className="rounded-full border border-white/40 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-60"
                >
                  {exporting ? "Exporting…" : "Export to Excel"}
                </button>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      disabled={importBusy}
                      title="Upload an edited copy of the exported spreadsheet to bring those changes back into the portal."
                      className="rounded-full border border-white/40 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-60"
                    >
                      {importBusy ? "Reading…" : "Import from Excel"}
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={handleImportFileSelected}
                    />
                  </>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: "add" })}
                    className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#0B3EAF] shadow-sm transition hover:bg-white/90"
                  >
                    + Add event
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 sm:px-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DateRangeFilterBar from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
              <TextFieldFilterDropdown label="Owner / Lead" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} />
              <TextFieldFilterDropdown label="Created by" value={createdByFilter} options={createdByOptions} onChange={setCreatedByFilter} />
            </div>
            <p className="mt-1.5 text-[11px] italic text-slate-500 dark:text-slate-400">Current month selected by default.</p>
          </div>

          <div className="p-3 sm:p-4">
            {loading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-16">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
                <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading events…</p>
              </div>
            ) : (
              <CalendarEventList
                events={eventsInRange}
                onEdit={(event) => setModal({ mode: "edit", event })}
                onDelete={setDeleteTarget}
                expandedIds={expandedIds}
                onToggle={toggleExpanded}
                highlightId={deepLinkEventId}
                emptyMessage={
                  events.length
                    ? "No events in this date range — widen the range or click \"This month\" to reset it."
                    : `No calendar events yet${canEdit ? ' — click "Add event" to create the first one.' : "."}`
                }
              />
            )}
          </div>
        </section>
      ) : effectiveSubTab === "lists" ? (
        <ListsView />
      ) : effectiveSubTab === "read_me" ? (
        <ReadMeView />
      ) : effectiveSubTab === "administration" ? (
        <SubscriptionAdminView />
      ) : (
        <div />
      )}

      {modal?.mode === "add" ? (
        <CalendarEventFormModal title="Add calendar event" initialValues={{}} onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Add event" />
      ) : null}
      {modal?.mode === "edit" ? (
        <CalendarEventFormModal
          title="Edit calendar event"
          initialValues={modal.event}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleUpdate(modal.event.id, values)}
          submitLabel="Save changes"
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete calendar event"
          message={`Permanently delete "${deleteTarget.event_title}"? This cannot be undone.`}
          confirmLabel="Delete event"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {importPreview ? (
        <ImportPreviewModal preview={importPreview} busy={importBusy} onConfirm={confirmImport} onCancel={cancelImport} />
      ) : null}
    </div>
  );
}

export default function SltTrackerV2({ canEdit }) {
  const { user } = useAuth();
  const isAdmin = isAdministrator(user);
  // "?calEvent=<id>" comes from the "new event" notification email — see
  // sendCalendarEventCreatedEmail in email.service.js. When present, jump
  // straight to Master Calendar instead of whichever view is first by
  // default, so clicking the email link lands directly on the event.
  const [searchParams] = useSearchParams();
  const deepLinkEventId = searchParams.get("calEvent");
  const [view, setView] = useState(() => (deepLinkEventId ? "master_calendar" : SLT_TRACKER_VIEWS[0].key));

  // Action Tracker Executive Board is still being worked on and isn't ready
  // for the live site yet — per explicit request, hide it from the
  // production build (what actually ships to Render) while leaving it
  // visible when running the local dev server, so work on it can continue
  // on localhost without it showing up for real users in the meantime.
  // `import.meta.env.DEV` is Vite's own dev-vs-build flag: true under
  // `npm run dev`, false in a `vite build` (what gets deployed). Master
  // Calendar is unaffected either way — it's already first in
  // SLT_TRACKER_VIEWS and the default view above.
  const visibleSltViews = import.meta.env.DEV
    ? SLT_TRACKER_VIEWS
    : SLT_TRACKER_VIEWS.filter((v) => v.key !== "action_tracker");

  return (
    <div className="card p-4 sm:p-6">
      {visibleSltViews.length > 1 ? (
        // Only worth showing as a choice when there's more than one option —
        // with Action Tracker hidden on the live site, there's nothing to
        // pick between, so the radio row itself is skipped there rather
        // than showing a single, permanently-checked option.
        <div className="mb-4 flex flex-wrap items-center gap-6">
          {visibleSltViews.map((v) => (
            <label
              key={v.key}
              className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <input
                type="radio"
                name="slt-tracker-view"
                value={v.key}
                checked={view === v.key}
                onChange={() => setView(v.key)}
                className="h-4 w-4 text-[#0B3EAF] focus:ring-[#0B3EAF]"
              />
              {v.label}
            </label>
          ))}
        </div>
      ) : null}

      {view === "master_calendar" ? (
        <MasterCalendarView canEdit={canEdit} isAdmin={isAdmin} deepLinkEventId={deepLinkEventId} />
      ) : (
        <ActionTrackerBoard canEdit={canEdit} />
      )}
    </div>
  );
}
