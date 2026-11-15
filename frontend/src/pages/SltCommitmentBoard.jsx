import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { RAG_STATUS_OPTIONS, COMPLETION_STATUS_OPTIONS, EXTENSION_APPROVER_OPTIONS, OWNER_SUGGESTIONS } from "../constants/sltCommitmentLists";
import { computeCommitmentKpis } from "../utils/sltCommitmentAnalytics";
import ExportMenu from "../components/ExportMenu";

/**
 * SLT Tracker → "90 Day Commitments" radio choice.
 *
 * The fourth of the four top-level radio choices in CfoReportsPage.jsx
 * (alongside SLT Master Calendar, Action Tracker, and Decisions). Built
 * from the uploaded source workbook — SLT_Action_Tracker_Board_Ready_
 * Executive_v4_2026_Master_1.xlsx — specifically its "90-Commitments" sheet
 * (an Excel Table named "CommitmentsTable", header row 12, columns A:W).
 *
 * Backend: GET/POST/PATCH /cfo/slt/v2/commitments plus .../:id/archive
 * (sltCommitmentRegister.service.js, slt_commitment_register table). Unlike
 * Decisions, there's only ONE view here (no Queue/Register split) — every
 * commitment lives in one list, same as Action Register's Board Summary/
 * Executive Dashboard tiers but without a tiered view of its own; this
 * board shows the full register with Excel-style column filters instead.
 *
 * Original Due, 30/60-Day Check-In Due, Current Due, and Report Cue are all
 * computed server-side in mapCommitment() (sltCommitmentRegister.service.js)
 * exactly mirroring the source sheet's own formulas — never stored, never
 * editable directly; editing Date Assigned/Revised Due/Delivered On/
 * Completion Status recomputes them automatically.
 *
 * Visual style mirrors SltDecisionBoard.jsx / SltActionTrackerBoard.jsx —
 * same gradient banner header with stat pills, same Excel-style per-column
 * filter dropdowns, same tinted-column table. Those helpers are duplicated
 * here rather than imported, following this codebase's own convention (see
 * SltActionTrackerBoard.jsx's header comment) of local copies per file
 * instead of a shared UI kit.
 */

const COMMITMENT_FIELDS = [
  { key: "commitment", label: "Commitment / Deliverable", type: "textarea", required: true },
  { key: "owner", label: "Owner", type: "select_other", suggestions: OWNER_SUGGESTIONS },
  { key: "success_measure", label: "Success Measure", type: "textarea" },
  { key: "rag_status", label: "RAG Status", type: "select", options: RAG_STATUS_OPTIONS },
  { key: "status_note", label: "Status Note", type: "textarea" },
  { key: "date_entered", label: "Date Entered", type: "date" },
  { key: "date_assigned", label: "Date Assigned (if different from entry date)", type: "date" },
  { key: "checkin_30_notes", label: "30-Day Check-In Notes", type: "textarea" },
  { key: "checkin_60_notes", label: "60-Day Check-In Notes", type: "textarea" },
  { key: "checkin_90_update_dates", label: "90-Day Update Dates", type: "text" },
  { key: "extension_approved_by", label: "Extension Approved By", type: "select", options: EXTENSION_APPROVER_OPTIONS },
  { key: "ext_approval_date", label: "Extension Approval Date", type: "date" },
  { key: "revised_due", label: "Revised Due", type: "date" },
  { key: "delivered_on", label: "Delivered On", type: "date" },
  { key: "completion_status", label: "Completion Status", type: "select", options: COMPLETION_STATUS_OPTIONS },
  { key: "change_risk_next_step", label: "Change / Risk / Next Step", type: "textarea" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyFormValues() {
  const v = {};
  for (const f of COMMITMENT_FIELDS) v[f.key] = "";
  v.rag_status = "Not Started / At Risk";
  v.completion_status = "Open";
  // "Date record entered" is effectively an auto-stamp in the source sheet
  // (every real row carries the day it was bulk-entered) — prefill today's
  // date on a new commitment rather than leaving it blank.
  v.date_entered = todayIso();
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
// for why this reuses COMMITMENT_FIELDS (the Add/Edit form's own field
// list) rather than a separately hand-maintained column list. Current Due
// and Report Cue are added on top since they're server-computed display
// fields (see sltCommitmentAnalytics.js / the backend mapCommitment()) that
// aren't part of the editable form but are genuinely useful in an export.
const COMMITMENT_EXPORT_COLUMNS = [
  { key: "display_id", label: "ID" },
  ...COMMITMENT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    format: f.type === "date" ? (row) => fmtDate(row[f.key]) : undefined,
  })),
  { key: "current_due", label: "Current Due", format: (row) => fmtDate(row.current_due) },
  { key: "report_cue", label: "Report Cue" },
  { key: "created_at", label: "Created", format: (row) => fmtCreatedDate(row.created_at) },
];

// ── Small shared presentational bits — see SltDecisionBoard.jsx's header
// comment for why these are duplicated rather than imported. ──

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
      <option value="">— Select —</option>
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

function CommitmentFormModal({ title, initialValues, onClose, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState(() => ({ ...emptyFormValues(), ...initialValues }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not save this commitment."));
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
          {COMMITMENT_FIELDS.map((def) => (
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

// Clicking a row opens this read-only view of every field, since the
// table itself only has room for a handful of columns. "Commitment" is
// pulled out of the grid and shown big up top; everything else follows
// in the same two-column layout the Add/Edit form uses, plus Current Due
// and Report Cue (server-computed, not part of the editable
// COMMITMENT_FIELDS list — same two fields COMMITMENT_EXPORT_COLUMNS adds
// for the same reason) and Created, just not editable.
function CommitmentViewModal({ item, canEdit, onEdit, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{item.display_id}</p>
            <h3 className="break-words text-sm font-semibold text-slate-900 dark:text-white">{item.commitment}</h3>
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
          {COMMITMENT_FIELDS.filter((def) => def.key !== "commitment").map((def) => (
            <div key={def.key} className={def.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : ""}>
              <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{def.label}</p>
              <p className="whitespace-pre-wrap break-words text-xs text-slate-900 dark:text-slate-100">{fieldDisplayValue(def, item)}</p>
            </div>
          ))}
          <div>
            <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Current Due</p>
            <p className="text-xs text-slate-900 dark:text-slate-100">{fmtDate(item.current_due)}</p>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Report Cue</p>
            <p className="text-xs text-slate-900 dark:text-slate-100">{item.report_cue || "—"}</p>
          </div>
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

// ── Excel-style column filters — see SltDecisionBoard.jsx for the full
// explanation; duplicated here verbatim. ──

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
            onClick={() => onChange(new Set(["__none_selected__"]))}
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
// fields like current_due), so it needs its own formatter and its own
// range-matching logic rather than reusing fmtDate/dateMatchesRange above,
// which assume local-midnight YYYY-MM-DD.
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

const DUE_DATE_RANGE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "past", label: "Overdue" },
  { key: "this_week", label: "Due this week" },
  { key: "this_month", label: "Due this month" },
  { key: "no_date", label: "No due date" },
];

// ── Column tinting — same keys/colors as SltDecisionBoard.jsx's table,
// re-slotted onto Commitment columns, purely so all SLT boards read as one
// visual family. ──

const HEADER_COL_BG = {
  id: "bg-slate-200/70 dark:bg-slate-800",
  commitment: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  owner: "bg-violet-100/45 dark:bg-violet-950/30",
  rag: "bg-amber-100/50 dark:bg-amber-950/30",
  due: "bg-slate-200/55 dark:bg-slate-800/80",
  completion: "bg-sky-100/55 dark:bg-sky-950/35",
  checkin30: "bg-teal-100/50 dark:bg-teal-950/30",
  checkin60: "bg-indigo-100/50 dark:bg-indigo-950/30",
  report: "bg-red-100/45 dark:bg-red-950/30",
  created: "bg-cyan-100/45 dark:bg-cyan-950/25",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

function bodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    id: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    commitment: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    owner: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    rag: alt ? "bg-amber-50/85 dark:bg-amber-950/18" : "bg-amber-50/45 dark:bg-amber-950/10",
    due: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    completion: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    checkin30: alt ? "bg-teal-50/85 dark:bg-teal-950/18" : "bg-teal-50/45 dark:bg-teal-950/10",
    checkin60: alt ? "bg-indigo-50/85 dark:bg-indigo-950/18" : "bg-indigo-50/45 dark:bg-indigo-950/10",
    report: alt ? "bg-red-50/85 dark:bg-red-950/18" : "bg-red-50/45 dark:bg-red-950/10",
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
// the top strip of the unified white <section> card SltCommitmentBoard
// wraps itself in (header → filter band → table all one card, same shape
// as the Master Calendar's <section> in SltTrackerV2.jsx), instead of
// floating as its own gradient banner above a separately-boxed table.
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

function RagBadge({ value }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const cls =
    value === "Met / On Track"
      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
      : value === "In Progress / Carried Forward"
        ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800"
        : "bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  return <span className={`${BADGE} ${cls}`}>{value}</span>;
}

function CompletionBadge({ value }) {
  const cls =
    value === "Closed"
      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
      : "bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800";
  return <span className={`${BADGE} ${cls}`}>{value || "Open"}</span>;
}

function DueDateBadge({ item }) {
  if (!item.current_due) return <span className="text-slate-400">—</span>;
  const cls = item.overdue
    ? "text-red-700 dark:text-red-300 font-semibold"
    : item.open && item.report_cue
      ? "text-amber-700 dark:text-amber-300 font-semibold"
      : "text-slate-600 dark:text-slate-300";
  return <span className={cls}>{fmtDate(item.current_due)}</span>;
}

function ReportCueBadge({ item }) {
  if (!item.open) return <span className="text-slate-400">—</span>;
  if (item.overdue) {
    return <span className={`${BADGE} bg-red-100 text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800`}>Overdue</span>;
  }
  if (item.report_cue) {
    return (
      <span className={`${BADGE} bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800`}>
        Due Soon
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}

const KPI_PILL_ACCENTS = {
  open: "bg-white/15 ring-1 ring-white/20",
  closed: "bg-sky-300 text-sky-950",
  overdue: "bg-red-300 text-red-950",
  needsReport: "bg-amber-300 text-amber-950",
  onTrack: "bg-[#A7D344] text-[#0a0a0a]",
};

const KPI_LABELS = {
  open: "Open",
  closed: "Closed",
  overdue: "Overdue",
  needsReport: "Due Soon",
  onTrack: "On Track",
};

function kpiPills(kpis) {
  return Object.keys(KPI_LABELS).map((k) => <StatPill key={k} label={KPI_LABELS[k]} value={kpis[k]} accent={KPI_PILL_ACCENTS[k]} />);
}

function CommitmentTable({ items, canEdit, onEdit, onArchive, archivedMode = false, onRestore, restoringId, onView, onExportDataChange }) {
  const [commitmentQuery, setCommitmentQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState(() => new Set());
  const [ragFilter, setRagFilter] = useState(() => new Set());
  const [completionFilter, setCompletionFilter] = useState(() => new Set());
  const [dueFilter, setDueFilter] = useState("all");
  const [createdRange, setCreatedRange] = useState({ from: "", to: "" });
  // Newest-created first by default — see the matching comment in
  // SltActionTrackerBoard.jsx's ActionRegisterView.
  const [idSortDir, setIdSortDir] = useState("desc");

  const ownerOptions = useMemo(() => dynamicOptionsWithCounts(items, "owner"), [items]);
  const ragOptions = useMemo(() => fixedOptionsWithCounts(items, "rag_status", RAG_STATUS_OPTIONS), [items]);
  const completionOptions = useMemo(() => fixedOptionsWithCounts(items, "completion_status", COMPLETION_STATUS_OPTIONS), [items]);

  const activeFilterCount = [
    commitmentQuery.trim() !== "",
    ownerFilter.size > 0,
    ragFilter.size > 0,
    completionFilter.size > 0,
    dueFilter !== "all",
    createdRange.from !== "" || createdRange.to !== "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setCommitmentQuery("");
    setOwnerFilter(new Set());
    setRagFilter(new Set());
    setCompletionFilter(new Set());
    setDueFilter("all");
    setCreatedRange({ from: "", to: "" });
  };

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (commitmentQuery.trim() && !String(i.commitment || "").toLowerCase().includes(commitmentQuery.trim().toLowerCase())) return false;
      if (ownerFilter.size > 0 && !ownerFilter.has((i.owner || "").trim())) return false;
      if (ragFilter.size > 0 && !ragFilter.has(i.rag_status)) return false;
      if (completionFilter.size > 0 && !completionFilter.has(i.completion_status)) return false;
      if (!dateMatchesRange(i.current_due, dueFilter)) return false;
      if (!createdAtMatchesRange(i.created_at, createdRange.from, createdRange.to)) return false;
      return true;
    });
    list = [...list].sort((a, b) => (idSortDir === "asc" ? a.id - b.id : b.id - a.id));
    return list;
  }, [items, commitmentQuery, ownerFilter, ragFilter, completionFilter, dueFilter, createdRange, idSortDir]);

  const exportFilenameBase = archivedMode ? "90-day-commitments-archived" : "90-day-commitments";
  const exportTitle = archivedMode ? "90 Day Commitments — Archived" : "90 Day Commitments";

  // The Export button itself now lives in the page-level BoardHeader (the
  // blue bar), alongside Show Archived / + Add Commitment, not down here —
  // but `filtered` only exists in this component, so it's reported up on
  // every change via this callback instead. onExportDataChange is a
  // useCallback with an empty dep array at the call site, so this effect
  // only re-fires when the export data itself actually changes, not on
  // every parent render.
  useEffect(() => {
    onExportDataChange?.({ rows: filtered, filenameBase: exportFilenameBase, title: exportTitle });
  }, [filtered, exportFilenameBase, exportTitle, onExportDataChange]);

  // Returns the rest of the page-level <section> card (the filter band +
  // the padded table area) as a fragment — BoardHeader (the top strip) is
  // rendered once at the page level, above this table, so this component
  // only needs to contribute the pieces that come after it.
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
          {archivedMode ? "No archived commitments." : "No 90-day commitments yet."}
        </div>
      ) : (
        <table className="w-full table-fixed border-collapse border border-slate-200 text-left text-xs dark:border-slate-600/50">
            <thead className="border-b-2 border-slate-300 dark:border-slate-600">
              <tr>
                <th className={thClass("id", "w-[7%]")}>
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
                <th className={thClass("commitment", "w-[16%]")}>
                  <ColumnFilterHeader label="Commitment" active={commitmentQuery.trim() !== ""}>
                    <TextFilterContent value={commitmentQuery} onChange={setCommitmentQuery} placeholder="Contains…" />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("owner", "w-[8%]")}>
                  <ColumnFilterHeader label="Owner" active={ownerFilter.size > 0}>
                    <CheckboxFilterContent options={ownerOptions} selected={ownerFilter} onChange={setOwnerFilter} searchable />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("rag", "w-[10%]")}>
                  <ColumnFilterHeader label="RAG Status" active={ragFilter.size > 0}>
                    <CheckboxFilterContent options={ragOptions} selected={ragFilter} onChange={setRagFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("due", "w-[8%]")}>
                  <ColumnFilterHeader label="Current Due" active={dueFilter !== "all"}>
                    <RadioFilterContent name="commitment-due" options={DUE_DATE_RANGE_OPTIONS} value={dueFilter} onChange={setDueFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("completion", "w-[7%]")}>
                  <ColumnFilterHeader label="Status" active={completionFilter.size > 0}>
                    <CheckboxFilterContent options={completionOptions} selected={completionFilter} onChange={setCompletionFilter} />
                  </ColumnFilterHeader>
                </th>
                <th className={thClass("checkin30", "w-[11%]")}>30-Day Notes</th>
                <th className={thClass("checkin60", "w-[11%]")}>60-Day Notes</th>
                <th className={thClass("report", "w-[7%]")}>Report Cue</th>
                <th className={thClass("created", "w-[7%]")}>
                  {/* align="right" — this column sits near the right edge of
                      the table, so the default left-anchored 240px-wide
                      popover would run off the edge of the screen. */}
                  <ColumnFilterHeader label="Created" align="right" active={createdRange.from !== "" || createdRange.to !== ""}>
                    <DateRangeFilterContent from={createdRange.from} to={createdRange.to} onChange={setCreatedRange} />
                  </ColumnFilterHeader>
                </th>
                {canEdit ? <th className={thClass("actions", "w-[9%]", true)}>{archivedMode ? "Restore" : "Actions"}</th> : null}
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
                    <td className={tdClass("commitment", rowIdx, "font-semibold text-slate-900 dark:text-slate-100")}>{i.commitment}</td>
                    <td className={tdClass("owner", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.owner || "—"}</td>
                    <td className={tdClass("rag", rowIdx)}>
                      <RagBadge value={i.rag_status} />
                    </td>
                    <td className={tdClass("due", rowIdx)}>
                      <DueDateBadge item={i} />
                    </td>
                    <td className={tdClass("completion", rowIdx)}>
                      <CompletionBadge value={i.completion_status} />
                    </td>
                    <td className={tdClass("checkin30", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.checkin_30_notes || "—"}</td>
                    <td className={tdClass("checkin60", rowIdx, "text-slate-600 dark:text-slate-300")}>{i.checkin_60_notes || "—"}</td>
                    <td className={tdClass("report", rowIdx)}>
                      <ReportCueBadge item={i} />
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

export default function SltCommitmentBoard({ canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "add" } | { mode: "edit", item }
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  // "Show archived" toggle — flips the whole board between the live list
  // and the archived one, same query param the backend already supported
  // (listCommitments(query) in sltCommitmentRegister.service.js) but that
  // nothing in the UI exposed until now. Archiving something promises it
  // "can be restored later if needed" (see ArchiveConfirmMessage) — this is
  // what makes that actually true instead of only being a backend capability
  // with no way to reach it.
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  // Row click → read-only "view details" popup (see CommitmentViewModal).
  // Edit from inside that popup is only offered while looking at the live
  // list, same as the row's own Edit button being swapped out for Restore.
  const [viewItem, setViewItem] = useState(null);

  // Export button data — reported up from CommitmentTable (see the
  // matching comment there). useCallback with an empty dep array keeps
  // this handler's identity stable so CommitmentTable's effect doesn't
  // re-fire on every render of this component.
  const [exportData, setExportData] = useState({ rows: [], filenameBase: "90-day-commitments", title: "90 Day Commitments" });
  const handleExportDataChange = useCallback((data) => setExportData(data), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cfo/slt/v2/commitments", { params: { archived: showArchived ? "true" : "false" } });
      setItems(data.commitments || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, showArchived ? "Could not load archived commitments." : "Could not load 90 Day Commitments."));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => computeCommitmentKpis(items), [items]);

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

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.post(`/cfo/slt/v2/commitments/${archiveTarget.id}/archive`);
      setArchiveTarget(null);
      await load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not archive this commitment."));
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (item) => {
    setRestoringId(item.id);
    try {
      await api.post(`/cfo/slt/v2/commitments/${item.id}/restore`);
      await load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not restore this commitment."));
    } finally {
      setRestoringId(null);
    }
  };

  // "card p-4 sm:p-6" — the same page-level white panel wrapper
  // SltTrackerV2's default export uses behind its own SubTabBar + content,
  // for visual consistency with the other SLT boards (this one has no
  // sub-tabs of its own, just the single commitments table below).
  return (
    <div className="card p-4 sm:p-6">
      {/* One unified white card (header → filter band → table), same shape
          as the Master Calendar's <section> in SltTrackerV2.jsx, instead of
          a floating gradient banner sitting above a separately-boxed
          table. */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
      <BoardHeader
        title={showArchived ? "90 Day Commitments — Archived" : "90 Day Commitments"}
        pills={[<StatPill key="total" label="Total" value={kpis.total} accent="bg-white/15 ring-1 ring-white/20" />, ...kpiPills(kpis)]}
        right={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <GhostButton
                onClick={() => setShowArchived((v) => !v)}
                className={showArchived ? "!border-white/60 !text-white hover:!bg-white/10" : "!border-white/40 !text-white/90 hover:!bg-white/10"}
              >
                {showArchived ? "← Back to Commitments" : "Show Archived"}
              </GhostButton>
            ) : null}
            {canEdit && !showArchived ? <PrimaryButton onClick={() => setModal({ mode: "add" })}>+ Add Commitment</PrimaryButton> : null}
            {/* Exports exactly `filtered` from CommitmentTable — see
                handleExportDataChange and the matching comment there. */}
            <ExportMenu columns={COMMITMENT_EXPORT_COLUMNS} rows={exportData.rows} filenameBase={exportData.filenameBase} title={exportData.title} variant="onBlue" />
          </div>
        }
      />

      {loading ? (
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
      ) : (
        <CommitmentTable
          items={items}
          canEdit={canEdit}
          onEdit={(item) => setModal({ mode: "edit", item })}
          onArchive={(item) => setArchiveTarget(item)}
          archivedMode={showArchived}
          onRestore={handleRestore}
          restoringId={restoringId}
          onView={(item) => setViewItem(item)}
          onExportDataChange={handleExportDataChange}
        />
      )}
      </section>

      {modal ? (
        <CommitmentFormModal
          title={modal.mode === "add" ? "Add Commitment" : `Edit ${modal.item.display_id}`}
          initialValues={modal.mode === "edit" ? modal.item : undefined}
          submitLabel={modal.mode === "add" ? "Add Commitment" : "Save Changes"}
          onClose={() => setModal(null)}
          onSubmit={(values) => (modal.mode === "add" ? handleCreate(values) : handleUpdate(modal.item.id, values))}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title="Archive this commitment?"
          message={<ArchiveConfirmMessage itemText={archiveTarget.commitment} scopeText="the 90 Day Commitments board" />}
          confirmLabel="Archive"
          busy={archiving}
          onConfirm={confirmArchive}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}

      {viewItem ? (
        <CommitmentViewModal
          item={viewItem}
          canEdit={canEdit && !showArchived}
          onEdit={() => {
            setModal({ mode: "edit", item: viewItem });
            setViewItem(null);
          }}
          onClose={() => setViewItem(null)}
        />
      ) : null}
    </div>
  );
}
