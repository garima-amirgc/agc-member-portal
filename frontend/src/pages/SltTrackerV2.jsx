import { useCallback, useEffect, useState } from "react";
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
 * Calendar as sub-tabs (Calendar / Weekly Review / Lists / Read Me) —
 * they're all facets of the same workbook, not separate boards:
 *   - Lists: the workbook's reference/lookup sheet. Shown read-only here;
 *     its Categories/Executives/Months values already power the
 *     suggestion dropdowns on the Add/Edit form above. Its Statuses and
 *     Risk Levels columns aren't wired to anything — the Master Calendar
 *     sheet itself has no Status or Risk column, so there's nothing in
 *     the data for those two lists to apply to.
 *   - Weekly Review: the source sheet's own formula is broken in the
 *     uploaded file — `=FILTER('Master Calendar'!A3:M104,
 *     'Master Calendar'!#REF!="Include", ...)` — the column it filters on
 *     was deleted from Master Calendar at some point, so Excel shows
 *     #REF! there too, not just here. This view is a reconstructed
 *     substitute (events overdue, due in the next 14 days, or with prep
 *     overdue/due in 14 days), computed live from the real calendar data,
 *     not a port of the broken formula.
 *   - Read Me: shown as-is. It references two sheets ("Monthly Exec
 *     View", "Calendar Export") that don't exist in the uploaded
 *     workbook — only Read Me, Master Calendar, Weekly Review, and Lists
 *     are actually present — flagged inline rather than silently ignored.
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
  { key: "action_tracker", label: "Action Tracker Executive Board" },
  { key: "master_calendar", label: "Master Calendar" },
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

const CALENDAR_FIELDS = [
  { key: "month", label: "Month", type: "suggest", suggestions: MONTH_SUGGESTIONS },
  { key: "event_date", label: "Event Date", type: "event_date", required: true },
  { key: "event_title", label: "Event / Deadline", type: "text", required: true },
  { key: "category", label: "Category", type: "suggest", suggestions: CATEGORY_SUGGESTIONS },
  { key: "executives", label: "Executive(s)", type: "suggest", suggestions: EXECUTIVE_SUGGESTIONS },
  { key: "owner_lead", label: "Owner / Lead", type: "text" },
  { key: "executive_action_required", label: "Executive Action Required", type: "text" },
  { key: "prep_start_date", label: "Prep Start Date", type: "date" },
  { key: "prep_deadline", label: "Prep Deadline", type: "date" },
  { key: "materials_needed", label: "Materials Needed", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
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
const PILL_BASE = "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide";

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

// One expandable card per event — collapsed shows date, title, and quick
// badges; expanded reveals the rest of the fields in a label/value grid.
// Never scrolls horizontally, unlike a wide multi-column table.
function CalendarEventCard({ event, canEdit, onEdit, expanded, onToggle }) {
  const ev = event;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-[#0B3EAF]/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-[#A7D344]/30">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
        <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
          <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
            {fmtEventDate(ev.event_date, ev.is_text_date_range)}
          </span>
          {ev.month ? <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{ev.month}</span> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-white">{ev.event_title}</div>
            <span className={`shrink-0 text-xs text-slate-400 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
              ▾
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {ev.category ? <span className={`${PILL_BASE} ${pillClassFor(ev.category)}`}>{ev.category}</span> : null}
            {ev.executives ? <span className={`${PILL_BASE} ${pillClassFor(ev.executives)}`}>{ev.executives}</span> : null}
            <span className={`${PILL_BASE} ${dueBadgeClass(ev.days_until_event)}`}>{fmtDays(ev.days_until_event)}</span>
          </div>
          {ev.owner_lead ? (
            <div className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">Owner: {ev.owner_lead}</div>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Executive Action Required" value={ev.executive_action_required} />
            <DetailField
              label="Prep Window"
              value={
                ev.prep_start_date || ev.prep_deadline
                  ? `${fmtDate(ev.prep_start_date)} → ${fmtDate(ev.prep_deadline)}${ev.prep_deadline ? ` (${fmtDays(ev.prep_days_left)})` : ""}`
                  : ""
              }
            />
            <DetailField label="Materials Needed" value={ev.materials_needed} />
            <DetailField label="Notes" value={ev.notes} className="sm:col-span-2" />
          </div>
          {canEdit ? (
            <div className="mt-3 flex justify-end">
              <GhostButton onClick={() => onEdit(ev)}>Edit</GhostButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const TH = "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const TD = "px-3 py-3 align-top text-xs text-slate-700 dark:text-slate-200 overflow-hidden";

function zebra(rowIdx) {
  return rowIdx % 2 === 1 ? "bg-slate-50 dark:bg-white/[0.03]" : "bg-white dark:bg-transparent";
}

// Desktop table view — real rows and columns in the source workbook's
// order (Month, Event Date, Event/Deadline, Category, Executive(s), Owner,
// Days Until Event, Prep Days Left), sized with table-fixed % widths and
// truncation so it always fits the viewport width — no horizontal scroll.
// The remaining fields (Executive Action Required, Prep Window, Materials
// Needed, Notes) are in the same expand-a-row panel the mobile card uses,
// not crammed into more columns.
function CalendarEventTableRow({ event, rowIdx, canEdit, onEdit, expanded, onToggle }) {
  const ev = event;
  return (
    <>
      <tr className={`${zebra(rowIdx)} cursor-pointer border-b border-slate-200/80 transition hover:brightness-[0.98] dark:border-slate-700/50 dark:hover:brightness-110`} onClick={onToggle}>
        <td className={`${TD} w-[13%]`}>
          <div className="font-semibold leading-snug text-slate-800 dark:text-slate-100">{fmtEventDate(ev.event_date, ev.is_text_date_range)}</div>
          {ev.month ? <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{ev.month}</div> : null}
        </td>
        <td className={`${TD} w-[20%]`}>
          <div className="line-clamp-2 font-semibold leading-snug text-slate-900 dark:text-white" title={ev.event_title}>
            {ev.event_title}
          </div>
        </td>
        <td className={`${TD} w-[12%]`}>
          {ev.category ? (
            <span className={`${PILL_BASE} ${pillClassFor(ev.category)}`} title={ev.category}>
              {ev.category}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className={`${TD} w-[12%]`}>
          {ev.executives ? (
            <span className={`${PILL_BASE} ${pillClassFor(ev.executives)}`} title={ev.executives}>
              {ev.executives}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className={`${TD} w-[13%] truncate`} title={ev.owner_lead || ""}>
          {ev.owner_lead || "—"}
        </td>
        <td className={`${TD} w-[10%]`}>
          <span className={`${PILL_BASE} ${dueBadgeClass(ev.days_until_event)}`}>{fmtDays(ev.days_until_event)}</span>
        </td>
        <td className={`${TD} w-[10%]`}>
          <span className={`${PILL_BASE} ${dueBadgeClass(ev.prep_days_left)}`}>{fmtDays(ev.prep_days_left)}</span>
        </td>
        <td className={`${TD} w-[8%] text-right`}>
          <span className={`inline-block text-slate-400 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
            ▾
          </span>
        </td>
      </tr>
      {expanded ? (
        <tr className={`${zebra(rowIdx)} border-b border-slate-200/80 dark:border-slate-700/50`}>
          <td colSpan={8} className="bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Executive Action Required" value={ev.executive_action_required} />
              <DetailField
                label="Prep Window"
                value={
                  ev.prep_start_date || ev.prep_deadline
                    ? `${fmtDate(ev.prep_start_date)} → ${fmtDate(ev.prep_deadline)}${ev.prep_deadline ? ` (${fmtDays(ev.prep_days_left)})` : ""}`
                    : ""
                }
              />
              <DetailField label="Materials Needed" value={ev.materials_needed} />
              <DetailField label="Notes" value={ev.notes} className="sm:col-span-2" />
            </div>
            {canEdit ? (
              <div className="mt-3 flex justify-end">
                <GhostButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(ev);
                  }}
                >
                  Edit
                </GhostButton>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// Renders events as a real table on md+ screens (matching the source
// workbook's column order) and as expandable cards below md — same
// responsive split the IT Ticket Board uses. Neither view ever needs
// horizontal scroll: the table uses table-fixed % widths with truncation
// instead of overflowing, and secondary fields live in the expand panel.
function CalendarEventList({ events, canEdit, onEdit, expandedIds, onToggle, emptyMessage }) {
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
            canEdit={canEdit}
            onEdit={onEdit}
            expanded={expandedIds.has(ev.id)}
            onToggle={() => onToggle(ev.id)}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 md:block">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-[rgba(11,62,175,0.06)] dark:border-slate-600 dark:bg-[rgba(167,211,68,0.08)]">
              <th className={`${TH} w-[13%]`}>Event Date</th>
              <th className={`${TH} w-[20%]`}>Event / Deadline</th>
              <th className={`${TH} w-[12%]`}>Category</th>
              <th className={`${TH} w-[12%]`}>Executive(s)</th>
              <th className={`${TH} w-[13%]`}>Owner / Lead</th>
              <th className={`${TH} w-[10%]`}>Days Until</th>
              <th className={`${TH} w-[10%]`}>Prep Left</th>
              <th className={`${TH} w-[8%]`}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, rowIdx) => (
              <CalendarEventTableRow
                key={ev.id}
                event={ev}
                rowIdx={rowIdx}
                canEdit={canEdit}
                onEdit={onEdit}
                expanded={expandedIds.has(ev.id)}
                onToggle={() => onToggle(ev.id)}
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
  if (def.type === "suggest") {
    return (
      <div>
        <TextInput list={`${def.key}-suggestions`} value={value || ""} onChange={(e) => onChange(e.target.value)} />
        <datalist id={`${def.key}-suggestions`}>
          {def.suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    );
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

  return (
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
    </div>
  );
}

const MASTER_CALENDAR_SUB_TABS = [
  { key: "calendar", label: "Calendar" },
  { key: "weekly_review", label: "Weekly Review" },
  { key: "lists", label: "Lists" },
  { key: "read_me", label: "Read Me" },
];

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

// Substitute for the source sheet's broken FILTER formula — see the file
// header comment for why. "Flagged" = overdue, due in the next 14 days, or
// prep overdue/due in the next 14 days; a text-range event date (can't be
// compared to a number of days) is always included since its timing can't
// be auto-determined.
function isFlaggedForWeeklyReview(ev) {
  const within14 = (n) => n !== null && n !== undefined && n <= 14;
  return within14(ev.days_until_event) || within14(ev.prep_days_left) || !!ev.is_text_date_range;
}

function WeeklyReviewView({ events, loading, canEdit, onEdit, expandedIds, onToggle }) {
  const flagged = events.filter(isFlaggedForWeeklyReview);

  return (
    <div>
      <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        The source sheet's own Weekly Review formula is broken in the uploaded workbook — it filters on a column that
        was deleted from Master Calendar, so Excel shows #REF! there too. This list is a reconstructed substitute:
        events overdue, due in the next 14 days, or with prep overdue/due in the next 14 days (plus any text-range
        event date, since its timing can't be auto-computed).
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <CalendarEventList
          events={flagged}
          canEdit={canEdit}
          onEdit={onEdit}
          expandedIds={expandedIds}
          onToggle={onToggle}
          emptyMessage="No items currently flagged for weekly review — same fallback message the source sheet's FILTER formula used."
        />
      )}
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
      <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        This note mentions "Monthly Exec View" and "Calendar Export" — those two sheets aren't in the uploaded
        workbook (only Read Me, Master Calendar, Weekly Review, and Lists are), so those specific steps aren't
        available here.
      </div>
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

function MasterCalendarView({ canEdit }) {
  const [subTab, setSubTab] = useState(MASTER_CALENDAR_SUB_TABS[0].key);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "add" } | { mode: "edit", event }
  const [expandedIds, setExpandedIds] = useState(() => new Set());

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
    await api.post("/cfo/slt/v2/calendar", values);
    setModal(null);
    await load();
  };

  const handleUpdate = async (eventId, values) => {
    await api.patch(`/cfo/slt/v2/calendar/${eventId}`, values);
    setModal(null);
    await load();
  };

  return (
    <div>
      <SubTabBar tabs={MASTER_CALENDAR_SUB_TABS} active={subTab} onChange={setSubTab} />

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {subTab === "calendar" ? (
        <div>
          <div className="relative mb-4 overflow-hidden rounded-xl border border-[#082d82]/20 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold tracking-tight sm:text-lg">Master Calendar</h3>
                <p className="mt-0.5 text-xs text-white/75">
                  {events.length} event{events.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatPill
                  label="Overdue"
                  value={events.filter((ev) => ev.days_until_event !== null && ev.days_until_event < 0).length}
                  accent="bg-red-300 text-red-950"
                />
                <StatPill
                  label="Due ≤14d"
                  value={events.filter((ev) => ev.days_until_event !== null && ev.days_until_event >= 0 && ev.days_until_event <= 14).length}
                  accent="bg-amber-300 text-amber-950"
                />
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

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : (
            <CalendarEventList
              events={events}
              canEdit={canEdit}
              onEdit={(event) => setModal({ mode: "edit", event })}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              emptyMessage={`No calendar events yet${canEdit ? ' — click "Add event" to create the first one.' : "."}`}
            />
          )}
        </div>
      ) : subTab === "weekly_review" ? (
        <WeeklyReviewView
          events={events}
          loading={loading}
          canEdit={canEdit}
          onEdit={(event) => setModal({ mode: "edit", event })}
          expandedIds={expandedIds}
          onToggle={toggleExpanded}
        />
      ) : subTab === "lists" ? (
        <ListsView />
      ) : (
        <ReadMeView />
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
    </div>
  );
}

export default function SltTrackerV2({ canEdit }) {
  const [view, setView] = useState(SLT_TRACKER_VIEWS[0].key);

  return (
    <div className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-6">
        {SLT_TRACKER_VIEWS.map((v) => (
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

      {view === "master_calendar" ? <MasterCalendarView canEdit={canEdit} /> : <ActionTrackerBoard canEdit={canEdit} />}
    </div>
  );
}
