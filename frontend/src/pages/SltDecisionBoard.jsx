import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import {
  STATUS_OPTIONS,
  FINANCIAL_IMPACT_OPTIONS,
  RISK_IMPACT_OPTIONS,
  PEOPLE_SUGGESTIONS,
  DECISION_TYPE_OPTIONS,
  CEO_CFO_ATTENTION_OPTIONS,
  FURTHER_ACTION_OPTIONS,
  WORKSTREAM_SUGGESTIONS,
  STRATEGIC_OBJECTIVE_SUGGESTIONS,
} from "../constants/sltDecisionLists";
import { computeDecisionKpis, isDecisionOverdue } from "../utils/sltDecisionAnalytics";

/**
 * SLT Tracker → "Decisions" tab — Decision Queue / Decision Register.
 *
 * The second of the two top-level tabs under the "SLT Tracker" radio choice
 * in CfoReportsPage.jsx (see SltActionTrackerBoard.jsx's outer component,
 * which renders this alongside the original Action Tracker content as a
 * sibling tab, not a replacement for it). Built from the uploaded source
 * workbook — SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx
 * — specifically its "Decision Queue" and "Decision Register" sheets (its
 * 90-Day Commitments sheet is the one board still left to build later).
 *
 * Backend: GET/POST/PATCH /cfo/slt/v2/decisions plus .../:id/archive
 * (sltDecisionRegister.service.js, slt_decision_register table). There is
 * only ONE table and ONE list endpoint behind these two tabs — a decision
 * is shown under "Decision Queue" while `active` (pending) and moves to
 * "Decision Register" the moment `decided` (Status = Completed/Cancelled)
 * becomes true, both computed server-side exactly the way the source
 * workbook's own Active Record formula did. In the workbook this same move
 * was a manual copy-paste between two sheets; here it just happens when you
 * save a Status change, see the longer design-deviation note at the top of
 * sltDecisionRegister.service.js.
 *
 * Visual style mirrors SltActionTrackerBoard.jsx /
 * ItTicketsMonitorTable.jsx — same gradient banner header with stat pills,
 * same Excel-style per-column filter dropdowns, same tinted-column table.
 * Those helpers are duplicated here rather than imported, following this
 * codebase's own convention (see SltActionTrackerBoard.jsx's header
 * comment) of local copies per file instead of a shared UI kit.
 */

const SUB_TABS = [
  { key: "decision_queue", label: "Decision Queue" },
  { key: "decision_register", label: "Decision Register" },
];

const DECISION_FIELDS = [
  { key: "decision_required", label: "Decision Required", type: "textarea", required: true },
  { key: "workstream", label: "Workstream", type: "select_other", suggestions: WORKSTREAM_SUGGESTIONS },
  { key: "assigned_to", label: "Assigned To", type: "select_other", suggestions: PEOPLE_SUGGESTIONS },
  { key: "decision_deadline", label: "Decision Deadline", type: "date" },
  { key: "recommendation", label: "Recommendation", type: "textarea" },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  { key: "decision_type", label: "Decision Type", type: "select", options: DECISION_TYPE_OPTIONS },
  { key: "ceo_cfo_attention", label: "CEO/CFO Attention", type: "select", options: CEO_CFO_ATTENTION_OPTIONS },
  { key: "financial_impact", label: "Financial Impact", type: "select", options: FINANCIAL_IMPACT_OPTIONS },
  { key: "risk_impact", label: "Risk Impact", type: "select", options: RISK_IMPACT_OPTIONS },
  { key: "strategic_objective", label: "Strategic Objective", type: "select_other", suggestions: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { key: "decision_date", label: "Decision Date", type: "date" },
  { key: "further_action_required", label: "Further Action Required", type: "select", options: FURTHER_ACTION_OPTIONS },
  { key: "context_input_required", label: "Context / Input Required", type: "textarea" },
  { key: "owned_by", label: "Owned By", type: "select_other", suggestions: PEOPLE_SUGGESTIONS },
  { key: "requested_by", label: "Requested By", type: "select_other", suggestions: PEOPLE_SUGGESTIONS },
  { key: "date_raised", label: "Date Raised", type: "date" },
  { key: "delay_impact_risk", label: "Delay Impact / Risk", type: "textarea" },
  { key: "blocker", label: "Blocker / Waiting On", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

function emptyFormValues() {
  const v = {};
  for (const f of DECISION_FIELDS) v[f.key] = "";
  v.status = "Not Started";
  v.further_action_required = "No";
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

// ── Small shared presentational bits — see SltActionTrackerBoard.jsx's
// header comment for why these are duplicated rather than imported. ──

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

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel }) {
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
        <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Enter a custom value" className="mt-1.5" />
      ) : null}
    </div>
  );
}

function StrictSelectField({ value, options, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

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
  if (def.type === "select") {
    return <StrictSelectField value={value} options={def.options} onChange={onChange} />;
  }
  if (def.type === "select_other") {
    return <SelectWithOtherField value={value} options={def.suggestions} onChange={onChange} />;
  }
  return <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} />;
}

function DecisionFormModal({ title, initialValues, onClose, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState(() => ({ ...emptyFormValues(), ...initialValues }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save this decision."));
    } finally {
      setSaving(false);
    }
  };

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
          {DECISION_FIELDS.map((def) => (
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
    </div>,
    document.body
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

// ── Excel-style column filters — see SltActionTrackerBoard.jsx for the
// full explanation; duplicated here verbatim. ──

function useClosePopover(open, onClose, extraRefs) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      const insideAny = extraRefs.some((r) => r.current && r.current.contains(e.target));
      if (!insideAny) onClose();
    };
    const onScrollOrResize = () => onClose();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

function ColumnFilterHeader({ label, active, align = "left", children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 4,
        left: align === "right" ? undefined : Math.max(8, rect.left),
        right: align === "right" ? Math.max(8, window.innerWidth - rect.right) : undefined,
      });
    }
    setOpen(true);
  };

  useClosePopover(open, () => setOpen(false), [btnRef, panelRef]);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case transition hover:bg-black/5 dark:hover:bg-white/10 ${
          active ? "text-[#0B3EAF] dark:text-[#A7D344]" : ""
        }`}
      >
        <span className="uppercase">{label}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" fill="none" className="h-2 w-2.5 shrink-0 opacity-60" aria-hidden>
          <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" aria-hidden /> : null}
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
              className="z-[100] w-60 rounded-lg border border-slate-200 bg-white p-2 text-xs normal-case text-slate-800 shadow-2xl dark:border-slate-700 dark:bg-[#1a1a1a] dark:text-slate-100"
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const CHECKBOX_FILTER_NONE = "__none_selected__";

function CheckboxFilterContent({ options, selected, onChange, searchable = false }) {
  const [query, setQuery] = useState("");
  const allValues = options.map((o) => o.value);
  const isChecked = (v) => selected.size === 0 || selected.has(v);
  const toggle = (v) => {
    let base = selected.size === 0 ? new Set(allValues) : new Set(selected);
    if (base.has(v)) base.delete(v);
    else base.add(v);
    if (base.size === allValues.length) base = new Set();
    onChange(base);
  };
  const allSelected = selected.size === 0;
  const noneSelected = selected.size > 0 && allValues.every((v) => !selected.has(v));
  const visible = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  return (
    <div>
      {searchable ? (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-xs font-normal outline-none focus:border-[#0B3EAF] dark:border-slate-700 dark:bg-[#141414] dark:focus:border-[#A7D344]"
        />
      ) : null}
      <div className="mb-1.5 flex items-center gap-2">
        {!allSelected ? (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-[10px] font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            Select all
          </button>
        ) : null}
        {!allSelected && !noneSelected ? <span className="text-[10px] text-slate-300 dark:text-slate-600">|</span> : null}
        {!noneSelected ? (
          <button
            type="button"
            onClick={() => onChange(new Set([CHECKBOX_FILTER_NONE]))}
            className="text-[10px] font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-xs italic text-slate-400">No matches.</p>
        ) : (
          visible.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs font-normal hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={isChecked(o.value)}
                onChange={() => toggle(o.value)}
                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-[#0B3EAF] focus:ring-[#0B3EAF] dark:border-slate-600"
              />
              <span className="min-w-0 flex-1 truncate" title={o.label}>
                {o.label}
              </span>
              <span className="shrink-0 text-slate-400">{o.count}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function RadioFilterContent({ options, value, onChange, name }) {
  return (
    <div className="space-y-0.5">
      {options.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs font-normal hover:bg-slate-50 dark:hover:bg-white/5">
          <input
            type="radio"
            name={name}
            checked={value === o.key}
            onChange={() => onChange(o.key)}
            className="h-3.5 w-3.5 shrink-0 border-slate-300 text-[#0B3EAF] focus:ring-[#0B3EAF] dark:border-slate-600"
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function TextFilterContent({ value, onChange, placeholder }) {
  return (
    <div>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-normal outline-none focus:border-[#0B3EAF] dark:border-slate-700 dark:bg-[#141414] dark:focus:border-[#A7D344]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1.5 text-[10px] font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

// ── Option-list builders ──

function fixedOptionsWithCounts(items, field, knownOptions) {
  return knownOptions.map((v) => ({ value: v, label: v, count: items.filter((i) => i[field] === v).length }));
}

function dynamicOptionsWithCounts(items, field) {
  const counts = new Map();
  for (const i of items) {
    const v = (i[field] || "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// Generic date-range filter, reused for both the Queue's "Decision
// Deadline" column and the Register's "Decision Date" column — which field
// it reads, and which range options make sense, differ per mode (see
// DATE_RANGE_OPTIONS_BY_MODE below).
function dateMatchesRange(dateValue, key) {
  if (key === "all") return true;
  if (key === "no_date") return !dateValue;
  if (!dateValue) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateValue}T00:00:00`);
  if (key === "past") return d < today;
  if (key === "this_week") {
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return d >= today && d <= end;
  }
  if (key === "this_month") {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d >= today && d <= end;
  }
  return true;
}

const DATE_RANGE_OPTIONS_BY_MODE = {
  queue: [
    { key: "all", label: "All" },
    { key: "past", label: "Overdue" },
    { key: "this_week", label: "Due this week" },
    { key: "this_month", label: "Due this month" },
    { key: "no_date", label: "No deadline" },
  ],
  register: [
    { key: "all", label: "All" },
    { key: "this_week", label: "Decided this week" },
    { key: "this_month", label: "Decided this month" },
    { key: "no_date", label: "No decision date" },
  ],
};

// ── Column tinting — same keys/colors as SltActionTrackerBoard.jsx's
// Action Register table, re-slotted onto Decision columns (decision→item,
// workstream→category, person→owner, date→due, decisionType→priority,
// ceoCfo→escalation) purely so the two tables read as one visual family. ──

const HEADER_COL_BG = {
  id: "bg-slate-200/70 dark:bg-slate-800",
  decision: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  workstream: "bg-amber-100/50 dark:bg-amber-950/30",
  person: "bg-violet-100/45 dark:bg-violet-950/30",
  date: "bg-slate-200/55 dark:bg-slate-800/80",
  status: "bg-sky-100/55 dark:bg-sky-950/35",
  decisionType: "bg-emerald-100/55 dark:bg-emerald-950/35",
  ceoCfo: "bg-red-100/45 dark:bg-red-950/30",
  risk: "bg-rose-100/50 dark:bg-rose-950/30",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

function bodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    id: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    decision: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    workstream: alt ? "bg-amber-50/85 dark:bg-amber-950/18" : "bg-amber-50/45 dark:bg-amber-950/10",
    person: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    date: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    status: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    decisionType: alt ? "bg-emerald-50/90 dark:bg-emerald-950/20" : "bg-emerald-50/50 dark:bg-emerald-950/10",
    ceoCfo: alt ? "bg-red-50/85 dark:bg-red-950/18" : "bg-red-50/45 dark:bg-red-950/10",
    risk: alt ? "bg-rose-50/85 dark:bg-rose-950/18" : "bg-rose-50/45 dark:bg-rose-950/10",
    actions: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
  };
  return `${map[col] || (alt ? "bg-[#eef3fa]" : "bg-white")} group-hover:brightness-[0.98] dark:group-hover:brightness-110`;
}

const TH_BASE = "px-2 py-3 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const TD = "px-2 py-2.5 align-middle text-xs break-words";

function vline(isLast) {
  return isLast ? "" : "border-r border-slate-200 dark:border-slate-600/55";
}

function thClass(col, extra = "", isLast = false) {
  return [TH_BASE, HEADER_COL_BG[col] || "", vline(isLast), extra].filter(Boolean).join(" ");
}

function tdClass(col, rowIdx, extra = "", isLast = false) {
  return [TD, bodyColBg(col, rowIdx), vline(isLast), extra].filter(Boolean).join(" ");
}

// ── Stat pills + gradient banner header ──

function StatPill({ label, value, accent }) {
  return (
    <div className={`flex min-h-[3rem] min-w-[3.75rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-center ${accent}`}>
      <div className="text-base font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

function BoardHeader({ title, pills, right }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-xl border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white shadow-lg">
      <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl" style={{ color: "#ffffff" }}>
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-2">{pills}</div>
          {right}
        </div>
      </div>
    </div>
  );
}

const BADGE = "inline-flex max-w-full items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide";

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <span className={`${BADGE} bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800`}>{status}</span>;
}

function DecisionTypeBadge({ value }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className={`${BADGE} bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800`}>
      {value}
    </span>
  );
}

function CeoCfoBadge({ value }) {
  if (!value || value === "No") return <span className="text-slate-400">No</span>;
  return <span className={`${BADGE} bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800`}>{value}</span>;
}

function RiskBadge({ risk }) {
  if (!risk) return <span className="text-slate-400">—</span>;
  const cls =
    risk === "High"
      ? "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800"
      : risk === "Medium"
        ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800"
        : "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800";
  return <span className={`${BADGE} ${cls}`}>{risk}</span>;
}

function DateBadge({ item, field }) {
  const value = item[field];
  if (!value) return <span className="text-slate-400">—</span>;
  const overdue = field === "decision_deadline" && isDecisionOverdue(item);
  const cls = overdue
    ? "text-red-700 dark:text-red-300 font-semibold"
    : item.active && field === "decision_deadline" && item.days_until_deadline != null && item.days_until_deadline <= 14
      ? "text-amber-700 dark:text-amber-300 font-semibold"
      : "text-slate-600 dark:text-slate-300";
  return <span className={cls}>{fmtDate(value)}</span>;
}

const KPI_PILL_ACCENTS = {
  pending: "bg-white/15 ring-1 ring-white/20",
  decided: "bg-sky-300 text-sky-950",
  overdue: "bg-red-300 text-red-950",
  highRisk: "bg-rose-300 text-rose-950",
  ceoCfoAttention: "bg-[#A7D344] text-[#0a0a0a]",
};

const KPI_LABELS = {
  pending: "Pending",
  decided: "Decided",
  overdue: "Overdue",
  highRisk: "High Risk",
  ceoCfoAttention: "CEO/CFO Attn.",
};

function kpiPills(kpis) {
  return Object.keys(KPI_LABELS).map((k) => <StatPill key={k} label={KPI_LABELS[k]} value={kpis[k]} accent={KPI_PILL_ACCENTS[k]} />);
}

// Single table, shared by both tabs — the columns are identical, only the
// "person" column (Assigned To vs. Owned By) and "date" column (Decision
// Deadline vs. Decision Date) swap meaning by mode, same real-world split
// the source workbook's own two sheets had.
function DecisionTable({ mode, items, canEdit, onEdit, onArchive }) {
  const personField = mode === "queue" ? "assigned_to" : "owned_by";
  const personLabel = mode === "queue" ? "Assigned To" : "Owned By";
  const dateField = mode === "queue" ? "decision_deadline" : "decision_date";
  const dateLabel = mode === "queue" ? "Deadline" : "Decision Date";

  const [decisionQuery, setDecisionQuery] = useState("");
  const [workstreamFilter, setWorkstreamFilter] = useState(() => new Set());
  const [personFilter, setPersonFilter] = useState(() => new Set());
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [decisionTypeFilter, setDecisionTypeFilter] = useState(() => new Set());
  const [ceoCfoFilter, setCeoCfoFilter] = useState(() => new Set());
  const [riskFilter, setRiskFilter] = useState(() => new Set());
  const [idSortDir, setIdSortDir] = useState(mode === "queue" ? "asc" : "desc");

  const workstreamOptions = useMemo(() => dynamicOptionsWithCounts(items, "workstream"), [items]);
  const personOptions = useMemo(() => dynamicOptionsWithCounts(items, personField), [items, personField]);
  const statusOptions = useMemo(() => fixedOptionsWithCounts(items, "status", STATUS_OPTIONS), [items]);
  const decisionTypeOptions = useMemo(() => fixedOptionsWithCounts(items, "decision_type", DECISION_TYPE_OPTIONS), [items]);
  const ceoCfoOptions = useMemo(() => fixedOptionsWithCounts(items, "ceo_cfo_attention", CEO_CFO_ATTENTION_OPTIONS), [items]);
  const riskOptions = useMemo(() => fixedOptionsWithCounts(items, "risk_impact", RISK_IMPACT_OPTIONS), [items]);
  const dateRangeOptions = DATE_RANGE_OPTIONS_BY_MODE[mode];

  const activeFilterCount = [
    decisionQuery.trim() !== "",
    workstreamFilter.size > 0,
    personFilter.size > 0,
    dateFilter !== "all",
    statusFilter.size > 0,
    decisionTypeFilter.size > 0,
    ceoCfoFilter.size > 0,
    riskFilter.size > 0,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setDecisionQuery("");
    setWorkstreamFilter(new Set());
    setPersonFilter(new Set());
    setDateFilter("all");
    setStatusFilter(new Set());
    setDecisionTypeFilter(new Set());
    setCeoCfoFilter(new Set());
    setRiskFilter(new Set());
  };

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (decisionQuery.trim() && !String(i.decision_required || "").toLowerCase().includes(decisionQuery.trim().toLowerCase())) return false;
      if (workstreamFilter.size > 0 && !workstreamFilter.has((i.workstream || "").trim())) return false;
      if (personFilter.size > 0 && !personFilter.has((i[personField] || "").trim())) return false;
      if (!dateMatchesRange(i[dateField], dateFilter)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;
      if (decisionTypeFilter.size > 0 && !decisionTypeFilter.has(i.decision_type)) return false;
      if (ceoCfoFilter.size > 0 && !ceoCfoFilter.has(i.ceo_cfo_attention)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(i.risk_impact)) return false;
      return true;
    });
    list = [...list].sort((a, b) => (idSortDir === "asc" ? a.id - b.id : b.id - a.id));
    return list;
  }, [items, decisionQuery, workstreamFilter, personFilter, dateField, dateFilter, statusFilter, decisionTypeFilter, ceoCfoFilter, riskFilter, idSortDir]);

  return (
    <div>
      {activeFilterCount > 0 ? (
        <div className="mb-4 flex items-center justify-end gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
          </span>
          <button
            type="button"
            onClick={clearAllFilters}
            className="font-semibold text-[#0B3EAF] underline decoration-[#0B3EAF]/40 underline-offset-2 hover:decoration-[#0B3EAF] dark:text-[#A7D344] dark:decoration-[#A7D344]/40"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {mode === "queue" ? "No pending decisions right now." : "No decided items yet."}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-600/50">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <thead className="border-b-2 border-slate-300 dark:border-slate-600">
              <tr>
                <th className={thClass("id", "w-[6%]")}>
                  <button
                    type="button"
                    onClick={() => setIdSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case text-[9px] font-bold uppercase tracking-wide text-slate-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                    title={idSortDir === "asc" ? "Oldest first — click for newest first" : "Newest first — click for oldest first"}
                  >
                    <span>ID</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 12 8"
                      fill="none"
                      className={`h-2 w-2.5 shrink-0 opacity-70 transition-transform ${idSortDir === "desc" ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </th>
                <th className={thClass("decision", "w-[16%]")}>
                  <ColumnFilterHeader label="Decision" active={decisionQuery.trim() !== ""}>
                    <TextFilterContent value={decisionQuery} onChange={setDecisionQuery} placeholder="Contains…" />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("workstream", "w-[11%]")}>
                  <ColumnFilterHeader label="Workstream" active={workstreamFilter.size > 0}>
                    <CheckboxFilterContent options={workstreamOptions} selected={workstreamFilter} onChange={setWorkstreamFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("person", "w-[10%]")}>
                  <ColumnFilterHeader label={personLabel} active={personFilter.size > 0}>
                    <CheckboxFilterContent options={personOptions} selected={personFilter} onChange={setPersonFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("date", "w-[10%]")}>
                  <ColumnFilterHeader label={dateLabel} active={dateFilter !== "all"}>
                    <RadioFilterContent name={`decision-${mode}-date`} options={dateRangeOptions} value={dateFilter} onChange={setDateFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("status", "w-[11%]")}>
                  <ColumnFilterHeader label="Status" active={statusFilter.size > 0}>
                    <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("decisionType", "w-[11%]")}>
                  <ColumnFilterHeader label="Decision Type" active={decisionTypeFilter.size > 0}>
                    <CheckboxFilterContent options={decisionTypeOptions} selected={decisionTypeFilter} onChange={setDecisionTypeFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("ceoCfo", "w-[9%]")}>
                  <ColumnFilterHeader label="CEO/CFO" active={ceoCfoFilter.size > 0}>
                    <CheckboxFilterContent options={ceoCfoOptions} selected={ceoCfoFilter} onChange={setCeoCfoFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("risk", "w-[8%]")}>
                  <ColumnFilterHeader label="Risk" active={riskFilter.size > 0}>
                    <CheckboxFilterContent options={riskOptions} selected={riskFilter} onChange={setRiskFilter} />
                  </ColumnFilterHeader>
                </th>
                {canEdit ? <th className={thClass("actions", "w-[8%]", true)}>Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 10 : 9} className="px-6 py-8 text-center text-sm text-slate-400">
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((i, rowIdx) => (
                  <tr key={i.id} className="group">
                    <td className={tdClass("id", rowIdx, "font-mono text-slate-500 dark:text-slate-400")}>{i.display_id}</td>
                    <td className={tdClass("decision", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{i.decision_required}</td>
                    <td className={tdClass("workstream", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.workstream || "—"}</td>
                    <td className={tdClass("person", rowIdx, "text-slate-600 dark:text-slate-300")}>{i[personField] || "—"}</td>
                    <td className={tdClass("date", rowIdx)}>
                      <DateBadge item={i} field={dateField} />
                    </td>
                    <td className={tdClass("status", rowIdx)}>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className={tdClass("decisionType", rowIdx)}>
                      <DecisionTypeBadge value={i.decision_type} />
                    </td>
                    <td className={tdClass("ceoCfo", rowIdx)}>
                      <CeoCfoBadge value={i.ceo_cfo_attention} />
                    </td>
                    <td className={tdClass("risk", rowIdx)}>
                      <RiskBadge risk={i.risk_impact} />
                    </td>
                    {canEdit ? (
                      <td className={tdClass("actions", rowIdx, "", true)}>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => onEdit(i)}
                            className="w-full rounded-full border border-slate-300 py-0.5 text-center text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onArchive(i)}
                            className="w-full rounded-full border border-slate-300 py-0.5 text-center text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SltDecisionBoard({ canEdit }) {
  const [subTab, setSubTab] = useState(SUB_TABS[0].key);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "add" } | { mode: "edit", item }
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/decisions");
      setItems(data.decisions || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load Decisions."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => computeDecisionKpis(items), [items]);
  const queueItems = useMemo(() => items.filter((i) => i.active), [items]);
  const registerItems = useMemo(() => items.filter((i) => i.decided), [items]);

  const handleCreate = async (values) => {
    await api.post("/cfo/slt/v2/decisions", values);
    setModal(null);
    await load();
  };

  const handleUpdate = async (id, values) => {
    await api.patch(`/cfo/slt/v2/decisions/${id}`, values);
    setModal(null);
    await load();
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.post(`/cfo/slt/v2/decisions/${archiveTarget.id}/archive`);
      setArchiveTarget(null);
      await load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not archive this decision."));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div>
      <SubTabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} />

      <BoardHeader
        title={subTab === "decision_queue" ? "Decision Queue" : "Decision Register"}
        pills={[
          <StatPill key="total" label="Total" value={kpis.total} accent="bg-white/15 ring-1 ring-white/20" />,
          ...kpiPills(kpis),
        ]}
        right={canEdit ? <PrimaryButton onClick={() => setModal({ mode: "add" })}>+ Add Decision</PrimaryButton> : null}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 px-6 py-16">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
          <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading…</p>
        </div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : subTab === "decision_queue" ? (
        <DecisionTable
          mode="queue"
          items={queueItems}
          canEdit={canEdit}
          onEdit={(item) => setModal({ mode: "edit", item })}
          onArchive={(item) => setArchiveTarget(item)}
        />
      ) : (
        <DecisionTable
          mode="register"
          items={registerItems}
          canEdit={canEdit}
          onEdit={(item) => setModal({ mode: "edit", item })}
          onArchive={(item) => setArchiveTarget(item)}
        />
      )}

      {modal ? (
        <DecisionFormModal
          title={modal.mode === "add" ? "Add Decision" : `Edit ${modal.item.display_id}`}
          initialValues={modal.mode === "edit" ? modal.item : undefined}
          submitLabel={modal.mode === "add" ? "Add Decision" : "Save Changes"}
          onClose={() => setModal(null)}
          onSubmit={(values) => (modal.mode === "add" ? handleCreate(values) : handleUpdate(modal.item.id, values))}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title="Archive this decision?"
          message={`"${archiveTarget.decision_required}" will be hidden from both Decision Queue and Decision Register. It isn't deleted and can be restored later if needed.`}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}
    </div>
  );
}
