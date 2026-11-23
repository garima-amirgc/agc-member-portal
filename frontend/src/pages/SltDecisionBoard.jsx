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
import ExportMenu from "../components/ExportMenu";

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

// Export column set — see the matching comment in SltActionTrackerBoard.jsx
// for why this reuses DECISION_FIELDS (the Add/Edit form's own field list)
// rather than hand-maintaining a separate column list. This is the full
// record per decision regardless of which tab/mode is currently being
// exported from — Decision Queue items and Decision Register items share
// the same fields either way, so there's no need to special-case
// assigned_to/owned_by or decision_deadline/decision_date here.
const DECISION_EXPORT_COLUMNS = [
  { key: "display_id", label: "ID" },
  ...DECISION_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    format: f.type === "date" ? (row) => fmtDate(row[f.key]) : undefined,
  })),
  { key: "created_at", label: "Created", format: (row) => fmtCreatedDate(row.created_at) },
];

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
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</div>
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

function truncateForConfirm(s, n = 90) {
  const str = String(s || "").trim();
  return str.length > n ? `${str.slice(0, n).trimEnd()}…` : str;
}

// Archive confirmation body — see the matching comment in
// SltActionTrackerBoard.jsx's own copy of this component for why the
// reassurance leads and the (possibly long) item text is truncated and
// demoted to a muted second line instead of being quoted in full up top.
function ArchiveConfirmMessage({ itemText, scopeText }) {
  return (
    <div>
      <p className="font-medium text-slate-900 dark:text-white">
        It won't be deleted — it'll just be hidden from {scopeText}, and you can restore it later if needed.
      </p>
      <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">"{truncateForConfirm(itemText)}"</p>
    </div>
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

// Read-only value for one field in the "view details" popup below — see
// the matching helper in SltActionTrackerBoard.jsx for why dates go
// through fmtDate and an empty value reads as "—".
function fieldDisplayValue(def, item) {
  const v = item[def.key];
  if (def.type === "date") return fmtDate(v);
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  return v;
}

// Clicking a row (on any of the three tabs — Queue, Register, Archived)
// opens this read-only view of every field, since the table itself only
// has room for a handful of columns. "Decision Required" is pulled out of
// the grid and shown big up top; everything else, including Created,
// follows in the same two-column layout the Add/Edit form uses, just not
// editable. Editing from here is only offered when the row it opened
// from has edit available — see canEdit below, passed in by the caller.
function DecisionViewModal({ item, canEdit, onEdit, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{item.display_id}</p>
            <h3 className="break-words text-sm font-semibold text-slate-900 dark:text-white">{item.decision_required}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {DECISION_FIELDS.filter((def) => def.key !== "decision_required").map((def) => (
            <div key={def.key} className={def.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : ""}>
              <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{def.label}</p>
              <p className="whitespace-pre-wrap break-words text-xs text-slate-900 dark:text-slate-100">{fieldDisplayValue(def, item)}</p>
            </div>
          ))}
          <div>
            <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Created</p>
            <p className="text-xs text-slate-900 dark:text-slate-100">{fmtCreatedDate(item.created_at)}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Close</GhostButton>
          {canEdit ? <PrimaryButton onClick={onEdit}>Edit</PrimaryButton> : null}
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
    // A scroll INSIDE the dropdown's own panel (e.g. a long checkbox list
    // scrolled with the mouse wheel) also reaches this listener, because
    // native "scroll" events fire on capturing-phase ancestors even though
    // they don't bubble — this is a window-level capture listener, so it
    // sees every descendant's scroll, not just the page's. Without this
    // guard, trying to scroll the list itself closed the dropdown on the
    // very first wheel tick instead of actually scrolling it. Only close
    // for a scroll that happens OUTSIDE the panel/button (e.g. scrolling
    // the page behind it); a window resize has no useful target to check,
    // so it still always closes the popover.
    const onScrollOrResize = (e) => {
      const insideAny = extraRefs.some((r) => r.current && e?.target && r.current.contains(e.target));
      if (insideAny) return;
      onClose();
    };
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
      {/* flex w-full + flex-wrap (not inline-flex): an inline-flex button
          sizes to its content and was overflowing past its <th> into the
          next column on narrower columns like Created/Escalation — a
          full-width, wrappable button lets a long label drop to a second
          line instead, which just grows the header row's height. */}
      <button
        type="button"
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left normal-case transition hover:bg-black/5 dark:hover:bg-white/10 ${
          active ? "text-[#0B3EAF] dark:text-[#A7D344]" : ""
        }`}
      >
        <span className="break-words uppercase">{label}</span>
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

function DateRangeFilterContent({ from, to, onChange }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-normal outline-none focus:border-[#0B3EAF] dark:border-slate-700 dark:bg-[#141414] dark:focus:border-[#A7D344]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-normal outline-none focus:border-[#0B3EAF] dark:border-slate-700 dark:bg-[#141414] dark:focus:border-[#A7D344]"
        />
      </div>
      {from || to ? (
        <button type="button" onClick={() => onChange({ from: "", to: "" })} className="text-[10px] font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
          Clear
        </button>
      ) : null}
    </div>
  );
}

// created_at is a real timestamp (unlike the plain YYYY-MM-DD business-date
// fields like decision_deadline/decision_date), so it needs its own
// formatter and its own range-matching logic rather than reusing
// fmtDate/dateMatchesRange above, which assume local-midnight YYYY-MM-DD.
function fmtCreatedDate(v) {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function createdAtMatchesRange(createdAt, from, to) {
  if (!from && !to) return true;
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  if (from && created < new Date(`${from}T00:00:00`)) return false;
  if (to && created > new Date(`${to}T23:59:59.999`)) return false;
  return true;
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
  // Archived items can be pending or decided (archiving doesn't care which),
  // so this is a plain catch-all rather than either mode's own framing.
  archived: [
    { key: "all", label: "All" },
    { key: "this_week", label: "This week" },
    { key: "this_month", label: "This month" },
    { key: "no_date", label: "No date" },
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
  created: "bg-cyan-100/45 dark:bg-cyan-950/25",
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
    created: alt ? "bg-cyan-50/90 dark:bg-cyan-950/20" : "bg-cyan-50/50 dark:bg-cyan-950/10",
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

// No longer independently rounded/shadowed/margined — this now sits as
// the top strip of the unified white <section> card SltDecisionBoard wraps
// itself in (header → filter band → table all one card, same shape as the
// Master Calendar's <section> in SltTrackerV2.jsx), instead of floating as
// its own gradient banner above a separately-boxed table.
function BoardHeader({ title, pills, right }) {
  return (
    <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white">
      <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl" style={{ color: "#ffffff" }}>
            {title}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">{pills}</div>
          {right ? <div className="flex flex-wrap justify-end gap-2">{right}</div> : null}
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
function DecisionTable({ mode, items, canEdit, onEdit, onArchive, archivedMode = false, onRestore, restoringId, onView, onExportDataChange }) {
  // "archived" shows a flat mixed list of pending-when-archived and
  // decided-when-archived items together, so there's no single right
  // person/date field the way Queue vs. Register has — each archived item
  // is read individually, falling back to whichever of the pair it has.
  const personField = mode === "queue" ? "assigned_to" : mode === "register" ? "owned_by" : null;
  const personLabel = mode === "queue" ? "Assigned To" : mode === "register" ? "Owned By" : "Assigned / Owned";
  const dateField = mode === "queue" ? "decision_deadline" : mode === "register" ? "decision_date" : null;
  const dateLabel = mode === "queue" ? "Deadline" : mode === "register" ? "Decision Date" : "Deadline / Decided";

  const personOf = (i) => (personField ? i[personField] : i.assigned_to || i.owned_by);
  const dateOf = (i) => (dateField ? i[dateField] : i.decision_deadline || i.decision_date);

  const [decisionQuery, setDecisionQuery] = useState("");
  const [workstreamFilter, setWorkstreamFilter] = useState(() => new Set());
  const [personFilter, setPersonFilter] = useState(() => new Set());
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [decisionTypeFilter, setDecisionTypeFilter] = useState(() => new Set());
  const [ceoCfoFilter, setCeoCfoFilter] = useState(() => new Set());
  const [riskFilter, setRiskFilter] = useState(() => new Set());
  const [createdRange, setCreatedRange] = useState({ from: "", to: "" });
  // Newest-created first by default on every tab now (Queue included —
  // see the matching comment in SltActionTrackerBoard.jsx's
  // ActionRegisterView), so the mode-based default this used to have is
  // gone; the ID column header still toggles it either way.
  const [idSortDir, setIdSortDir] = useState("desc");

  const workstreamOptions = useMemo(() => dynamicOptionsWithCounts(items, "workstream"), [items]);
  const personOptions = useMemo(() => {
    const counts = new Map();
    for (const i of items) {
      const v = (personOf(i) || "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [items, personField]);
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
    createdRange.from !== "" || createdRange.to !== "",
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
    setCreatedRange({ from: "", to: "" });
  };

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (decisionQuery.trim() && !String(i.decision_required || "").toLowerCase().includes(decisionQuery.trim().toLowerCase())) return false;
      if (workstreamFilter.size > 0 && !workstreamFilter.has((i.workstream || "").trim())) return false;
      if (personFilter.size > 0 && !personFilter.has((personOf(i) || "").trim())) return false;
      if (!dateMatchesRange(dateOf(i), dateFilter)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;
      if (decisionTypeFilter.size > 0 && !decisionTypeFilter.has(i.decision_type)) return false;
      if (ceoCfoFilter.size > 0 && !ceoCfoFilter.has(i.ceo_cfo_attention)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(i.risk_impact)) return false;
      if (!createdAtMatchesRange(i.created_at, createdRange.from, createdRange.to)) return false;
      return true;
    });
    list = [...list].sort((a, b) => (idSortDir === "asc" ? a.id - b.id : b.id - a.id));
    return list;
  }, [items, decisionQuery, workstreamFilter, personFilter, dateField, dateFilter, statusFilter, decisionTypeFilter, ceoCfoFilter, riskFilter, createdRange, idSortDir]);

  const exportFilenameBase = mode === "queue" ? "decision-queue" : mode === "register" ? "decision-register" : "decisions-archived";
  const exportTitle = mode === "queue" ? "Decision Queue" : mode === "register" ? "Decision Register" : "Decisions — Archived";

  // The Export button itself now lives in the page-level BoardHeader (the
  // blue bar), alongside Show Archived / + Add Decision, not down here —
  // but `filtered` (today's search/column filters/archived-tab selection)
  // only exists in this component, so it's reported up on every change via
  // this callback instead. onExportDataChange is a useCallback with an
  // empty dep array at the call site, so this effect only re-fires when
  // the export data itself actually changes, not on every parent render.
  useEffect(() => {
    onExportDataChange?.({ rows: filtered, filenameBase: exportFilenameBase, title: exportTitle });
  }, [filtered, exportFilenameBase, exportTitle, onExportDataChange]);

  // Returns the rest of the page-level <section> card (the filter band +
  // the padded table area) as a fragment — BoardHeader (the top strip) is
  // rendered once at the page level, above whichever of these three
  // DecisionTable instances is currently mounted, so this component only
  // needs to contribute the pieces that come after it.
  return (
    <>
      {activeFilterCount > 0 ? (
        <div className="flex items-center justify-end gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900/40 sm:px-5">
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

      <div className="p-3 sm:p-4">
      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {mode === "queue" ? "No pending decisions right now." : mode === "register" ? "No decided items yet." : "No archived decisions."}
        </div>
      ) : (
        <table className="w-full table-fixed border-collapse border border-slate-200 text-left text-xs dark:border-slate-600/50">
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
                <th className={thClass("decision", "w-[14%]")}>
                  <ColumnFilterHeader label="Decision" active={decisionQuery.trim() !== ""}>
                    <TextFilterContent value={decisionQuery} onChange={setDecisionQuery} placeholder="Contains…" />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("workstream", "w-[10%]")}>
                  <ColumnFilterHeader label="Workstream" active={workstreamFilter.size > 0}>
                    <CheckboxFilterContent options={workstreamOptions} selected={workstreamFilter} onChange={setWorkstreamFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("person", "w-[10%]")}>
                  <ColumnFilterHeader label={personLabel} active={personFilter.size > 0}>
                    <CheckboxFilterContent options={personOptions} selected={personFilter} onChange={setPersonFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("date", "w-[9%]")}>
                  <ColumnFilterHeader label={dateLabel} active={dateFilter !== "all"}>
                    <RadioFilterContent name={`decision-${mode}-date`} options={dateRangeOptions} value={dateFilter} onChange={setDateFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("status", "w-[10%]")}>
                  <ColumnFilterHeader label="Status" active={statusFilter.size > 0}>
                    <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("decisionType", "w-[10%]")}>
                  <ColumnFilterHeader label="Decision Type" active={decisionTypeFilter.size > 0}>
                    <CheckboxFilterContent options={decisionTypeOptions} selected={decisionTypeFilter} onChange={setDecisionTypeFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("ceoCfo", "w-[8%]")}>
                  <ColumnFilterHeader label="CEO/CFO" active={ceoCfoFilter.size > 0}>
                    <CheckboxFilterContent options={ceoCfoOptions} selected={ceoCfoFilter} onChange={setCeoCfoFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("risk", "w-[7%]")}>
                  <ColumnFilterHeader label="Risk" active={riskFilter.size > 0}>
                    <CheckboxFilterContent options={riskOptions} selected={riskFilter} onChange={setRiskFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("created", "w-[8%]")}>
                  {/* align="right" — this column sits near the right edge of
                      the table, so the default left-anchored 240px-wide
                      popover would run off the edge of the screen. */}
                  <ColumnFilterHeader label="Created" align="right" active={createdRange.from !== "" || createdRange.to !== ""}>
                    <DateRangeFilterContent from={createdRange.from} to={createdRange.to} onChange={setCreatedRange} />
                  </ColumnFilterHeader>
                </th>
                {canEdit ? <th className={thClass("actions", "w-[8%]", true)}>{archivedMode ? "Restore" : "Actions"}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="px-6 py-8 text-center text-sm text-slate-400">
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((i, rowIdx) => (
                  <tr
                    key={i.id}
                    className="group cursor-pointer transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    onClick={() => onView(i)}
                  >
                    <td className={tdClass("id", rowIdx, "font-mono text-slate-500 dark:text-slate-400")}>{i.display_id}</td>
                    <td className={tdClass("decision", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{i.decision_required}</td>
                    <td className={tdClass("workstream", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.workstream || "—"}</td>
                    <td className={tdClass("person", rowIdx, "text-slate-600 dark:text-slate-300")}>{personOf(i) || "—"}</td>
                    <td className={tdClass("date", rowIdx)}>
                      {dateField ? <DateBadge item={i} field={dateField} /> : <span className="text-slate-600 dark:text-slate-300">{fmtDate(dateOf(i))}</span>}
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
                    <td className={tdClass("created", rowIdx, "text-slate-600 dark:text-slate-300")}>{fmtCreatedDate(i.created_at)}</td>
                    {canEdit ? (
                      <td className={tdClass("actions", rowIdx, "", true)} onClick={(e) => e.stopPropagation()}>
                        {archivedMode ? (
                          <button
                            type="button"
                            onClick={() => onRestore(i)}
                            disabled={restoringId === i.id}
                            className="w-full rounded-full border border-[#0B3EAF]/40 py-0.5 text-center text-[10px] font-semibold text-[#0B3EAF] transition hover:bg-[#0B3EAF]/10 disabled:opacity-50 dark:border-[#A7D344]/40 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10"
                          >
                            {restoringId === i.id ? "Restoring…" : "Restore"}
                          </button>
                        ) : (
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
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
      )}
      </div>
    </>
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
  // Row click → read-only "view details" popup. canEditHere is carried
  // alongside the item (rather than re-derived from `showArchived` at
  // render time) since the Queue/Register tables and the Archived table
  // set it differently — editing is only offered from the two live tabs.
  const [viewItem, setViewItem] = useState(null); // null | { item, canEditHere }

  // Export button data — reported up from whichever DecisionTable instance
  // is currently mounted (see the matching comment in DecisionTable). The
  // handler is wrapped in useCallback with an empty dep array so its
  // identity never changes, which keeps DecisionTable's effect from
  // re-firing on every render of this component.
  const [exportData, setExportData] = useState({ rows: [], filenameBase: "decisions", title: "Decisions" });
  const handleExportDataChange = useCallback((data) => setExportData(data), []);

  // "Show archived" toggle — unlike Action Tracker's version of this (scoped
  // to one sub-tab), Decisions' toggle bypasses the Queue/Register split
  // entirely and shows one flat archived list instead, since an archived
  // item isn't meaningfully "pending" or "decided" anymore — it's just
  // hidden. Fetched separately on demand, same reasoning as the other two
  // boards' restore features.
  const [showArchived, setShowArchived] = useState(false);
  const [archivedItems, setArchivedItems] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState("");
  const [restoringId, setRestoringId] = useState(null);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    setArchivedError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/decisions", { params: { archived: "true" } });
      setArchivedItems(data.decisions || []);
    } catch (e) {
      setArchivedError(friendlyErrorMessage(e, "Could not load archived decisions."));
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  const handleRestore = async (item) => {
    setRestoringId(item.id);
    try {
      await api.post(`/cfo/slt/v2/decisions/${item.id}/restore`);
      // Bug fix: this only refreshed the archived list (correctly dropping
      // the restored item from THIS view), but never reloaded the separate
      // `items` list the live Queue/Register tabs actually render — so a
      // restored decision vanished from Archived but never reappeared on
      // the live board until a full page reload. load() (defined below,
      // but already in scope by the time this runs — same one
      // confirmArchive/handleCreate/handleUpdate already call) fixes that.
      await Promise.all([loadArchived(), load()]);
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not restore this decision."));
    } finally {
      setRestoringId(null);
    }
  };

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

  // "card p-4 sm:p-6" — the same page-level white panel wrapper
  // SltTrackerV2's default export uses behind its own SubTabBar + content,
  // so the Decision Queue/Register sub-tab row sits on a white background
  // like Master Calendar's tabs do, instead of directly on the page's bare
  // background.
  return (
    <div className="card p-4 sm:p-6">
      {!showArchived ? <SubTabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} /> : null}

      {/* One unified white card (header → filter band → table), same shape
          as the Master Calendar's <section> in SltTrackerV2.jsx, instead of
          a floating gradient banner sitting above a separately-boxed
          table. */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
      <BoardHeader
        title={showArchived ? "Decisions — Archived" : subTab === "decision_queue" ? "Decision Queue" : "Decision Register"}
        pills={
          showArchived
            ? [<StatPill key="total" label="Total" value={archivedItems.length} accent="bg-white/15 ring-1 ring-white/20" />]
            : [<StatPill key="total" label="Total" value={kpis.total} accent="bg-white/15 ring-1 ring-white/20" />, ...kpiPills(kpis)]
        }
        right={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <GhostButton
                onClick={() => setShowArchived((v) => !v)}
                className={showArchived ? "!border-white/60 !text-white hover:!bg-white/10" : "!border-white/40 !text-white/90 hover:!bg-white/10"}
              >
                {showArchived ? "← Back to Decisions" : "Show Archived"}
              </GhostButton>
            ) : null}
            {/* Only shown on Decision Queue — a new decision defaults to a
                pending status, so it always lands in the Queue regardless
                of which tab was active when Add was clicked. Showing this
                on Decision Register too would mean clicking Add there and
                not seeing the new item appear on the tab you were on. */}
            {canEdit && !showArchived && subTab === "decision_queue" ? (
              <PrimaryButton onClick={() => setModal({ mode: "add" })}>+ Add Decision</PrimaryButton>
            ) : null}
            {/* Exports whichever of Queue/Register/Archived is on screen —
                see handleExportDataChange and the matching comment in
                DecisionTable for how `exportData` gets here. */}
            <ExportMenu columns={DECISION_EXPORT_COLUMNS} rows={exportData.rows} filenameBase={exportData.filenameBase} title={exportData.title} variant="onBlue" />
          </div>
        }
      />

      {showArchived ? (
        archivedLoading ? (
          <div className="p-3 sm:p-4">
            <div className="flex items-center justify-center gap-3 px-6 py-16">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
              <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading…</p>
            </div>
          </div>
        ) : archivedError ? (
          <div className="p-3 sm:p-4">
            <div className="rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {archivedError}
            </div>
          </div>
        ) : (
          <DecisionTable
            mode="archived"
            items={archivedItems}
            canEdit={canEdit}
            archivedMode
            onRestore={handleRestore}
            restoringId={restoringId}
            onView={(item) => setViewItem({ item, canEditHere: false })}
            onExportDataChange={handleExportDataChange}
          />
        )
      ) : loading ? (
        <div className="p-3 sm:p-4">
          <div className="flex items-center justify-center gap-3 px-6 py-16">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
            <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading…</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-3 sm:p-4">
          <div className="rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        </div>
      ) : subTab === "decision_queue" ? (
        <DecisionTable
          mode="queue"
          items={queueItems}
          canEdit={canEdit}
          onEdit={(item) => setModal({ mode: "edit", item })}
          onArchive={(item) => setArchiveTarget(item)}
          onView={(item) => setViewItem({ item, canEditHere: canEdit })}
          onExportDataChange={handleExportDataChange}
        />
      ) : (
        <DecisionTable
          mode="register"
          items={registerItems}
          canEdit={canEdit}
          onEdit={(item) => setModal({ mode: "edit", item })}
          onArchive={(item) => setArchiveTarget(item)}
          onExportDataChange={handleExportDataChange}
          onView={(item) => setViewItem({ item, canEditHere: canEdit })}
        />
      )}
      </section>

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
          message={
            <ArchiveConfirmMessage itemText={archiveTarget.decision_required} scopeText="both Decision Queue and Decision Register" />
          }
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}

      {viewItem ? (
        <DecisionViewModal
          item={viewItem.item}
          canEdit={viewItem.canEditHere}
          onEdit={() => {
            setModal({ mode: "edit", item: viewItem.item });
            setViewItem(null);
          }}
          onClose={() => setViewItem(null)}
        />
      ) : null}
    </div>
  );
}
