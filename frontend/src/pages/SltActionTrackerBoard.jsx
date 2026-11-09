import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  RISK_IMPACT_OPTIONS,
  ESCALATION_OPTIONS,
  STRATEGIC_OBJECTIVE_SUGGESTIONS,
  FINANCIAL_IMPACT_OPTIONS,
  ASP_READINESS_STREAM_SUGGESTIONS,
  CATEGORY_SUGGESTIONS,
  OWNER_SUGGESTIONS,
} from "../constants/sltActionRegisterLists";
import { computeKpis, computeBoardSummary, computeOwnerBreakdown, computeObjectiveBreakdown, isOverdue } from "../utils/sltActionAnalytics";

/**
 * Action Tracker — Board Summary / Executive Dashboard / Action Register.
 *
 * The default export at the bottom of this file is the component
 * CfoReportsPage.jsx mounts for the "Action Tracker" radio choice (sibling
 * to "SLT Master Calendar", which SltTrackerV2.jsx handles, and
 * "Decisions", which SltDecisionBoard.jsx now handles directly as its own
 * radio choice — the two used to be combined as a top-level tab bar inside
 * this file's own default export, split apart into separate radio choices
 * at the user's explicit request so each is reachable without an extra
 * click). Built from the uploaded source workbook —
 * SLT_Action_Tracker_Board_Ready_Executive_v4_2026_Master_1.xlsx.
 *
 * Backend: GET/POST/PATCH /cfo/slt/v2/action-items plus .../:id/archive
 * (sltActionRegister.service.js, slt_action_register table). "Board
 * Summary" and "Executive Dashboard" have no routes of their own — both are
 * computed client-side from the same item list by sltActionAnalytics.js,
 * mirroring the workbook's own formulas (see that file's header comment).
 *
 * Visual style ("style everything just like IT Tickets board" — explicit
 * request) is deliberately copied from
 * frontend/src/components/ItTicketsMonitorTable.jsx: the gradient banner
 * header with stat pills, the Excel-style per-column filter dropdowns
 * (ColumnFilterHeader/CheckboxFilterContent/RadioFilterContent/
 * TextFilterContent — all ported near-verbatim from that file, including
 * its portal-popover positioning trick, since there's no shared UI kit to
 * import them from), and the tinted alternating-row column backgrounds.
 * SltDecisionBoard.jsx follows the exact same visual language, ported a
 * second time into that file for the same "no shared UI kit" reason.
 */

// Order here is the literal left-to-right tab order AND the default tab on
// load (see useState(SUB_TABS[0].key) below) — Action Register placed first
// per explicit request, ahead of Board Summary and Executive Dashboard.
const SUB_TABS = [
  { key: "action_register", label: "Action Register" },
  { key: "board_summary", label: "Board Summary" },
  { key: "executive_dashboard", label: "Executive Dashboard" },
];

const ACTION_FIELDS = [
  { key: "item", label: "Item", type: "text", required: true },
  { key: "category", label: "Category", type: "select_other", suggestions: CATEGORY_SUGGESTIONS },
  { key: "owner", label: "Owner", type: "select_other", suggestions: OWNER_SUGGESTIONS },
  { key: "next_action", label: "Next Action", type: "textarea" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  { key: "risk_impact", label: "Risk Impact", type: "select", options: RISK_IMPACT_OPTIONS },
  { key: "strategic_objective", label: "Strategic Objective", type: "select_other", suggestions: STRATEGIC_OBJECTIVE_SUGGESTIONS },
  { key: "escalation_required", label: "Escalation Required", type: "select", options: ESCALATION_OPTIONS },
  { key: "financial_impact", label: "Financial Impact", type: "select_other", suggestions: FINANCIAL_IMPACT_OPTIONS },
  { key: "asp_readiness_stream", label: "ASP Readiness Stream", type: "select_other", suggestions: ASP_READINESS_STREAM_SUGGESTIONS },
  { key: "blocker", label: "Blocker / Waiting On", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

function emptyFormValues() {
  const v = {};
  for (const f of ACTION_FIELDS) v[f.key] = "";
  v.status = "Not Started";
  v.priority = "Medium";
  v.escalation_required = "No";
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

// ── Small shared presentational bits (kept local to this file — this
// codebase doesn't have a shared UI kit; SltTrackerV2.jsx and
// ItTicketsMonitorTable.jsx each define their own copies of the same kind
// of thing rather than importing from elsewhere) ──

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

// Archive confirmation body — leads with the plain-language reassurance
// (not deleted, hidden only, restorable) since that's the part people
// actually need before clicking Archive; the item itself is identified
// second, in muted/truncated form, since it's secondary context (the user
// just clicked Archive on this exact row, so it's still visible behind the
// dialog) rather than something that needs repeating back in full. A full
// multi-sentence item (this board's "item" field can run to a paragraph)
// used to be quoted in full ahead of the reassurance, which buried the one
// thing people actually wanted to know at the bottom of a wall of text —
// fixed by explicit request after seeing it in practice.
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

// Dropdown + free-text "Other" fallback — same pattern/UX as Master
// Calendar's Category/Executive(s) fields (SelectWithOtherField in
// SltTrackerV2.jsx).
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

// Strict dropdown, no free text — used for Status/Priority/Risk Impact/
// Escalation Required, since the Flag/Active Record/overdue computations
// (backend and sltActionAnalytics.js alike) key off these exact strings.
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

function ActionItemFormModal({ title, initialValues, onClose, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState(() => ({ ...emptyFormValues(), ...initialValues }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save this action item."));
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
          {ACTION_FIELDS.map((def) => (
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

// ── Excel-style column filters — ported from ItTicketsMonitorTable.jsx ──
//
// Each filterable column header is itself the filter control (a small caret
// button) rather than a separate row of controls above the table. The
// dropdown panel is rendered through a portal into document.body and
// positioned from the trigger button's on-screen rect, so it always draws on
// top of — and isn't clipped by — the table's scrolling/sticky containers.

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

// Checkbox multi-select — an empty `selected` set means "no filter" (every
// value counts as checked); unchecking one materializes the rest as an
// explicit selection instead of leaving the other boxes ambiguous.
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

// ── Option-list builders for the column filter dropdowns ────────────────

// Status/Priority/Risk Impact/Escalation Required are fixed known sets
// (same ones the Add/Edit form's dropdowns use) — shown with a count even
// when 0, so the filter always lists every possible value, not just
// whatever happens to be in the data today.
function fixedOptionsWithCounts(items, field, knownOptions) {
  return knownOptions.map((v) => ({ value: v, label: v, count: items.filter((i) => i[field] === v).length }));
}

// Category/Owner are open text (the sheet itself has an "Other" option for
// both) — listed dynamically from whatever's actually in the data, most
// common first, same as ItTicketsMonitorTable.jsx's Requester/Assignee
// filters.
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

const DUE_RANGE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "this_week", label: "Due this week" },
  { key: "this_month", label: "Due this month" },
  { key: "no_date", label: "No due date" },
];

function dueMatchesRange(item, key) {
  if (key === "all") return true;
  if (key === "no_date") return !item.due_date;
  if (!item.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${item.due_date}T00:00:00`);
  if (key === "overdue") return due < today;
  if (key === "this_week") {
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return due >= today && due <= end;
  }
  if (key === "this_month") {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return due >= today && due <= end;
  }
  return true;
}

// ── Column tinting — same idea as ItTicketsMonitorTable.jsx's
// HEADER_COL_BG/bodyColBg: a pale tint per column (consistent whether a
// cell holds a badge or plain text) plus a slightly darker shade on
// alternating rows, so the eye can track one column down a wide table. ──

const HEADER_COL_BG = {
  id: "bg-slate-200/70 dark:bg-slate-800",
  item: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  category: "bg-amber-100/50 dark:bg-amber-950/30",
  owner: "bg-violet-100/45 dark:bg-violet-950/30",
  due: "bg-slate-200/55 dark:bg-slate-800/80",
  status: "bg-sky-100/55 dark:bg-sky-950/35",
  priority: "bg-emerald-100/55 dark:bg-emerald-950/35",
  risk: "bg-rose-100/50 dark:bg-rose-950/30",
  escalation: "bg-red-100/45 dark:bg-red-950/30",
  objective: "bg-fuchsia-100/45 dark:bg-fuchsia-950/25",
  note: "bg-slate-100/70 dark:bg-slate-800/50",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

function bodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    id: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    item: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    category: alt ? "bg-amber-50/85 dark:bg-amber-950/18" : "bg-amber-50/45 dark:bg-amber-950/10",
    owner: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    due: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    status: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    priority: alt ? "bg-emerald-50/90 dark:bg-emerald-950/20" : "bg-emerald-50/50 dark:bg-emerald-950/10",
    risk: alt ? "bg-rose-50/85 dark:bg-rose-950/18" : "bg-rose-50/45 dark:bg-rose-950/10",
    escalation: alt ? "bg-red-50/85 dark:bg-red-950/18" : "bg-red-50/45 dark:bg-red-950/10",
    objective: alt ? "bg-fuchsia-50/80 dark:bg-fuchsia-950/15" : "bg-fuchsia-50/40 dark:bg-fuchsia-950/8",
    note: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
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

// ── Stat pills + gradient banner header — ported from
// ItTicketsMonitorTable.jsx's StatPill/section header. ──

function StatPill({ label, value, accent }) {
  return (
    <div className={`flex min-h-[3rem] min-w-[3.75rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-center ${accent}`}>
      <div className="text-base font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

function BoardHeader({ title, subtitle, pills, right }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-xl border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white shadow-lg">
      <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl" style={{ color: "#ffffff" }}>
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-white/75">{subtitle}</p> : null}
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

const PRIORITY_BADGE = {
  Critical: "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800",
  High: "bg-orange-100 text-orange-800 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-800",
  Medium: "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800",
  Low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15",
};

function PriorityBadge({ priority }) {
  if (!priority) return <span className="text-slate-400">—</span>;
  return <span className={`${BADGE} ${PRIORITY_BADGE[priority] || PRIORITY_BADGE.Low}`}>{priority}</span>;
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

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`${BADGE} bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800`}
    >
      {status}
    </span>
  );
}

function DueDateBadge({ item }) {
  if (!item.due_date) return <span className="text-slate-400">—</span>;
  const overdue = isOverdue(item);
  const cls = overdue
    ? "text-red-700 dark:text-red-300 font-semibold"
    : item.active && item.days_until_due != null && item.days_until_due <= 14
      ? "text-amber-700 dark:text-amber-300 font-semibold"
      : "text-slate-600 dark:text-slate-300";
  return <span className={cls}>{fmtDate(item.due_date)}</span>;
}

function EscalationBadge({ value }) {
  if (value !== "Yes") return <span className="text-slate-400">No</span>;
  return (
    <span className={`${BADGE} gap-1 bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800`}>
      ⚑ Yes
    </span>
  );
}

const KPI_PILL_ACCENTS = {
  openActions: "bg-white/15 ring-1 ring-white/20",
  overdue: "bg-red-300 text-red-950",
  criticalPriority: "bg-orange-300 text-orange-950",
  highPriority: "bg-amber-300 text-amber-950",
  highRisk: "bg-rose-300 text-rose-950",
  escalations: "bg-[#A7D344] text-[#0a0a0a]",
  aspGoLiveItems: "bg-sky-300 text-sky-950",
};

const KPI_LABELS = {
  openActions: "Open",
  overdue: "Overdue",
  criticalPriority: "Critical",
  highPriority: "High Pri.",
  highRisk: "High Risk",
  escalations: "Escalations",
  aspGoLiveItems: "ASP Go-Live",
};

function kpiPills(kpis) {
  return Object.keys(KPI_LABELS).map((k) => <StatPill key={k} label={KPI_LABELS[k]} value={kpis[k]} accent={KPI_PILL_ACCENTS[k]} />);
}

function BoardSummaryView({ items }) {
  const kpis = useMemo(() => computeKpis(items), [items]);
  const attention = useMemo(() => computeBoardSummary(items), [items]);

  const [ownerFilter, setOwnerFilter] = useState(() => new Set());
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());
  const [riskFilter, setRiskFilter] = useState(() => new Set());
  const [escalationFilter, setEscalationFilter] = useState(() => new Set());
  const [objectiveFilter, setObjectiveFilter] = useState(() => new Set());

  const ownerOptions = useMemo(() => dynamicOptionsWithCounts(attention, "owner"), [attention]);
  const statusOptions = useMemo(() => fixedOptionsWithCounts(attention, "status", STATUS_OPTIONS), [attention]);
  const priorityOptions = useMemo(() => fixedOptionsWithCounts(attention, "priority", PRIORITY_OPTIONS), [attention]);
  const riskOptions = useMemo(() => fixedOptionsWithCounts(attention, "risk_impact", RISK_IMPACT_OPTIONS), [attention]);
  const escalationOptions = useMemo(() => fixedOptionsWithCounts(attention, "escalation_required", ESCALATION_OPTIONS), [attention]);
  const objectiveOptions = useMemo(() => dynamicOptionsWithCounts(attention, "strategic_objective"), [attention]);

  const filtered = useMemo(() => {
    return attention.filter((i) => {
      if (ownerFilter.size > 0 && !ownerFilter.has((i.owner || "").trim())) return false;
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;
      if (priorityFilter.size > 0 && !priorityFilter.has(i.priority)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(i.risk_impact)) return false;
      if (escalationFilter.size > 0 && !escalationFilter.has(i.escalation_required)) return false;
      if (objectiveFilter.size > 0 && !objectiveFilter.has((i.strategic_objective || "").trim())) return false;
      return true;
    });
  }, [attention, ownerFilter, statusFilter, priorityFilter, riskFilter, escalationFilter, objectiveFilter]);

  return (
    <div>
      <BoardHeader title="Board Summary" pills={kpiPills(kpis)} />
      <h4 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Items Requiring Executive Attention</h4>
      {attention.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Nothing needs executive attention right now.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-600/50">
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <thead className="border-b-2 border-slate-300 dark:border-slate-600">
              <tr>
                <th className={thClass("id", "w-[7%]")}>ID</th>
                <th className={thClass("item", "w-[20%]")}>Item</th>
                <th className={thClass("owner", "w-[9%]")}>
                  <ColumnFilterHeader label="Owner" active={ownerFilter.size > 0}>
                    <CheckboxFilterContent options={ownerOptions} selected={ownerFilter} onChange={setOwnerFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("due", "w-[9%]")}>Due Date</th>
                <th className={thClass("status", "w-[10%]")}>
                  <ColumnFilterHeader label="Status" active={statusFilter.size > 0}>
                    <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("priority", "w-[9%]")}>
                  <ColumnFilterHeader label="Priority" active={priorityFilter.size > 0}>
                    <CheckboxFilterContent options={priorityOptions} selected={priorityFilter} onChange={setPriorityFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("risk", "w-[8%]")}>
                  <ColumnFilterHeader label="Risk" active={riskFilter.size > 0}>
                    <CheckboxFilterContent options={riskOptions} selected={riskFilter} onChange={setRiskFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("escalation", "w-[9%]")}>
                  <ColumnFilterHeader label="Escalation" active={escalationFilter.size > 0}>
                    <CheckboxFilterContent options={escalationOptions} selected={escalationFilter} onChange={setEscalationFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("objective", "w-[11%]")}>
                  <ColumnFilterHeader label="Strategic Objective" active={objectiveFilter.size > 0}>
                    <CheckboxFilterContent options={objectiveOptions} selected={objectiveFilter} onChange={setObjectiveFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("note", "w-[8%]", true)}>Board Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-slate-400">
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((i, rowIdx) => (
                  <tr key={i.id} className="group">
                    <td className={tdClass("id", rowIdx, "font-mono text-slate-500 dark:text-slate-400")}>{i.display_id}</td>
                    <td className={tdClass("item", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{i.item}</td>
                    <td className={tdClass("owner", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.owner || "—"}</td>
                    <td className={tdClass("due", rowIdx)}>
                      <DueDateBadge item={i} />
                    </td>
                    <td className={tdClass("status", rowIdx)}>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className={tdClass("priority", rowIdx)}>
                      <PriorityBadge priority={i.priority} />
                    </td>
                    <td className={tdClass("risk", rowIdx)}>
                      <RiskBadge risk={i.risk_impact} />
                    </td>
                    <td className={tdClass("escalation", rowIdx)}>
                      <EscalationBadge value={i.escalation_required} />
                    </td>
                    <td className={tdClass("objective", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.strategic_objective || "—"}</td>
                    <td className={tdClass("note", rowIdx, "whitespace-normal text-slate-500 dark:text-slate-400", true)}>
                      {i.notes || "—"}
                    </td>
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

// Plain div bars — no charting library is installed (and this sandbox has
// no network access to add one), so breakdowns are rendered as simple
// horizontal bars scaled to the largest value in the set.
function BarChart({ title, rows, valueKey, labelKey }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h5 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h5>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r[labelKey]} className="flex items-center gap-2">
              <div className="w-28 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={r[labelKey]}>
                {r[labelKey]}
              </div>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded bg-[#0B3EAF] dark:bg-[#A7D344]"
                  style={{ width: `${Math.max(4, ((r[valueKey] || 0) / max) * 100)}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">{r[valueKey] || 0}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutiveDashboardView({ items }) {
  const kpis = useMemo(() => computeKpis(items), [items]);
  const byOwner = useMemo(() => computeOwnerBreakdown(items), [items]);
  const byObjective = useMemo(() => computeObjectiveBreakdown(items), [items]);

  return (
    <div>
      <BoardHeader title="Executive Dashboard" pills={kpiPills(kpis)} />

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart title="Open Actions by Owner" rows={byOwner} valueKey="open" labelKey="owner" />
        <BarChart title="Open Items by Strategic Objective" rows={byObjective} valueKey="open" labelKey="objective" />
      </div>

      <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Owner Accountability</h4>
      <div className="mb-5 rounded-lg border border-slate-200 dark:border-slate-600/50">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead className="border-b-2 border-slate-300 dark:border-slate-600">
            <tr>
              <th className={thClass("owner", "w-[16%]")}>Owner</th>
              <th className={thClass("status", "w-[12%]")}>Open</th>
              <th className={thClass("due", "w-[12%]")}>Overdue</th>
              <th className={thClass("priority", "w-[12%]")}>Critical</th>
              <th className={thClass("risk", "w-[14%]")}>High Priority</th>
              <th className={thClass("escalation", "w-[12%]")}>High Risk</th>
              <th className={thClass("objective", "w-[12%]")}>At Risk / Stuck</th>
              <th className={thClass("note", "w-[10%]", true)}>Escalations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
            {byOwner.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-400">
                  No open items yet.
                </td>
              </tr>
            ) : (
              byOwner.map((r, rowIdx) => (
                <tr key={r.owner} className="group">
                  <td className={tdClass("owner", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{r.owner}</td>
                  <td className={tdClass("status", rowIdx)}>{r.open}</td>
                  <td className={tdClass("due", rowIdx)}>{r.overdue}</td>
                  <td className={tdClass("priority", rowIdx)}>{r.criticalPriority}</td>
                  <td className={tdClass("risk", rowIdx)}>{r.highPriority}</td>
                  <td className={tdClass("escalation", rowIdx)}>{r.highRisk}</td>
                  <td className={tdClass("objective", rowIdx)}>{r.atRiskOrStuck}</td>
                  <td className={tdClass("note", rowIdx, "", true)}>{r.escalations}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Strategic Objective Accountability</h4>
      <div className="rounded-lg border border-slate-200 dark:border-slate-600/50">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead className="border-b-2 border-slate-300 dark:border-slate-600">
            <tr>
              <th className={thClass("objective", "w-[30%]")}>Strategic Objective</th>
              <th className={thClass("status", "w-[14%]")}>Open Items</th>
              <th className={thClass("due", "w-[14%]")}>Overdue</th>
              <th className={thClass("priority", "w-[14%]")}>Critical</th>
              <th className={thClass("risk", "w-[14%]")}>High Priority</th>
              <th className={thClass("escalation", "w-[14%]", true)}>High Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
            {byObjective.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                  No open items yet.
                </td>
              </tr>
            ) : (
              byObjective.map((r, rowIdx) => (
                <tr key={r.objective} className="group">
                  <td className={tdClass("objective", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{r.objective}</td>
                  <td className={tdClass("status", rowIdx)}>{r.open}</td>
                  <td className={tdClass("due", rowIdx)}>{r.overdue}</td>
                  <td className={tdClass("priority", rowIdx)}>{r.criticalPriority}</td>
                  <td className={tdClass("risk", rowIdx)}>{r.highPriority}</td>
                  <td className={tdClass("escalation", rowIdx, "", true)}>{r.highRisk}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionRegisterView({ canEdit, items, loading, error, onReload }) {
  const [modal, setModal] = useState(null); // null | { mode: "add" } | { mode: "edit", item }
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [idSortDir, setIdSortDir] = useState("asc");

  // Column filter state — one per filterable column, same shape as
  // ItTicketsMonitorTable.jsx's filters.
  const [itemQuery, setItemQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(() => new Set());
  const [ownerFilter, setOwnerFilter] = useState(() => new Set());
  const [dueFilter, setDueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());
  const [riskFilter, setRiskFilter] = useState(() => new Set());
  const [escalationFilter, setEscalationFilter] = useState(() => new Set());

  // "Show archived" toggle — scoped to this sub-tab only (Board Summary and
  // Executive Dashboard are KPI rollups that only make sense over the live,
  // non-archived list, so they keep using the parent-loaded `items` as-is).
  // Archived items are fetched separately on demand rather than lifted into
  // the parent's load(), since the parent's list is shared with those other
  // two views and must never include archived rows.
  const [showArchived, setShowArchived] = useState(false);
  const [archivedItems, setArchivedItems] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState("");
  const [restoringId, setRestoringId] = useState(null);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    setArchivedError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/action-items", { params: { archived: "true" } });
      setArchivedItems(data.items || []);
    } catch (e) {
      setArchivedError(friendlyErrorMessage(e, "Could not load archived action items."));
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  const baseItems = showArchived ? archivedItems : items;

  const kpis = useMemo(() => computeKpis(baseItems), [baseItems]);

  const categoryOptions = useMemo(() => dynamicOptionsWithCounts(baseItems, "category"), [baseItems]);
  const ownerOptions = useMemo(() => dynamicOptionsWithCounts(baseItems, "owner"), [baseItems]);
  const statusOptions = useMemo(() => fixedOptionsWithCounts(baseItems, "status", STATUS_OPTIONS), [baseItems]);
  const priorityOptions = useMemo(() => fixedOptionsWithCounts(baseItems, "priority", PRIORITY_OPTIONS), [baseItems]);
  const riskOptions = useMemo(() => fixedOptionsWithCounts(baseItems, "risk_impact", RISK_IMPACT_OPTIONS), [baseItems]);
  const escalationOptions = useMemo(() => fixedOptionsWithCounts(baseItems, "escalation_required", ESCALATION_OPTIONS), [baseItems]);

  const activeFilterCount = [
    itemQuery.trim() !== "",
    categoryFilter.size > 0,
    ownerFilter.size > 0,
    dueFilter !== "all",
    statusFilter.size > 0,
    priorityFilter.size > 0,
    riskFilter.size > 0,
    escalationFilter.size > 0,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setItemQuery("");
    setCategoryFilter(new Set());
    setOwnerFilter(new Set());
    setDueFilter("all");
    setStatusFilter(new Set());
    setPriorityFilter(new Set());
    setRiskFilter(new Set());
    setEscalationFilter(new Set());
  };

  const filtered = useMemo(() => {
    let list = baseItems.filter((i) => {
      if (itemQuery.trim() && !String(i.item || "").toLowerCase().includes(itemQuery.trim().toLowerCase())) return false;
      if (categoryFilter.size > 0 && !categoryFilter.has((i.category || "").trim())) return false;
      if (ownerFilter.size > 0 && !ownerFilter.has((i.owner || "").trim())) return false;
      if (!dueMatchesRange(i, dueFilter)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(i.status)) return false;
      if (priorityFilter.size > 0 && !priorityFilter.has(i.priority)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(i.risk_impact)) return false;
      if (escalationFilter.size > 0 && !escalationFilter.has(i.escalation_required)) return false;
      return true;
    });
    list = [...list].sort((a, b) => (idSortDir === "asc" ? a.id - b.id : b.id - a.id));
    return list;
  }, [baseItems, itemQuery, categoryFilter, ownerFilter, dueFilter, statusFilter, priorityFilter, riskFilter, escalationFilter, idSortDir]);

  const handleCreate = async (values) => {
    await api.post("/cfo/slt/v2/action-items", values);
    setModal(null);
    await onReload();
  };

  const handleUpdate = async (id, values) => {
    await api.patch(`/cfo/slt/v2/action-items/${id}`, values);
    setModal(null);
    await onReload();
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.post(`/cfo/slt/v2/action-items/${archiveTarget.id}/archive`);
      setArchiveTarget(null);
      await onReload();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not archive this action item."));
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (item) => {
    setRestoringId(item.id);
    try {
      await api.post(`/cfo/slt/v2/action-items/${item.id}/restore`);
      await loadArchived();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not restore this action item."));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <BoardHeader
        title={showArchived ? "Action Register — Archived" : "Action Register"}
        subtitle={`${baseItems.length} item${baseItems.length === 1 ? "" : "s"}`}
        pills={[<StatPill key="total" label="Total" value={baseItems.length} accent="bg-white/15 ring-1 ring-white/20" />, ...kpiPills(kpis)]}
        right={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <GhostButton
                onClick={() => setShowArchived((v) => !v)}
                className={showArchived ? "!border-white/60 !text-white hover:!bg-white/10" : "!border-white/40 !text-white/90 hover:!bg-white/10"}
              >
                {showArchived ? "← Back to Action Register" : "Show Archived"}
              </GhostButton>
            ) : null}
            {canEdit && !showArchived ? <PrimaryButton onClick={() => setModal({ mode: "add" })}>+ Add Action Item</PrimaryButton> : null}
          </div>
        }
      />

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

      {(showArchived ? archivedError : error) ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {showArchived ? archivedError : error}
        </div>
      ) : null}

      <h4 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">{showArchived ? "Archived Action Items" : "Action Register"}</h4>
      {(showArchived ? archivedLoading : loading) ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : baseItems.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {showArchived ? "No archived action items." : `No action items yet${canEdit ? " — click \"Add Action Item\" to create the first one." : "."}`}
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
                <th className={thClass("item", "w-[20%]")}>
                  <ColumnFilterHeader label="Item" active={itemQuery.trim() !== ""}>
                    <TextFilterContent value={itemQuery} onChange={setItemQuery} placeholder="Contains…" />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("category", "w-[10%]")}>
                  <ColumnFilterHeader label="Category" active={categoryFilter.size > 0}>
                    <CheckboxFilterContent options={categoryOptions} selected={categoryFilter} onChange={setCategoryFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("owner", "w-[9%]")}>
                  <ColumnFilterHeader label="Owner" active={ownerFilter.size > 0}>
                    <CheckboxFilterContent options={ownerOptions} selected={ownerFilter} onChange={setOwnerFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("due", "w-[10%]")}>
                  <ColumnFilterHeader label="Due Date" active={dueFilter !== "all"}>
                    <RadioFilterContent name="action-register-due" options={DUE_RANGE_OPTIONS} value={dueFilter} onChange={setDueFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("status", "w-[11%]")}>
                  <ColumnFilterHeader label="Status" active={statusFilter.size > 0}>
                    <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("priority", "w-[9%]")}>
                  <ColumnFilterHeader label="Priority" active={priorityFilter.size > 0}>
                    <CheckboxFilterContent options={priorityOptions} selected={priorityFilter} onChange={setPriorityFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("risk", "w-[8%]")}>
                  <ColumnFilterHeader label="Risk" active={riskFilter.size > 0}>
                    <CheckboxFilterContent options={riskOptions} selected={riskFilter} onChange={setRiskFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("escalation", "w-[9%]")}>
                  <ColumnFilterHeader label="Escalation" active={escalationFilter.size > 0}>
                    <CheckboxFilterContent options={escalationOptions} selected={escalationFilter} onChange={setEscalationFilter} />
                  </ColumnFilterHeader>
                </th>
                {canEdit ? <th className={thClass("actions", "w-[8%]", true)}>{showArchived ? "Restore" : "Actions"}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-6 py-8 text-center text-sm text-slate-400">
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((i, rowIdx) => (
                  <tr key={i.id} className="group">
                    <td className={tdClass("id", rowIdx, "font-mono text-slate-500 dark:text-slate-400")}>{i.display_id}</td>
                    <td className={tdClass("item", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>
                      {i.item}
                      {i.flag ? <span className="ml-1" title="Critical/High priority">⚑</span> : null}
                    </td>
                    <td className={tdClass("category", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.category || "—"}</td>
                    <td className={tdClass("owner", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.owner || "—"}</td>
                    <td className={tdClass("due", rowIdx)}>
                      <DueDateBadge item={i} />
                    </td>
                    <td className={tdClass("status", rowIdx)}>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className={tdClass("priority", rowIdx)}>
                      <PriorityBadge priority={i.priority} />
                    </td>
                    <td className={tdClass("risk", rowIdx)}>
                      <RiskBadge risk={i.risk_impact} />
                    </td>
                    <td className={tdClass("escalation", rowIdx)}>
                      <EscalationBadge value={i.escalation_required} />
                    </td>
                    {canEdit ? (
                      <td className={tdClass("actions", rowIdx, "", true)}>
                        {showArchived ? (
                          <button
                            type="button"
                            onClick={() => handleRestore(i)}
                            disabled={restoringId === i.id}
                            className="w-full rounded-full border border-[#0B3EAF]/40 py-0.5 text-center text-[10px] font-semibold text-[#0B3EAF] transition hover:bg-[#0B3EAF]/10 disabled:opacity-50 dark:border-[#A7D344]/40 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10"
                          >
                            {restoringId === i.id ? "Restoring…" : "Restore"}
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setModal({ mode: "edit", item: i })}
                              className="w-full rounded-full border border-slate-300 py-0.5 text-center text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(i)}
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
        </div>
      )}

      {modal ? (
        <ActionItemFormModal
          title={modal.mode === "add" ? "Add Action Item" : `Edit ${modal.item.display_id}`}
          initialValues={modal.mode === "edit" ? modal.item : undefined}
          submitLabel={modal.mode === "add" ? "Add Action Item" : "Save Changes"}
          onClose={() => setModal(null)}
          onSubmit={(values) => (modal.mode === "add" ? handleCreate(values) : handleUpdate(modal.item.id, values))}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title="Archive this action item?"
          message={
            <ArchiveConfirmMessage
              itemText={archiveTarget.item}
              scopeText="the Action Register, Board Summary, and Executive Dashboard"
            />
          }
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}
    </div>
  );
}

export default function SltActionTrackerBoard({ canEdit }) {
  const [subTab, setSubTab] = useState(SUB_TABS[0].key);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/action-items");
      setItems(data.items || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load the Action Register."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <SubTabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} />
      {loading && subTab !== "action_register" ? (
        <div className="flex items-center justify-center gap-3 px-6 py-16">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
          <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading…</p>
        </div>
      ) : error && subTab !== "action_register" ? (
        <div className="rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : subTab === "board_summary" ? (
        <BoardSummaryView items={items} />
      ) : subTab === "executive_dashboard" ? (
        <ExecutiveDashboardView items={items} />
      ) : (
        <ActionRegisterView canEdit={canEdit} items={items} loading={loading} error={error} onReload={load} />
      )}
    </div>
  );
}
