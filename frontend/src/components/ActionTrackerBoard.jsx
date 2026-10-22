import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

/**
 * SLT Tracker — Action Tracker Executive Board.
 *
 * Mounted from SltTrackerV2.jsx's "Action Tracker Executive Board" radio
 * option, replacing its placeholder. Covers every sheet in the source
 * workbook (SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx)
 * that holds real working data, as six sub-tabs:
 *   - Dashboard: live KPIs (backend: GET /cfo/slt/v2/dashboard), replacing
 *     the sheet's own Board Summary / Executive Dashboard tabs — those were
 *     a stale, hand-updated snapshot (dated Jul 22, 2026 per the "5-Minute
 *     Summary" tab); this recomputes the same numbers live from the actual
 *     rows instead of trusting a cached count.
 *   - Action Register: slt_actions (backend: sltActions.service.js).
 *   - Decisions: Decision Queue + Decision Register, as an inner toggle
 *     (backend: sltDecisions.service.js), plus the "Record Decision"
 *     workflow that moves a queue item into the permanent register.
 *   - Commitments: 90-Day Commitments (backend: sltCommitments.service.js),
 *     including the 30/60/90-day check-ins.
 *   - Weekly Review: backend: sltOverview.getWeeklyReview() — a documented
 *     SUBSTITUTE for the source sheet, which has no Weekly Review tab of
 *     its own for the Action Tracker workbook (unlike Master Calendar);
 *     this cross-area view is built from the same "still open AND
 *     (flagged / overdue / due this week)" rule the project doc defines.
 *   - Reference: the workbook's Lists & Controls dropdown values (already
 *     powering every <datalist> suggestion below), the Enhancement Log
 *     sheet verbatim, and the 5-Minute Summary — shown read-only and
 *     flagged as a stale, point-in-time snapshot rather than live data.
 *
 * All status/category/type/etc. fields are free text with <datalist>
 * suggestions drawn straight from the workbook's "Lists & Controls" sheet
 * (never a locked <select>) — same house pattern as Master Calendar and
 * the IT Ticket Board, so a value the sheet didn't anticipate can still be
 * typed in.
 *
 * Two documented data-quality issues from the source workbook are called
 * out inline rather than silently fixed — see sltDecisions.service.js's
 * header comment for the full explanation:
 *   - Decision Register row 10 has a broken Active Record formula (#REF!).
 *   - Decision Register rows 5-6 have a known "ask" vs "log" misalignment
 *     from a bad backup-sheet merge.
 * Decision Register never re-links to Decision Queue by matching titles —
 * only via an explicit parent_decision_id, set by either the importer or
 * the Record Decision workflow here.
 */

// ── Reference vocabularies, straight from the workbook's "Lists & Controls"
// sheet (columns A-N) — power every <datalist> below. ────────────────────

const STATUS_SUGGESTIONS = [
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
const PRIORITY_SUGGESTIONS = ["Critical", "High", "Medium", "Low"];
const RISK_IMPACT_SUGGESTIONS = ["High", "Medium", "Low"];
const STRATEGIC_OBJECTIVE_SUGGESTIONS = [
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
const ESCALATION_SUGGESTIONS = ["Yes", "No"];
const FINANCIAL_IMPACT_SUGGESTIONS = ["<$10K", "$10K-$50K", "$50K-$250K", ">$250K", "Unknown / TBD"];
const DECISION_TYPE_SUGGESTIONS = [
  "Information Only",
  "Recommendation Required",
  "Approval Required",
  "Capital Approval",
  "Policy Approval",
  "Strategic Decision",
  "Governance Decision",
];
const CEO_CFO_ATTENTION_SUGGESTIONS = ["CEO", "CFO", "CEO & CFO", "SLT", "No", "President", "VP OPS"];
const WORKSTREAM_SUGGESTIONS = ["Operations", "Finance", "People & Culture", "Commercial", "Projects", "Risk & Compliance", "Governance", "ASP Go-Live", "Sierra", "Other"];
const ASP_READINESS_STREAM_SUGGESTIONS = [
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
const CATEGORY_SUGGESTIONS = [
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
  "Other",
  "AQM",
];
const PEOPLE_SUGGESTIONS = ["Tony", "Sandy", "Sherry", "Dave", "Adam", "Tom", "Gene", "Maurizio", "Other", "SLT", "Colin", "Carol"];
const RAG_STATUS_SUGGESTIONS = ["🟢 Met/On Track", "🟡 In Progress/Carried Forward", "🔴 At Risk/Overdue"];
const STATUS2_SUGGESTIONS = ["Open", "Closed", "Completed", "Delivered", "Cancelled"];
const FOLLOW_UP_STATUS_SUGGESTIONS = ["Open", "Pending Review", "Resolved", "No Further Action"];
const DECISION_QUEUE_STATUS_SUGGESTIONS = ["Assigned", "In Progress", "Waiting on Information", "Deferred", "Completed"];

const LISTS_AND_CONTROLS_REFERENCE = [
  { label: "Status", values: STATUS_SUGGESTIONS },
  { label: "Priority", values: PRIORITY_SUGGESTIONS },
  { label: "Risk Impact", values: RISK_IMPACT_SUGGESTIONS },
  { label: "Strategic Objective", values: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { label: "Escalation Required", values: ESCALATION_SUGGESTIONS },
  { label: "Financial Impact", values: FINANCIAL_IMPACT_SUGGESTIONS },
  { label: "Decision Type", values: DECISION_TYPE_SUGGESTIONS },
  { label: "CEO/CFO Attention", values: CEO_CFO_ATTENTION_SUGGESTIONS },
  { label: "Workstream", values: WORKSTREAM_SUGGESTIONS },
  { label: "ASP Readiness Stream", values: ASP_READINESS_STREAM_SUGGESTIONS },
  { label: "Category", values: CATEGORY_SUGGESTIONS },
  { label: "People", values: PEOPLE_SUGGESTIONS },
];

// The workbook's "Enhancement Log" sheet, verbatim.
const ENHANCEMENT_LOG = [
  { area: "Action Tracker", added: "Added Priority field", why: "Separates critical SLT/ASP/governance items from routine administrative actions." },
  { area: "Action Tracker", added: "Added Risk Impact field", why: "Creates risk-based SLT discussion sequencing and visibility." },
  { area: "Action Tracker", added: "Added Strategic Objective field", why: "Links actions to ASP Go-Live, Governance, Sierra, Federal Licence, Food Safety and other pillars." },
  { area: "Action Tracker", added: "Added Escalation Required field", why: "Allows weekly CEO/CFO escalation filtering instead of discussing every item." },
  { area: "Action Tracker", added: "Added Financial Impact field", why: "Distinguishes minor tasks from financially material decisions and risks." },
  { area: "Action Tracker", added: "Added ASP Readiness Stream field", why: "Keeps ASP Go-Live visible as a dedicated executive workstream." },
  { area: "Decision Queue", added: "Added Decision Type, Financial Impact, Risk Impact and CEO/CFO Attention", why: "Clarifies whether SLT is being asked for information, recommendation, approval, capital approval, policy approval or strategy." },
  { area: "Dashboard", added: "Added Executive Dashboard", why: "Turns the workbook from an action log into a management and governance tool." },
  { area: "Governance", added: "Added CFO Governance & Controls seed items", why: "Creates visibility for DOA, contracts, AI governance, incident management, internal audit, grants and legal review." },
  { area: "Decision Queue", added: "Made Decision ID depend on the hidden immutable key", why: "Keeps the visible number tied to a stable audit key, so sorting/filtering does not break the relationship." },
  { area: "Decision Register", added: "Added Source Decision ID and Queue Source Key linkage", why: "Allows one Decision Queue item to have multiple decision/follow-up records, without losing the parent-child relationship." },
  { area: "Lists & Controls", added: "Added active Decision Queue dropdown source", why: "Note that only active, non-cancelled decisions with real detail should appear in the register dropdown." },
  { area: "Protection", added: "Protected generated fields and read-only outputs with no password", why: "Locks the formulas/keys/views that should not be manually edited, while leaving user-entry fields available." },
  { area: "Action Viewer", added: "Added stacked Action Record Viewer", why: "Shows multiple action records without the full side-scroll, while keeping Action Register as the source of truth." },
  { area: "Decision Viewer", added: "Added stacked Decision Record Viewer", why: "Gives the same no-side-scroll style for decision follow-ups once register records are entered." },
  { area: "Viewer Formatting", added: "Added conditional highlighting for urgency fields", why: "Critical/high risk and past-due/today-tomorrow dates now stand out visually; blank/0/N/A noise is suppressed where practical." },
];

// ── Shared UI primitives (same visual language as Master Calendar / the IT
// Ticket Board — colored pills, a gradient stat header, expandable rows). ──

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

function pillClassFor(text) {
  const s = String(text || "").trim();
  if (!s) return "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PILL_PALETTE[hash % PILL_PALETTE.length];
}

function priorityPillClass(priority) {
  const p = String(priority || "").toLowerCase();
  if (p === "critical") return "bg-red-100 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  if (p === "high") return "bg-orange-100 text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-800";
  if (p === "low") return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  return "bg-blue-100 text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800";
}

function dueBadgeClass(days) {
  if (days === null || days === undefined) {
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  }
  if (days < 0) return "bg-red-100 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  if (days <= 7) return "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
}

function activeRecordBadgeClass(activeRecord) {
  if (typeof activeRecord === "string" && activeRecord.startsWith("#")) {
    return "bg-red-100 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  }
  return activeRecord === "INACTIVE"
    ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15"
    : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800";
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

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      {message}
    </div>
  );
}

function NoteBanner({ children }) {
  return (
    <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      {children}
    </div>
  );
}

// ── Generic field renderer + form modal, driven by a `fields` config array
// (same shape across every record type below: key/label/type/required/
// suggestions). ───────────────────────────────────────────────────────────

function FieldInput({ def, value, onChange }) {
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

function emptyFormValues(fields) {
  const v = {};
  for (const f of fields) v[f.key] = "";
  return v;
}

function RecordFormModal({ title, fields, initialValues, onClose, onSubmit, submitLabel = "Save", note }) {
  const [values, setValues] = useState(() => ({ ...emptyFormValues(fields), ...initialValues }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save this record."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            ✕
          </button>
        </div>

        {note ? <NoteBanner>{note}</NoteBanner> : null}
        <ErrorBanner message={error} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((def) => (
            <div key={def.key} className={def.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {def.label}
                {def.required ? " *" : ""}
              </label>
              <FieldInput def={def} value={values[def.key]} onChange={(v) => setValues({ ...values, [def.key]: v })} />
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

// ── Generic record list: real table on md+ screens (fixed-width columns,
// no horizontal scroll), expandable cards below md — same responsive split
// as Master Calendar / the IT Ticket Board. `columns` drives the table;
// `renderDetail` drives the expand panel (desktop + mobile share it). ─────

function zebra(rowIdx) {
  return rowIdx % 2 === 1 ? "bg-slate-50 dark:bg-white/[0.03]" : "bg-white dark:bg-transparent";
}

const TH = "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const TD = "px-3 py-3 align-top text-xs text-slate-700 dark:text-slate-200 overflow-hidden";

function RecordCard({ record, columns, renderDetail, canEdit, onEdit, rowActions, expanded, onToggle }) {
  const primary = columns[0];
  const secondary = columns.slice(1, 3);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-[#0B3EAF]/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-[#A7D344]/30">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-white">{primary.render(record)}</div>
            <span className={`shrink-0 text-xs text-slate-400 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
              ▾
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {secondary.map((col) => (
              <span key={col.key}>{col.render(record)}</span>
            ))}
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          {renderDetail(record)}
          {canEdit && (onEdit || rowActions) ? (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {rowActions ? rowActions(record) : null}
              {onEdit ? <GhostButton onClick={() => onEdit(record)}>Edit</GhostButton> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RecordTableRow({ record, rowIdx, columns, renderDetail, canEdit, onEdit, rowActions, expanded, onToggle }) {
  return (
    <>
      <tr
        className={`${zebra(rowIdx)} cursor-pointer border-b border-slate-200/80 transition hover:brightness-[0.98] dark:border-slate-700/50 dark:hover:brightness-110`}
        onClick={onToggle}
      >
        {columns.map((col) => (
          <td key={col.key} className={`${TD} ${col.width || ""}`}>
            {col.render(record)}
          </td>
        ))}
        <td className={`${TD} w-[4%] text-right`}>
          <span className={`inline-block text-slate-400 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
            ▾
          </span>
        </td>
      </tr>
      {expanded ? (
        <tr className={`${zebra(rowIdx)} border-b border-slate-200/80 dark:border-slate-700/50`}>
          <td colSpan={columns.length + 1} className="bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
            {renderDetail(record)}
            {canEdit && (onEdit || rowActions) ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {rowActions ? rowActions(record) : null}
                {onEdit ? (
                  <GhostButton
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(record);
                    }}
                  >
                    Edit
                  </GhostButton>
                ) : null}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RecordList({ records, columns, renderDetail, canEdit, onEdit, rowActions, expandedIds, onToggle, emptyMessage, idKey = "id" }) {
  if (!records.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-700 dark:bg-white/[0.03]">
        <p className="text-sm italic text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="space-y-2 md:hidden">
        {records.map((r) => (
          <RecordCard
            key={r[idKey]}
            record={r}
            columns={columns}
            renderDetail={renderDetail}
            canEdit={canEdit}
            onEdit={onEdit}
            rowActions={rowActions}
            expanded={expandedIds.has(r[idKey])}
            onToggle={() => onToggle(r[idKey])}
          />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 md:block">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-[rgba(11,62,175,0.06)] dark:border-slate-600 dark:bg-[rgba(167,211,68,0.08)]">
              {columns.map((col) => (
                <th key={col.key} className={`${TH} ${col.width || ""}`}>
                  {col.label}
                </th>
              ))}
              <th className={`${TH} w-[4%]`}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, rowIdx) => (
              <RecordTableRow
                key={r[idKey]}
                record={r}
                rowIdx={rowIdx}
                columns={columns}
                renderDetail={renderDetail}
                canEdit={canEdit}
                onEdit={onEdit}
                rowActions={rowActions}
                expanded={expandedIds.has(r[idKey])}
                onToggle={() => onToggle(r[idKey])}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useExpanded() {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const onToggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return { expandedIds, onToggle };
}

// ── Action Register ─────────────────────────────────────────────────────

const ACTION_FIELDS = [
  { key: "item", label: "Item", type: "textarea", required: true },
  { key: "owner", label: "Owner", type: "suggest", suggestions: PEOPLE_SUGGESTIONS, required: true },
  { key: "category", label: "Category", type: "suggest", suggestions: CATEGORY_SUGGESTIONS },
  { key: "status", label: "Status", type: "suggest", suggestions: STATUS_SUGGESTIONS },
  { key: "priority", label: "Priority", type: "suggest", suggestions: PRIORITY_SUGGESTIONS },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "next_action", label: "Next Action", type: "textarea" },
  { key: "risk_impact", label: "Risk / Impact", type: "suggest", suggestions: RISK_IMPACT_SUGGESTIONS },
  { key: "strategic_objective", label: "Strategic Objective", type: "suggest", suggestions: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { key: "escalation_required", label: "Escalation Required", type: "suggest", suggestions: ESCALATION_SUGGESTIONS },
  { key: "financial_impact", label: "Financial Impact", type: "suggest", suggestions: FINANCIAL_IMPACT_SUGGESTIONS },
  { key: "asp_readiness_stream", label: "ASP Readiness Stream", type: "suggest", suggestions: ASP_READINESS_STREAM_SUGGESTIONS },
  { key: "blocker_waiting_on", label: "Blocker / Waiting On", type: "textarea" },
  { key: "date_added", label: "Date Added", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const ACTION_COLUMNS = [
  {
    key: "item",
    label: "Item",
    width: "w-[26%]",
    render: (a) => (
      <div className="line-clamp-2 font-semibold leading-snug text-slate-900 dark:text-white" title={a.item}>
        {a.flag ? <span className="mr-1 text-red-500">{a.flag}</span> : null}
        {a.item}
      </div>
    ),
  },
  {
    key: "owner",
    label: "Owner",
    width: "w-[12%]",
    render: (a) => <span className={`${PILL_BASE} ${pillClassFor(a.owner)}`}>{a.owner || "—"}</span>,
  },
  {
    key: "due_date",
    label: "Due Date",
    width: "w-[13%]",
    render: (a) => (
      <div>
        <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(a.due_date)}</div>
        <span className={`${PILL_BASE} mt-1 ${dueBadgeClass(a.days_until_due)}`}>{fmtDays(a.days_until_due)}</span>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: "w-[15%]",
    render: (a) => <span className={`${PILL_BASE} ${pillClassFor(a.status)}`}>{a.status || "—"}</span>,
  },
  {
    key: "priority",
    label: "Priority",
    width: "w-[11%]",
    render: (a) => <span className={`${PILL_BASE} ${priorityPillClass(a.priority)}`}>{a.priority || "—"}</span>,
  },
  {
    key: "category",
    label: "Category",
    width: "w-[14%]",
    render: (a) => (a.category ? <span className={`${PILL_BASE} ${pillClassFor(a.category)}`}>{a.category}</span> : <span className="text-slate-400">—</span>),
  },
];

function renderActionDetail(a) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DetailField label="Next Action" value={a.next_action} />
      <DetailField label="Blocker / Waiting On" value={a.blocker_waiting_on} />
      <DetailField label="Risk / Impact" value={a.risk_impact} />
      <DetailField label="Strategic Objective" value={a.strategic_objective} />
      <DetailField label="Escalation Required" value={a.escalation_required} />
      <DetailField label="Financial Impact" value={a.financial_impact} />
      <DetailField label="ASP Readiness Stream" value={a.asp_readiness_stream} />
      <DetailField label="Active Record" value={a.active_record} />
      <DetailField label="Date Added" value={fmtDate(a.date_added)} />
      <DetailField label="Last Updated" value={fmtDate(a.last_updated)} />
      <DetailField label="Notes" value={a.notes} className="sm:col-span-2" />
    </div>
  );
}

function ActionRegisterView({ canEdit }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const { expandedIds, onToggle } = useExpanded();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/actions");
      setActions(data.actions || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load the Action Register."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (values) => {
    await api.post("/cfo/slt/v2/actions", values);
    setModal(null);
    await load();
  };

  const handleUpdate = async (id, values) => {
    await api.patch(`/cfo/slt/v2/actions/${id}`, values);
    setModal(null);
    await load();
  };

  const overdueCount = actions.filter((a) => a.is_overdue).length;
  const flaggedCount = actions.filter((a) => a.flag).length;

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="relative mb-4 overflow-hidden rounded-xl border border-[#082d82]/20 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold tracking-tight sm:text-lg">Action Register</h3>
            <p className="mt-0.5 text-xs text-white/75">
              {actions.length} item{actions.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Overdue" value={overdueCount} accent="bg-red-300 text-red-950" />
            <StatPill label="Flagged" value={flaggedCount} accent="bg-amber-300 text-amber-950" />
            {canEdit ? (
              <button
                type="button"
                onClick={() => setModal({ mode: "add" })}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#0B3EAF] shadow-sm transition hover:bg-white/90"
              >
                + Add item
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <RecordList
          records={actions}
          columns={ACTION_COLUMNS}
          renderDetail={renderActionDetail}
          canEdit={canEdit}
          onEdit={(a) => setModal({ mode: "edit", record: a })}
          expandedIds={expandedIds}
          onToggle={onToggle}
          emptyMessage={`No action items yet${canEdit ? ' — click "Add item" to create the first one.' : "."}`}
        />
      )}

      {modal?.mode === "add" ? (
        <RecordFormModal title="Add action item" fields={ACTION_FIELDS} initialValues={{}} onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Add item" />
      ) : null}
      {modal?.mode === "edit" ? (
        <RecordFormModal
          title="Edit action item"
          fields={ACTION_FIELDS}
          initialValues={modal.record}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleUpdate(modal.record.id, values)}
          submitLabel="Save changes"
        />
      ) : null}
    </div>
  );
}

// ── Decisions (Queue + Register) ────────────────────────────────────────

const QUEUE_FIELDS = [
  { key: "decision_required", label: "Decision Required", type: "textarea", required: true },
  { key: "assigned_to", label: "Assigned To", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "status", label: "Status", type: "suggest", suggestions: DECISION_QUEUE_STATUS_SUGGESTIONS },
  { key: "decision_deadline", label: "Decision Deadline", type: "date" },
  { key: "decision_type", label: "Decision Type", type: "suggest", suggestions: DECISION_TYPE_SUGGESTIONS },
  { key: "ceo_cfo_attention", label: "CEO/CFO Attention", type: "suggest", suggestions: CEO_CFO_ATTENTION_SUGGESTIONS },
  { key: "workstream", label: "Workstream", type: "suggest", suggestions: WORKSTREAM_SUGGESTIONS },
  { key: "strategic_objective", label: "Strategic Objective", type: "suggest", suggestions: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { key: "financial_impact", label: "Financial Impact", type: "suggest", suggestions: FINANCIAL_IMPACT_SUGGESTIONS },
  { key: "risk_impact", label: "Risk / Impact", type: "suggest", suggestions: RISK_IMPACT_SUGGESTIONS },
  { key: "recommendation", label: "Recommendation", type: "textarea" },
  { key: "further_action_required", label: "Further Action Required", type: "textarea" },
  { key: "context_input_required", label: "Context / Input Required", type: "textarea" },
  { key: "owned_by", label: "Owned By", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "requested_by", label: "Requested By", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "date_raised", label: "Date Raised", type: "date" },
  { key: "delay_impact_risk", label: "Delay Impact / Risk", type: "textarea" },
  { key: "blocker_waiting_on", label: "Blocker / Waiting On", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const QUEUE_COLUMNS = [
  {
    key: "decision_required",
    label: "Decision Required",
    width: "w-[28%]",
    render: (q) => (
      <div className="line-clamp-2 font-semibold leading-snug text-slate-900 dark:text-white" title={q.decision_required}>
        {q.decision_required}
      </div>
    ),
  },
  {
    key: "assigned_to",
    label: "Assigned To",
    width: "w-[13%]",
    render: (q) => <span className={`${PILL_BASE} ${pillClassFor(q.assigned_to)}`}>{q.assigned_to || "—"}</span>,
  },
  {
    key: "decision_deadline",
    label: "Deadline",
    width: "w-[14%]",
    render: (q) => <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(q.decision_deadline)}</div>,
  },
  {
    key: "status",
    label: "Status",
    width: "w-[13%]",
    render: (q) => <span className={`${PILL_BASE} ${pillClassFor(q.status)}`}>{q.status || "—"}</span>,
  },
  {
    key: "ceo_cfo_attention",
    label: "CEO/CFO Attention",
    width: "w-[16%]",
    render: (q) =>
      q.ceo_cfo_attention ? <span className={`${PILL_BASE} ${pillClassFor(q.ceo_cfo_attention)}`}>{q.ceo_cfo_attention}</span> : <span className="text-slate-400">—</span>,
  },
  {
    key: "workstream",
    label: "Workstream",
    width: "w-[12%]",
    render: (q) => (q.workstream ? <span className={`${PILL_BASE} ${pillClassFor(q.workstream)}`}>{q.workstream}</span> : <span className="text-slate-400">—</span>),
  },
];

function renderQueueDetail(q) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {q.data_issue ? (
        <div className="sm:col-span-2">
          <NoteBanner>Imported "Active Record" value looks like a broken formula result: {q.data_issue}. Flagged for manual review, not recomputed.</NoteBanner>
        </div>
      ) : null}
      <DetailField label="Decision Type" value={q.decision_type} />
      <DetailField label="Strategic Objective" value={q.strategic_objective} />
      <DetailField label="Financial Impact" value={q.financial_impact} />
      <DetailField label="Risk / Impact" value={q.risk_impact} />
      <DetailField label="Recommendation" value={q.recommendation} className="sm:col-span-2" />
      <DetailField label="Further Action Required" value={q.further_action_required} />
      <DetailField label="Context / Input Required" value={q.context_input_required} />
      <DetailField label="Owned By" value={q.owned_by} />
      <DetailField label="Requested By" value={q.requested_by} />
      <DetailField label="Date Raised" value={fmtDate(q.date_raised)} />
      <DetailField label="Delay Impact / Risk" value={q.delay_impact_risk} />
      <DetailField label="Blocker / Waiting On" value={q.blocker_waiting_on} />
      <DetailField label="Notes" value={q.notes} className="sm:col-span-2" />
    </div>
  );
}

const RECORD_DECISION_FIELDS = [
  { key: "decision_summary", label: "Decision Summary", type: "textarea", required: true },
  { key: "decision_maker", label: "Decision Maker", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "status", label: "Status", type: "suggest", suggestions: ["Decided", "Closed", "Completed"] },
  { key: "decision_date", label: "Decision Date", type: "date" },
  { key: "rationale", label: "Rationale", type: "textarea" },
  { key: "next_action", label: "Next Action", type: "textarea" },
  { key: "follow_up_status", label: "Follow-up Status", type: "suggest", suggestions: FOLLOW_UP_STATUS_SUGGESTIONS },
  { key: "due_date", label: "Follow-up Due Date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const REGISTER_FIELDS = [
  { key: "decision_required", label: "Decision Required", type: "textarea", required: true },
  { key: "decision_summary", label: "Decision Summary", type: "textarea" },
  { key: "decision_maker", label: "Decision Maker", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "status", label: "Status", type: "suggest", suggestions: STATUS_SUGGESTIONS },
  { key: "decision_date", label: "Decision Date", type: "date" },
  { key: "assigned_to", label: "Assigned To", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "decision_type", label: "Decision Type", type: "suggest", suggestions: DECISION_TYPE_SUGGESTIONS },
  { key: "ceo_cfo_attention", label: "CEO/CFO Attention", type: "suggest", suggestions: CEO_CFO_ATTENTION_SUGGESTIONS },
  { key: "workstream", label: "Workstream", type: "suggest", suggestions: WORKSTREAM_SUGGESTIONS },
  { key: "strategic_objective", label: "Strategic Objective", type: "suggest", suggestions: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { key: "financial_impact", label: "Financial Impact", type: "suggest", suggestions: FINANCIAL_IMPACT_SUGGESTIONS },
  { key: "risk_impact", label: "Risk / Impact", type: "suggest", suggestions: RISK_IMPACT_SUGGESTIONS },
  { key: "recommendation", label: "Recommendation", type: "textarea" },
  { key: "rationale", label: "Rationale", type: "textarea" },
  { key: "original_issue", label: "Original Issue", type: "textarea" },
  { key: "next_action", label: "Next Action", type: "textarea" },
  { key: "follow_up_status", label: "Follow-up Status", type: "suggest", suggestions: FOLLOW_UP_STATUS_SUGGESTIONS },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "owned_by", label: "Owned By", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "requested_by", label: "Requested By", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "requester", label: "Requester", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "date_raised", label: "Date Raised", type: "date" },
  { key: "delay_impact_risk", label: "Delay Impact / Risk", type: "textarea" },
  { key: "blocker_waiting_on", label: "Blocker / Waiting On", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const REGISTER_COLUMNS = [
  {
    key: "legacy_decision_log_id",
    label: "Decision ID",
    width: "w-[13%]",
    render: (r) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.legacy_decision_log_id || "—"}</span>,
  },
  {
    key: "decision_required",
    label: "Decision",
    width: "w-[27%]",
    render: (r) => (
      <div className="line-clamp-2 font-semibold leading-snug text-slate-900 dark:text-white" title={r.decision_required}>
        {r.data_issue ? <span className="mr-1 text-red-500" title={`Data issue: ${r.data_issue}`}>⚠</span> : null}
        {r.decision_required}
      </div>
    ),
  },
  {
    key: "decision_date",
    label: "Decision Date",
    width: "w-[13%]",
    render: (r) => <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(r.decision_date)}</div>,
  },
  {
    key: "status",
    label: "Status",
    width: "w-[13%]",
    render: (r) => <span className={`${PILL_BASE} ${pillClassFor(r.status)}`}>{r.status || "—"}</span>,
  },
  {
    key: "link_status",
    label: "Link Status",
    width: "w-[14%]",
    render: (r) => {
      const cls =
        r.link_status === "linked"
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
          : r.link_status === "unresolved"
          ? "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
      return <span className={`${PILL_BASE} ${cls}`}>{(r.link_status || "").replace(/_/g, " ") || "—"}</span>;
    },
  },
  {
    key: "ceo_cfo_attention",
    label: "CEO/CFO",
    width: "w-[13%]",
    render: (r) =>
      r.ceo_cfo_attention ? <span className={`${PILL_BASE} ${pillClassFor(r.ceo_cfo_attention)}`}>{r.ceo_cfo_attention}</span> : <span className="text-slate-400">—</span>,
  },
];

function renderRegisterDetail(r) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {r.data_issue ? (
        <div className="sm:col-span-2">
          <NoteBanner>
            Imported "Active Record" value looks like a broken formula result: {r.data_issue}. This matches a known issue in the source sheet (row 10, "ASP Strategy Items" —
            its Active Record formula referenced a deleted column). Flagged for manual review, not recomputed.
          </NoteBanner>
        </div>
      ) : null}
      <DetailField label="Decision Summary" value={r.decision_summary} className="sm:col-span-2" />
      <DetailField label="Decision Maker" value={r.decision_maker} />
      <DetailField label="Assigned To" value={r.assigned_to} />
      <DetailField label="Decision Type" value={r.decision_type} />
      <DetailField label="Strategic Objective" value={r.strategic_objective} />
      <DetailField label="Workstream" value={r.workstream} />
      <DetailField label="Financial Impact" value={r.financial_impact} />
      <DetailField label="Risk / Impact" value={r.risk_impact} />
      <DetailField label="Recommendation" value={r.recommendation} className="sm:col-span-2" />
      <DetailField label="Rationale" value={r.rationale} className="sm:col-span-2" />
      <DetailField label="Original Issue" value={r.original_issue} />
      <DetailField label="Next Action" value={r.next_action} />
      <DetailField label="Follow-up Status" value={r.follow_up_status} />
      <DetailField label="Due Date" value={fmtDate(r.due_date)} />
      <DetailField label="Owned By" value={r.owned_by} />
      <DetailField label="Requested By" value={r.requested_by} />
      <DetailField label="Requester" value={r.requester} />
      <DetailField label="Date Raised" value={fmtDate(r.date_raised)} />
      <DetailField label="Parent Decision Queue Id" value={r.parent_decision_id ? `#${r.parent_decision_id}` : null} />
      <DetailField label="Source Decision Id" value={r.source_decision_id} />
      <DetailField label="Delay Impact / Risk" value={r.delay_impact_risk} />
      <DetailField label="Blocker / Waiting On" value={r.blocker_waiting_on} />
      <DetailField label="Notes" value={r.notes} className="sm:col-span-2" />
    </div>
  );
}

const DECISIONS_SUB_TABS = [
  { key: "queue", label: "Decision Queue" },
  { key: "register", label: "Decision Register" },
];

function DecisionsView({ canEdit }) {
  const [subTab, setSubTab] = useState(DECISIONS_SUB_TABS[0].key);
  const [queue, setQueue] = useState([]);
  const [register, setRegister] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const queueExpanded = useExpanded();
  const registerExpanded = useExpanded();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [q, r] = await Promise.all([api.get("/cfo/slt/v2/decision-queue"), api.get("/cfo/slt/v2/decision-register")]);
      setQueue(q.data.items || []);
      setRegister(r.data.entries || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load Decisions."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateQueue = async (values) => {
    await api.post("/cfo/slt/v2/decision-queue", values);
    setModal(null);
    await load();
  };
  const handleUpdateQueue = async (id, values) => {
    await api.patch(`/cfo/slt/v2/decision-queue/${id}`, values);
    setModal(null);
    await load();
  };
  const handleCreateRegister = async (values) => {
    await api.post("/cfo/slt/v2/decision-register", values);
    setModal(null);
    await load();
  };
  const handleUpdateRegister = async (id, values) => {
    await api.patch(`/cfo/slt/v2/decision-register/${id}`, values);
    setModal(null);
    await load();
  };
  const handleRecordDecision = async (queueId, values) => {
    await api.post(`/cfo/slt/v2/decision-queue/${queueId}/record-decision`, values);
    setModal(null);
    setSubTab("register");
    await load();
  };

  const queueRowActions = canEdit
    ? (q) => (
        <GhostButton
          onClick={(e) => {
            e.stopPropagation();
            setModal({ mode: "record", record: q });
          }}
          className="border-[#0B3EAF] text-[#0B3EAF] dark:border-[#A7D344] dark:text-[#A7D344]"
        >
          Record decision →
        </GhostButton>
      )
    : null;

  const openQueueCount = queue.filter((q) => String(q.status || "").toLowerCase() !== "completed").length;
  const execAttentionCount = queue.filter((q) => !!q.ceo_cfo_attention && q.ceo_cfo_attention.toLowerCase() !== "no").length;

  return (
    <div>
      <ErrorBanner message={error} />
      <SubTabBar tabs={DECISIONS_SUB_TABS} active={subTab} onChange={setSubTab} />

      {subTab === "queue" ? (
        <div>
          <div className="relative mb-4 overflow-hidden rounded-xl border border-[#082d82]/20 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold tracking-tight sm:text-lg">Decision Queue</h3>
                <p className="mt-0.5 text-xs text-white/75">{queue.length} pending decision(s)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatPill label="Open" value={openQueueCount} accent="bg-amber-300 text-amber-950" />
                <StatPill label="CEO/CFO" value={execAttentionCount} accent="bg-red-300 text-red-950" />
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setModal({ mode: "add-queue" })}
                    className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#0B3EAF] shadow-sm transition hover:bg-white/90"
                  >
                    + Add decision
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : (
            <RecordList
              records={queue}
              columns={QUEUE_COLUMNS}
              renderDetail={renderQueueDetail}
              canEdit={canEdit}
              onEdit={(q) => setModal({ mode: "edit-queue", record: q })}
              rowActions={queueRowActions}
              expandedIds={queueExpanded.expandedIds}
              onToggle={queueExpanded.onToggle}
              emptyMessage={`No decisions in the queue yet${canEdit ? ' — click "Add decision" to create the first one.' : "."}`}
            />
          )}
        </div>
      ) : (
        <div>
          <NoteBanner>
            Decision Register only links back to a Decision Queue item via an explicit id — set either by the importer matching immutable keys, or by "Record decision" on the
            Queue tab — never by matching titles. Two known data issues from the source workbook: row 10 ("ASP Strategy Items") has a broken Active Record formula, and rows
            5-6 have an "ask" vs "log" misalignment from a bad backup-sheet merge — both are flagged on the affected rows below, not silently fixed.
          </NoteBanner>
          <div className="relative mb-4 overflow-hidden rounded-xl border border-[#082d82]/20 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold tracking-tight sm:text-lg">Decision Register</h3>
                <p className="mt-0.5 text-xs text-white/75">{register.length} logged decision(s)</p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setModal({ mode: "add-register" })}
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#0B3EAF] shadow-sm transition hover:bg-white/90"
                >
                  + Add entry
                </button>
              ) : null}
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : (
            <RecordList
              records={register}
              columns={REGISTER_COLUMNS}
              renderDetail={renderRegisterDetail}
              canEdit={canEdit}
              onEdit={(r) => setModal({ mode: "edit-register", record: r })}
              expandedIds={registerExpanded.expandedIds}
              onToggle={registerExpanded.onToggle}
              emptyMessage="No decisions logged yet."
            />
          )}
        </div>
      )}

      {modal?.mode === "add-queue" ? (
        <RecordFormModal title="Add decision to queue" fields={QUEUE_FIELDS} initialValues={{}} onClose={() => setModal(null)} onSubmit={handleCreateQueue} submitLabel="Add decision" />
      ) : null}
      {modal?.mode === "edit-queue" ? (
        <RecordFormModal
          title="Edit decision"
          fields={QUEUE_FIELDS}
          initialValues={modal.record}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleUpdateQueue(modal.record.id, values)}
          submitLabel="Save changes"
        />
      ) : null}
      {modal?.mode === "record" ? (
        <RecordFormModal
          title={`Record decision: ${modal.record.decision_required}`}
          fields={RECORD_DECISION_FIELDS}
          initialValues={{}}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleRecordDecision(modal.record.id, values)}
          submitLabel="Move to Decision Register"
          note="This moves the item into the permanent Decision Register, linked to this queue item by id — never by title match. The queue item is marked Decided and stays visible here."
        />
      ) : null}
      {modal?.mode === "add-register" ? (
        <RecordFormModal
          title="Add Decision Register entry"
          fields={REGISTER_FIELDS}
          initialValues={{}}
          onClose={() => setModal(null)}
          onSubmit={handleCreateRegister}
          submitLabel="Add entry"
        />
      ) : null}
      {modal?.mode === "edit-register" ? (
        <RecordFormModal
          title="Edit Decision Register entry"
          fields={REGISTER_FIELDS}
          initialValues={modal.record}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleUpdateRegister(modal.record.id, values)}
          submitLabel="Save changes"
        />
      ) : null}
    </div>
  );
}

// ── 90-Day Commitments ───────────────────────────────────────────────────

const COMMITMENT_FIELDS = [
  { key: "commitment_deliverable", label: "Commitment / Deliverable", type: "textarea", required: true },
  { key: "owner", label: "Owner", type: "suggest", suggestions: PEOPLE_SUGGESTIONS, required: true },
  { key: "success_measure", label: "Success Measure", type: "textarea" },
  { key: "rag_status", label: "RAG Status", type: "suggest", suggestions: RAG_STATUS_SUGGESTIONS },
  { key: "status1_raw", label: "Status", type: "text" },
  { key: "status2", label: "Status (Current)", type: "suggest", suggestions: STATUS2_SUGGESTIONS },
  { key: "date_record_entered", label: "Date Record Entered", type: "date" },
  { key: "date_assigned", label: "Date Assigned (if different)", type: "date" },
  { key: "original_due", label: "Original Due (override)", type: "date" },
  { key: "checkin_30_due", label: "30-Day Check-In Due (override)", type: "date" },
  { key: "checkin_30_notes", label: "30-Day Check-In Notes", type: "textarea" },
  { key: "checkin_60_due", label: "60-Day Check-In Due (override)", type: "date" },
  { key: "checkin_60_notes", label: "60-Day Check-In Notes", type: "textarea" },
  { key: "checkin_90_notes", label: "90-Day Check-In Notes", type: "textarea" },
  { key: "extension_approved_by", label: "Extension Approved By", type: "suggest", suggestions: PEOPLE_SUGGESTIONS },
  { key: "ext_approval_date", label: "Extension Approval Date", type: "date" },
  { key: "revised_due", label: "Revised Due", type: "date" },
  { key: "delivered_on", label: "Delivered On", type: "date" },
  { key: "change_risk_next_step", label: "Change / Risk / Next Step", type: "textarea" },
];

const COMMITMENT_COLUMNS = [
  {
    key: "commitment_deliverable",
    label: "Commitment / Deliverable",
    width: "w-[27%]",
    render: (c) => (
      <div className="line-clamp-2 font-semibold leading-snug text-slate-900 dark:text-white" title={c.commitment_deliverable}>
        {c.commitment_deliverable}
      </div>
    ),
  },
  {
    key: "owner",
    label: "Owner",
    width: "w-[11%]",
    render: (c) => <span className={`${PILL_BASE} ${pillClassFor(c.owner)}`}>{c.owner || "—"}</span>,
  },
  {
    key: "current_due",
    label: "Current Due",
    width: "w-[13%]",
    render: (c) => (
      <div>
        <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(c.current_due)}</div>
        <span className={`${PILL_BASE} mt-1 ${dueBadgeClass(c.days_until_due)}`}>{fmtDays(c.days_until_due)}</span>
      </div>
    ),
  },
  {
    key: "status2",
    label: "Status",
    width: "w-[11%]",
    render: (c) => <span className={`${PILL_BASE} ${pillClassFor(c.status2)}`}>{c.status2 || "—"}</span>,
  },
  {
    key: "rag_status",
    label: "RAG",
    width: "w-[16%]",
    render: (c) => (c.rag_status ? <span className={`${PILL_BASE} ${pillClassFor(c.rag_status)}`}>{c.rag_status}</span> : <span className="text-slate-400">—</span>),
  },
  {
    key: "report_cue",
    label: "Report Cue",
    width: "w-[13%]",
    render: (c) => (
      <span className={`${PILL_BASE} ${dueBadgeClass(c.is_overdue ? -1 : c.days_until_due)}`}>
        {c.report_cue}
        {c.extension_flagged ? " • Ext" : ""}
      </span>
    ),
  },
];

function renderCommitmentDetail(c) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DetailField label="Success Measure" value={c.success_measure} className="sm:col-span-2" />
      <DetailField label="Status (raw)" value={c.status1_raw} />
      <DetailField label="Date Record Entered" value={fmtDate(c.date_record_entered)} />
      <DetailField label="Date Assigned" value={fmtDate(c.date_assigned)} />
      <DetailField label="Original Due" value={fmtDate(c.original_due)} />
      <DetailField label="Revised Due" value={fmtDate(c.revised_due)} />
      <DetailField label="Extension Approved By" value={c.extension_approved_by} />
      <DetailField label="Extension Approval Date" value={fmtDate(c.ext_approval_date)} />
      <DetailField label="Delivered On" value={fmtDate(c.delivered_on)} />
      <DetailField label="30-Day Check-In Due" value={fmtDate(c.checkin_30_due)} />
      <DetailField label="30-Day Check-In Notes" value={c.checkin_30_notes} />
      <DetailField label="60-Day Check-In Due" value={fmtDate(c.checkin_60_due)} />
      <DetailField label="60-Day Check-In Notes" value={c.checkin_60_notes} />
      <DetailField label="90-Day Check-In Notes" value={c.checkin_90_notes} />
      <DetailField label="Change / Risk / Next Step" value={c.change_risk_next_step} className="sm:col-span-2" />
    </div>
  );
}

function CommitmentsView({ canEdit }) {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const { expandedIds, onToggle } = useExpanded();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/commitments");
      setCommitments(data.commitments || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load 90-Day Commitments."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (values) => {
    await api.post("/cfo/slt/v2/commitments", values);
    setModal(null);
    await load();
  };
  const handleUpdate = async (id, values) => {
    await api.patch(`/cfo/slt/v2/commitments/${id}`, values);
    setModal(null);
    await load();
  };

  const overdueCount = commitments.filter((c) => c.is_overdue).length;
  const extensionCount = commitments.filter((c) => c.extension_flagged).length;

  return (
    <div>
      <ErrorBanner message={error} />
      <NoteBanner>
        The source sheet's due-date formulas were self-referencing (only worked via Excel's calc-chain quirks), so Original/30-day/60-day/Current Due here are computed live
        from Date Assigned (or Date Record Entered) + 90/30/60 days, with Revised Due overriding Current Due when set — a documented substitute, not a port. Report Cue is
        computed the same way.
      </NoteBanner>
      <div className="relative mb-4 overflow-hidden rounded-xl border border-[#082d82]/20 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold tracking-tight sm:text-lg">90-Day Commitments</h3>
            <p className="mt-0.5 text-xs text-white/75">
              {commitments.length} commitment{commitments.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Overdue" value={overdueCount} accent="bg-red-300 text-red-950" />
            <StatPill label="Ext. flagged" value={extensionCount} accent="bg-amber-300 text-amber-950" />
            {canEdit ? (
              <button
                type="button"
                onClick={() => setModal({ mode: "add" })}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#0B3EAF] shadow-sm transition hover:bg-white/90"
              >
                + Add commitment
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <RecordList
          records={commitments}
          columns={COMMITMENT_COLUMNS}
          renderDetail={renderCommitmentDetail}
          canEdit={canEdit}
          onEdit={(c) => setModal({ mode: "edit", record: c })}
          expandedIds={expandedIds}
          onToggle={onToggle}
          emptyMessage={`No commitments yet${canEdit ? ' — click "Add commitment" to create the first one.' : "."}`}
        />
      )}

      {modal?.mode === "add" ? (
        <RecordFormModal title="Add 90-day commitment" fields={COMMITMENT_FIELDS} initialValues={{}} onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Add commitment" />
      ) : null}
      {modal?.mode === "edit" ? (
        <RecordFormModal
          title="Edit commitment"
          fields={COMMITMENT_FIELDS}
          initialValues={modal.record}
          onClose={() => setModal(null)}
          onSubmit={(values) => handleUpdate(modal.record.id, values)}
          submitLabel="Save changes"
        />
      ) : null}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────

function KpiTile({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className={`text-2xl font-bold ${accent || "text-slate-900 dark:text-white"}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function DashboardView() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/cfo/slt/v2/dashboard");
        if (active) setDashboard(data);
      } catch (e) {
        if (active) setError(friendlyErrorMessage(e, "Could not load the Dashboard."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!dashboard) return null;

  return (
    <div>
      <NoteBanner>
        Replaces the source workbook's Board Summary / Executive Dashboard tabs (and their duplicate "(2)" versions), which held a stale snapshot dated Jul 22, 2026. These
        numbers are computed live from the current Action Register, Decision Queue/Register, and 90-Day Commitments rows, as of {fmtDate(dashboard.as_of)}.
      </NoteBanner>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Open Actions" value={dashboard.actions.open} />
        <KpiTile label="Overdue Actions" value={dashboard.actions.overdue} accent="text-red-600 dark:text-red-400" />
        <KpiTile label="Critical/High Flagged" value={dashboard.actions.flagged_critical_high} accent="text-amber-600 dark:text-amber-400" />
        <KpiTile label="Decisions Needing Exec Attn" value={dashboard.decisions.queue_needs_exec_attention} accent="text-amber-600 dark:text-amber-400" />
        <KpiTile label="Open Decision Queue" value={dashboard.decisions.queue_open} />
        <KpiTile label="Overdue Decisions" value={dashboard.decisions.queue_overdue} accent="text-red-600 dark:text-red-400" />
        <KpiTile label="Open Commitments" value={dashboard.commitments.open} />
        <KpiTile label="Overdue Commitments" value={dashboard.commitments.overdue} accent="text-red-600 dark:text-red-400" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Accountability roster (open / overdue)</h4>
          <div className="space-y-1.5">
            {dashboard.performance_roster.map((p) => (
              <div key={p.owner} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5">
                <span className={`${PILL_BASE} ${pillClassFor(p.owner)}`}>{p.owner}</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {p.open_actions} actions ({p.overdue_actions} late) &middot; {p.open_commitments} commitments ({p.overdue_commitments} late)
                </span>
              </div>
            ))}
            {!dashboard.performance_roster.length ? <p className="text-xs italic text-slate-400">No open items.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Open actions by strategic objective</h4>
          <div className="space-y-1.5">
            {dashboard.actions.by_strategic_objective.map((s) => (
              <div key={s.strategic_objective} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5">
                <span className={`${PILL_BASE} ${pillClassFor(s.strategic_objective)}`}>{s.strategic_objective}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{s.count}</span>
              </div>
            ))}
            {!dashboard.actions.by_strategic_objective.length ? <p className="text-xs italic text-slate-400">No open items.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 lg:col-span-2">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Upcoming calendar (next 10)</h4>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {dashboard.calendar.upcoming.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5">
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">{e.event_title}</span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">{fmtDate(e.start_date)}</span>
              </div>
            ))}
            {!dashboard.calendar.upcoming.length ? <p className="text-xs italic text-slate-400">No upcoming events.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Weekly Review ────────────────────────────────────────────────────────

const AREA_LABELS = {
  action: "Action Register",
  decision_queue: "Decision Queue",
  decision_register: "Decision Register",
  commitment: "90-Day Commitment",
  calendar: "Calendar",
};

function WeeklyReviewView() {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/cfo/slt/v2/weekly-review");
        if (active) setReview(data);
      } catch (e) {
        if (active) setError(friendlyErrorMessage(e, "Could not load Weekly Review."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!review) return null;

  return (
    <div>
      <NoteBanner>{review.note}</NoteBanner>
      {!review.items.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-700 dark:bg-white/[0.03]">
          <p className="text-sm italic text-slate-500 dark:text-slate-400">Nothing currently needs attention this week.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {review.items.map((item) => (
            <div
              key={`${item.area}-${item.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`${PILL_BASE} ${pillClassFor(AREA_LABELS[item.area])}`}>{AREA_LABELS[item.area] || item.area}</span>
                  {item.flagged ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">
                      Flagged
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white" title={item.title}>
                  {item.title}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {item.owner || "Unassigned"} &middot; {item.status || "—"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Due</div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(item.due_date)}</div>
                <span className={`${PILL_BASE} mt-1 ${item.is_overdue ? dueBadgeClass(-1) : dueBadgeClass(1)}`}>{item.is_overdue ? "Overdue" : "Due soon"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reference (Lists & Controls, Enhancement Log, 5-Minute Summary) ────────

function ReferenceView() {
  return (
    <div>
      <NoteBanner>
        The "5-Minute Summary" sheet below is a hand-written, point-in-time snapshot dated Jul 22, 2026 — shown as-is for context, not as current data. See the Dashboard tab
        for live counts.
      </NoteBanner>

      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Lists &amp; Controls — dropdown values</h4>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Already powering the suggestion fields on every Add/Edit form above — shown here read-only for reference.
      </p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LISTS_AND_CONTROLS_REFERENCE.map((list) => (
          <div key={list.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{list.label}</h5>
            <div className="flex flex-wrap gap-1.5">
              {list.values.map((v) => (
                <span key={v} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {v}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">5-Minute Executive Summary (as of Jul 22, 2026)</h4>
      <p className="mb-3 text-sm italic text-slate-600 dark:text-slate-300">
        "This workbook is a board-ready SLT action and decision tracker. The immediate management focus is six active action records, especially overdue
        compensation/HR items, critical ASP Go-Live readiness, CFO governance controls, and items requiring CEO/CFO escalation."
      </p>

      <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-900 dark:text-white">Enhancement Log</h4>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-[rgba(11,62,175,0.06)] dark:border-slate-600 dark:bg-[rgba(167,211,68,0.08)]">
              <th className={TH}>Area</th>
              <th className={TH}>Recommendation Added</th>
              <th className={TH}>Why It Matters</th>
            </tr>
          </thead>
          <tbody>
            {ENHANCEMENT_LOG.map((row, idx) => (
              <tr key={idx} className={`${zebra(idx)} border-b border-slate-200/80 dark:border-slate-700/50`}>
                <td className={TD}>
                  <span className={`${PILL_BASE} ${pillClassFor(row.area)}`}>{row.area}</span>
                </td>
                <td className={TD}>{row.added}</td>
                <td className={TD}>{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Top-level board ──────────────────────────────────────────────────────

const ACTION_TRACKER_SUB_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "actions", label: "Action Register" },
  { key: "decisions", label: "Decisions" },
  { key: "commitments", label: "90-Day Commitments" },
  { key: "weekly_review", label: "Weekly Review" },
  { key: "reference", label: "Reference" },
];

export default function ActionTrackerBoard({ canEdit }) {
  const [subTab, setSubTab] = useState(ACTION_TRACKER_SUB_TABS[0].key);

  const content = useMemo(() => {
    switch (subTab) {
      case "actions":
        return <ActionRegisterView canEdit={canEdit} />;
      case "decisions":
        return <DecisionsView canEdit={canEdit} />;
      case "commitments":
        return <CommitmentsView canEdit={canEdit} />;
      case "weekly_review":
        return <WeeklyReviewView />;
      case "reference":
        return <ReferenceView />;
      default:
        return <DashboardView />;
    }
  }, [subTab, canEdit]);

  return (
    <div>
      <SubTabBar tabs={ACTION_TRACKER_SUB_TABS} active={subTab} onChange={setSubTab} />
      {content}
    </div>
  );
}
