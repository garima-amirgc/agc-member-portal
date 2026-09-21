import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { ticketRequesterPhotoUrl } from "../utils/ticketUserAvatar";
import {
  IT_FILTER_TABS,
  IT_TYPE_FILTER_TABS,
  issueTypeBadgeClass,
  issueTypeFromTicketTitle,
  priorityBadgeClass,
  priorityBadgeLabel,
  ticketMatchesIssueTypeFilter,
} from "../utils/itTicketStyles";
import { canUserEditTicket } from "../utils/ticketForm";
import TicketChatThread from "./TicketChatThread";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Completed" },
];

// Priority is a fixed, small set of values (same shape as Status), so it
// gets the same pill-tab treatment rather than a dropdown.
const PRIORITY_FILTER_TABS = [
  {
    key: "all",
    label: "All",
    active:
      "bg-white text-[#0B3EAF] shadow-md ring-2 ring-white/80 dark:bg-[#141414] dark:text-[#A7D344] dark:ring-[#A7D344]/40",
    idle: "bg-white/15 text-white hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20",
  },
  {
    key: "low",
    label: "Low",
    active: "bg-slate-200 text-slate-900 shadow-md ring-2 ring-slate-100/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "medium",
    label: "Medium",
    active: "bg-blue-300 text-blue-950 shadow-md ring-2 ring-blue-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "high",
    label: "High",
    active: "bg-orange-300 text-orange-950 shadow-md ring-2 ring-orange-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "urgent",
    label: "Urgent",
    active: "bg-red-300 text-red-950 shadow-md ring-2 ring-red-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
];

// "Submitted" is a date, not a fixed category — a quick-range picker (like a
// calendar slicer) covers the useful cases without needing an actual date
// picker widget.
const SUBMITTED_RANGE_OPTIONS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

function withinSubmittedRange(iso, key) {
  if (key === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "today") return d >= startOfToday;
  if (key === "7d") return d >= new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (key === "30d") return d >= new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);
  return true;
}

const TH_BASE =
  "px-1.5 py-3 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300";
const TD = "px-1.5 py-3 align-middle";
const BADGE =
  "inline-flex max-w-full items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide";

function vline(isLastColumn) {
  return isLastColumn ? "" : "border-r border-slate-200 dark:border-slate-600/55";
}

const HEADER_COL_BG = {
  id: "bg-slate-200/70 dark:bg-slate-800",
  requester: "bg-[rgba(11,62,175,0.1)] dark:bg-[rgba(11,62,175,0.28)]",
  issue: "bg-[rgba(11,62,175,0.06)] dark:bg-[rgba(11,62,175,0.18)]",
  status: "bg-emerald-100/55 dark:bg-emerald-950/35",
  priority: "bg-sky-100/55 dark:bg-sky-950/35",
  category: "bg-amber-100/50 dark:bg-amber-950/30",
  assignee: "bg-violet-100/45 dark:bg-violet-950/30",
  submitted: "bg-slate-200/55 dark:bg-slate-800/80",
  actions: "bg-slate-200/60 dark:bg-slate-800",
};

function bodyColBg(col, rowIdx) {
  const alt = rowIdx % 2 === 1;
  const map = {
    id: alt ? "bg-slate-200/45 dark:bg-slate-800/70" : "bg-slate-100/80 dark:bg-slate-800/45",
    requester: alt ? "bg-blue-50 dark:bg-blue-950/25" : "bg-blue-50/45 dark:bg-blue-950/15",
    issue: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
    status: alt ? "bg-emerald-50/90 dark:bg-emerald-950/20" : "bg-emerald-50/50 dark:bg-emerald-950/10",
    priority: alt ? "bg-sky-50/95 dark:bg-sky-950/20" : "bg-sky-50/55 dark:bg-sky-950/10",
    category: alt ? "bg-amber-50/85 dark:bg-amber-950/18" : "bg-amber-50/45 dark:bg-amber-950/10",
    assignee: alt ? "bg-violet-50/80 dark:bg-violet-950/18" : "bg-violet-50/40 dark:bg-violet-950/10",
    submitted: alt ? "bg-slate-100 dark:bg-slate-800/55" : "bg-slate-50 dark:bg-slate-800/35",
    actions: alt ? "bg-[#eef3fa] dark:bg-[#1e2433]" : "bg-white dark:bg-[#141414]",
  };
  return `${map[col] || (alt ? "bg-[#eef3fa]" : "bg-white")} group-hover:brightness-[0.98] dark:group-hover:brightness-110`;
}

function thClass(col, extra = "", isLast = false) {
  return [TH_BASE, HEADER_COL_BG[col] || "", vline(isLast), extra].filter(Boolean).join(" ");
}

function tdClass(col, rowIdx, extra = "", isLast = false) {
  return [TD, bodyColBg(col, rowIdx), vline(isLast), extra].filter(Boolean).join(" ");
}

function statusBadgeLabel(status) {
  if (status === "closed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Open";
}

function statusBadgeClass(status) {
  if (status === "closed") {
    return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800";
  }
  if (status === "in_progress") {
    return "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800";
  }
  return "bg-[rgba(167,211,68,0.35)] text-[#1a3d00] ring-1 ring-[#A7D344]/50 dark:bg-[rgba(167,211,68,0.2)] dark:text-[#A7D344] dark:ring-[#A7D344]/40";
}

function initialsFromName(name) {
  const source = String(name || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "U";
}

function firstNameOnly(name) {
  const source = String(name || "").trim();
  if (!source) return "";
  return source.split(/\s+/)[0];
}

function titleWithoutTypePrefix(title) {
  const raw = String(title || "").trim();
  return raw.replace(/^\s*\[[^\]]+\]\s*/, "").trim() || raw;
}

function formatSubmittedDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatSubmittedTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Stacked vertically (rather than side-by-side) so this control stays a
// fixed, narrow width no matter how many actions a person can see — that's
// what keeps the table from needing to grow wider than the viewport.
const ACTION_BTN_STACK =
  "flex h-7 w-full items-center justify-center whitespace-nowrap px-2 text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF]/35 disabled:opacity-50";

function TicketRowActions({
  ticket,
  canEdit,
  isIT,
  isAdmin,
  deletingId,
  onEdit,
  onStatusChange,
  onDelete,
}) {
  const hasEdit = canEdit;
  const hasStatus = isIT;
  const hasDelete = isAdmin;
  const segmentCount = [hasEdit, hasStatus, hasDelete].filter(Boolean).length;
  if (segmentCount === 0) return <span className="text-xs text-slate-400">—</span>;

  return (
    <div
      className="mx-auto flex w-full max-w-[5.25rem] flex-col divide-y divide-slate-200/90 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-[#1a1a1a]"
      role="group"
      aria-label={`Actions for ticket ${ticket.id}`}
    >
      {hasEdit ? (
        <button
          type="button"
          className={`${ACTION_BTN_STACK} text-[#0B3EAF] hover:bg-[#0B3EAF]/5 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10`}
          onClick={() => onEdit?.(ticket)}
        >
          Edit
        </button>
      ) : null}
      {hasStatus ? (
        <div className="relative flex w-full items-center">
          <select
            className="h-7 w-full cursor-pointer appearance-none bg-transparent py-0 pl-2 pr-5 text-center text-[10px] font-semibold text-slate-800 outline-none focus:bg-slate-50 dark:text-slate-200 dark:focus:bg-white/5"
            value={ticket.status}
            onChange={(e) => onStatusChange(ticket.id, e.target.value)}
            aria-label={`Status for ticket ${ticket.id}`}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[7px] text-slate-400 dark:text-slate-500"
            aria-hidden
          >
            ▾
          </span>
        </div>
      ) : null}
      {hasDelete ? (
        <button
          type="button"
          disabled={deletingId === ticket.id}
          className={`${ACTION_BTN_STACK} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}
          onClick={() => onDelete?.(ticket.id)}
        >
          {deletingId === ticket.id ? "…" : "Delete"}
        </button>
      ) : null}
    </div>
  );
}

function parseTicketAttachments(ticket) {
  const raw = ticket?.attachments;
  if (raw == null || raw === "") return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function RequesterCell({ ticket, currentUser, compact = false }) {
  const img = ticketRequesterPhotoUrl(ticket, currentUser);
  const name = ticket?.user_name || "—";
  // Compact (row/card) view shows just the first name to keep the column
  // narrow; the expanded detail panel still shows the full name.
  const displayName = compact ? firstNameOnly(name) || name : name;
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = img && !imgFailed;
  const size = compact ? "h-7 w-7" : "h-8 w-8";
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
      <div
        className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#0B3EAF] to-[#1a5fd4] p-[2px]`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-white dark:bg-[#141414]">
          {showImg ? (
            <img
              src={img}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[rgba(11,62,175,0.08)] text-[9px] font-bold text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
              {initialsFromName(name)}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-900 dark:text-white" title={compact ? name : undefined}>
          {displayName}
        </div>
        {ticket?.user_department ? (
          <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{ticket.user_department}</div>
        ) : null}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div
      className={`flex min-h-[3rem] min-w-[3.75rem] flex-col items-center justify-center rounded-md px-2 py-1.5 text-center ${accent}`}
    >
      <div className="text-base font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

// ── Excel-style column filters ──────────────────────────────────────────
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
//
// "Clear all" needs to represent the opposite extreme — nothing checked —
// which can't be the empty Set (that means "everything"). This sentinel
// value stands in for that state: it never matches a real option, so the
// resulting filter matches zero rows, same as unchecking every box by hand.
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
  const visible = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

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
        {!allSelected && !noneSelected ? (
          <span className="text-[10px] text-slate-300 dark:text-slate-600">|</span>
        ) : null}
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
        <label
          key={o.key}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs font-normal hover:bg-slate-50 dark:hover:bg-white/5"
        >
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

export default function ItTicketsMonitorTable({
  tickets,
  loading,
  isIT,
  isAdmin = false,
  onStatusChange,
  onDelete,
  onEdit,
  deletingId = null,
  currentUser,
}) {
  // Each of these is an Excel-style checkbox selection: an empty Set means
  // "no filter, show every value" — Status starts with just "open" checked
  // so the board opens on the useful default view, the same as before.
  const [statusFilter, setStatusFilter] = useState(() => new Set(["open"]));
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());
  const [categoryFilter, setCategoryFilter] = useState(() => new Set());
  const [requesterFilter, setRequesterFilter] = useState(() => new Set());
  const [assigneeFilter, setAssigneeFilter] = useState(() => new Set());
  const [submittedFilter, setSubmittedFilter] = useState("all");
  const [issueQuery, setIssueQuery] = useState("");
  // Latest request on top by default (highest ticket ID first); clicking the
  // ID column header flips between newest-first and oldest-first.
  const [idSortDir, setIdSortDir] = useState("desc");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  const showActionsColumn = useMemo(() => {
    if (isIT || isAdmin) return true;
    return (Array.isArray(tickets) ? tickets : []).some((t) =>
      canUserEditTicket(t, currentUser, { isIT, isAdmin })
    );
  }, [tickets, isIT, isAdmin, currentUser]);

  const colCount = showActionsColumn ? 9 : 8;

  useEffect(() => {
    if (expandedId != null && !tickets.some((t) => t.id === expandedId)) {
      setExpandedId(null);
    }
  }, [tickets, expandedId]);

  // Fetch unread counts on mount and every 30 s
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const r = await api.get("/tickets/unread-counts");
      if (r.data && typeof r.data === "object") setUnreadCounts(r.data);
    } catch {
      // ignore — badge is non-critical
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCounts]);

  // Clear badge immediately when user opens a ticket (chat will mark as read on load)
  useEffect(() => {
    if (expandedId) {
      setUnreadCounts((prev) => ({ ...prev, [expandedId]: 0 }));
    }
  }, [expandedId]);

  const filtered = useMemo(() => {
    let list = Array.isArray(tickets) ? [...tickets] : [];
    if (statusFilter.size > 0) list = list.filter((t) => statusFilter.has(t.status));
    if (priorityFilter.size > 0) {
      list = list.filter((t) => priorityFilter.has(String(t.priority || "medium").toLowerCase()));
    }
    if (categoryFilter.size > 0) {
      list = list.filter((t) => categoryFilter.has(issueTypeFromTicketTitle(t.title)));
    }
    if (requesterFilter.size > 0) list = list.filter((t) => requesterFilter.has(String(t.user_name || "").trim()));
    if (assigneeFilter.size > 0) {
      list = list.filter((t) => assigneeFilter.has(String(t.assignee_name || "").trim()));
    }
    if (submittedFilter !== "all") list = list.filter((t) => withinSubmittedRange(t.created_at, submittedFilter));
    const q = issueQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        if (String(t.id).toLowerCase().includes(q)) return true;
        if (String(t.title || "").toLowerCase().includes(q)) return true;
        if (String(t.description || "").toLowerCase().includes(q)) return true;
        return false;
      });
    }
    list.sort((a, b) => {
      const an = Number(a.id);
      const bn = Number(b.id);
      const cmp =
        Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a.id).localeCompare(String(b.id));
      return idSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [
    tickets,
    statusFilter,
    priorityFilter,
    categoryFilter,
    requesterFilter,
    assigneeFilter,
    submittedFilter,
    issueQuery,
    idSortDir,
  ]);

  // Whether the board is showing anything other than its default "Open"
  // view — drives the empty-state copy and the mobile filter-count badge.
  const isDefaultView =
    statusFilter.size === 1 &&
    statusFilter.has("open") &&
    priorityFilter.size === 0 &&
    categoryFilter.size === 0 &&
    requesterFilter.size === 0 &&
    assigneeFilter.size === 0 &&
    submittedFilter === "all" &&
    issueQuery.trim() === "";

  const activeFilterCount = [
    statusFilter.size > 0,
    priorityFilter.size > 0,
    categoryFilter.size > 0,
    requesterFilter.size > 0,
    assigneeFilter.size > 0,
    submittedFilter !== "all",
    issueQuery.trim() !== "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter(new Set());
    setPriorityFilter(new Set());
    setCategoryFilter(new Set());
    setRequesterFilter(new Set());
    setAssigneeFilter(new Set());
    setSubmittedFilter("all");
    setIssueQuery("");
  };

  const counts = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    return {
      all: list.length,
      open: list.filter((t) => t.status === "open").length,
      in_progress: list.filter((t) => t.status === "in_progress").length,
      closed: list.filter((t) => t.status === "closed").length,
    };
  }, [tickets]);

  const typeCounts = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const out = { all: list.length };
    for (const tab of IT_TYPE_FILTER_TABS) {
      if (tab.key === "all") continue;
      out[tab.key] = list.filter((t) => ticketMatchesIssueTypeFilter(t, tab.key)).length;
    }
    return out;
  }, [tickets]);

  const priorityCounts = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const out = { all: list.length };
    for (const tab of PRIORITY_FILTER_TABS) {
      if (tab.key === "all") continue;
      out[tab.key] = list.filter((t) => String(t.priority || "medium").toLowerCase() === tab.key).length;
    }
    return out;
  }, [tickets]);

  // Option lists for the checkbox dropdowns — value/label/count triples.
  // Status/Priority/Category come from the app's known fixed sets; Requester
  // and Assignee are whatever distinct names are actually in the data.
  const statusOptions = useMemo(
    () => IT_FILTER_TABS.filter((t) => t.key !== "all").map((t) => ({ value: t.key, label: t.label, count: counts[t.key] ?? 0 })),
    [counts]
  );

  const priorityOptions = useMemo(
    () =>
      PRIORITY_FILTER_TABS.filter((t) => t.key !== "all").map((t) => ({
        value: t.key,
        label: t.label,
        count: priorityCounts[t.key] ?? 0,
      })),
    [priorityCounts]
  );

  const categoryOptions = useMemo(
    () =>
      IT_TYPE_FILTER_TABS.filter((t) => t.key !== "all").map((t) => ({
        value: t.key,
        label: t.label,
        count: typeCounts[t.key] ?? 0,
      })),
    [typeCounts]
  );

  const requesterOptions = useMemo(() => {
    const byName = new Map();
    for (const t of Array.isArray(tickets) ? tickets : []) {
      const name = String(t.user_name || "").trim();
      if (!name) continue;
      byName.set(name, (byName.get(name) || 0) + 1);
    }
    return [...byName.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ value: name, label: name, count }));
  }, [tickets]);

  const assigneeOptions = useMemo(() => {
    const byName = new Map();
    for (const t of Array.isArray(tickets) ? tickets : []) {
      const name = String(t.assignee_name || "").trim();
      if (!name) continue;
      byName.set(name, (byName.get(name) || 0) + 1);
    }
    return [...byName.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ value: name, label: name, count }));
  }, [tickets]);

  return (
    <section className="card no-title-underline min-w-0 overflow-hidden p-0 shadow-lg ring-1 ring-slate-200/80 dark:ring-white/10">
      <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white">
        <div className="relative flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="it-ticket-board-header min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                {isIT || isAdmin ? "IT Ticket Board" : "Your tickets"}
              </h2>
              {!(isIT || isAdmin) ? (
                <p className="mt-0.5 text-xs text-white/75">Track the status of your submitted requests.</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <StatPill label="Total" value={counts.all} accent="bg-white/15 ring-1 ring-white/20" />
              <StatPill label="Open" value={counts.open} accent="bg-[#A7D344] text-[#0a0a0a]" />
              <StatPill label="In progress" value={counts.in_progress} accent="bg-amber-300 text-amber-950" />
              <StatPill label="Done" value={counts.closed} accent="bg-emerald-300 text-emerald-950" />
            </div>
          </div>

          {!isDefaultView ? (
            <div className="flex items-center gap-2 border-t border-white/15 pt-3 text-xs">
              <span className="text-white/70">
                {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
              </span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
              >
                Clear all
              </button>
            </div>
          ) : null}

          {/* Mobile has no table header row to attach column filters to, so
              the same filter state gets a collapsible panel here instead. */}
          <div className="border-t border-white/15 pt-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .4.8L10 8.5V13a.5.5 0 0 1-.74.44l-2-1.1a.5.5 0 0 1-.26-.44V8.5L1.6 2.8a.5.5 0 0 1-.1-.3Z" />
              </svg>
              Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-[#0B3EAF]">
                  {activeFilterCount}
                </span>
              ) : null}
              <span className={`text-[9px] transition ${mobileFiltersOpen ? "rotate-180" : ""}`} aria-hidden>
                ▾
              </span>
            </button>

            {mobileFiltersOpen ? (
              <div className="mt-3 grid grid-cols-2 gap-4 rounded-lg bg-white p-3 text-slate-900 dark:bg-[#1a1a1a] dark:text-slate-100">
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</p>
                  <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Priority</p>
                  <CheckboxFilterContent options={priorityOptions} selected={priorityFilter} onChange={setPriorityFilter} />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</p>
                  <CheckboxFilterContent options={categoryOptions} selected={categoryFilter} onChange={setCategoryFilter} />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Submitted</p>
                  <RadioFilterContent
                    name="it-ticket-submitted-mobile"
                    options={SUBMITTED_RANGE_OPTIONS}
                    value={submittedFilter}
                    onChange={setSubmittedFilter}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Requester</p>
                  <CheckboxFilterContent options={requesterOptions} selected={requesterFilter} onChange={setRequesterFilter} searchable />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assigned to</p>
                  <CheckboxFilterContent options={assigneeOptions} selected={assigneeFilter} onChange={setAssigneeFilter} searchable />
                </div>
                <div className="col-span-2">
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search issue</p>
                  <TextFilterContent value={issueQuery} onChange={setIssueQuery} placeholder="Ticket #, title, or description…" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 px-6 py-16">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
          <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading tickets…</p>
        </div>
      ) : (
        <>
          {/* ── Mobile card list (< md) ──────────────────────────────── */}
          <div className="md:hidden divide-y divide-slate-200/80 dark:divide-white/10">
            {filtered.length === 0 ? (
              <div className="mx-3 my-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {counts.all === 0 ? "No tickets yet" : "Nothing in this filter"}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {counts.all === 0
                    ? "Submit a request using the form below."
                    : "Try adjusting the filters above."}
                </p>
              </div>
            ) : (
              filtered.map((t, rowIdx) => {
              const typeLabel = issueTypeFromTicketTitle(t.title);
              const issueName = titleWithoutTypePrefix(t.title);
              const attCount = parseTicketAttachments(t).length;
              const expanded = expandedId === t.id;
              const canEdit = canUserEditTicket(t, currentUser, { isIT, isAdmin });
              const hasRowActions = isIT || isAdmin || canEdit;
              return (
                <Fragment key={t.id}>
                  <div className={`${bodyColBg("issue", rowIdx)} px-3 py-3`}>
                    <div className="flex items-start gap-2">
                      {/* ID + Notes pill */}
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <button
                          type="button"
                          className={["inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded text-[10px] font-bold tabular-nums transition",
                            expanded
                              ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                              : "bg-slate-100 text-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:bg-white/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]",
                          ].join(" ")}
                          onClick={() => setExpandedId(expanded ? null : t.id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? `Hide ticket ${t.id}` : `View ticket ${t.id}`}
                        >
                          <span>{t.id}</span>
                          <span className={["text-[9px] leading-none", expanded ? "rotate-180" : ""].join(" ")} aria-hidden>▾</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : t.id)}
                          className={["relative inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide transition",
                            expanded
                              ? "bg-[#A7D344]/20 text-[#3a6600] dark:bg-[#A7D344]/25 dark:text-[#A7D344]"
                              : "bg-[#A7D344]/15 text-[#3a6600] hover:bg-[#A7D344]/30 dark:bg-[#A7D344]/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/25",
                          ].join(" ")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5" aria-hidden>
                            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H9.707l-2.147 2.146A.5.5 0 0 1 7 12.793V11H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" />
                          </svg>
                          Notes
                          {unreadCounts[t.id] > 0 ? (
                            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[7px] font-bold leading-none text-white">
                              {unreadCounts[t.id] > 9 ? "9+" : unreadCounts[t.id]}
                            </span>
                          ) : null}
                        </button>
                      </div>

                      {/* Issue + badges + requester */}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-900 dark:text-white">{issueName}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className={`${BADGE} ${statusBadgeClass(t.status)}`}>{statusBadgeLabel(t.status)}</span>
                          <span className={`${BADGE} ${priorityBadgeClass(t.priority)}`}>{priorityBadgeLabel(t.priority)}</span>
                          {typeLabel ? <span className={`${BADGE} ${issueTypeBadgeClass(typeLabel)}`}>{typeLabel}</span> : null}
                          {attCount > 0 ? (
                            <span className="inline-flex rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                              {attCount} file{attCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <RequesterCell ticket={t} currentUser={currentUser} compact />
                          {t.assignee_name?.trim() ? (
                            <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400" title={t.assignee_name}>
                              → {firstNameOnly(t.assignee_name)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Actions */}
                      {hasRowActions ? (
                        <div className="shrink-0">
                          <TicketRowActions
                            ticket={t}
                            canEdit={canEdit}
                            isIT={isIT}
                            isAdmin={isAdmin}
                            deletingId={deletingId}
                            onEdit={onEdit}
                            onStatusChange={onStatusChange}
                            onDelete={onDelete}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Mobile expanded panel */}
                  {expanded ? (
                    <div className={`${bodyColBg("issue", rowIdx)} border-t border-slate-200/60 px-3 py-3 dark:border-slate-600/40`}>
                      <div className="rounded-lg border border-[#0B3EAF]/20 border-l-4 border-l-[#0B3EAF] bg-[#c2d9f2] px-3 py-3 text-xs shadow-sm dark:border-[#5b8fd9]/30 dark:border-l-[#5b8fd9] dark:bg-[#111c2e]/80">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Requester</div>
                            <div className="mt-2"><RequesterCell ticket={t} currentUser={currentUser} /></div>
                            {(isIT || isAdmin) && t.user_email ? (
                              <a href={`mailto:${t.user_email}`} className="mt-2 inline-block text-sm font-medium text-[#0B3EAF] underline-offset-2 hover:underline dark:text-[#A7D344]">{t.user_email}</a>
                            ) : null}
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Description</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">{t.description?.trim() || "—"}</div>
                          </div>
                        </div>
                        {parseTicketAttachments(t).length > 0 ? (
                          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Attachments</div>
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {parseTicketAttachments(t).map((a, i) => (
                                <li key={`${t.id}-att-${i}`}>
                                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex rounded-md border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-xs font-semibold text-[#0B3EAF] shadow-sm transition hover:border-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:border-[#A7D344]/30 dark:bg-[#1a1a1a] dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]">
                                    {a.name || `File ${i + 1}`}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <TicketChatThread ticketId={t.id} currentUser={currentUser} />
                      </div>
                    </div>
                  ) : null}
                </Fragment>
              );
              })
            )}
          </div>

          {/* ── Desktop / tablet table (md and above) ───────────────── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse border border-slate-200 text-xs dark:border-slate-600/50">
              <thead className="sticky top-0 z-10 border-b-2 border-slate-300 backdrop-blur-sm dark:border-slate-600">
                <tr>
                  <th className={thClass("id", "text-center w-[8%]")}>
                    <button
                      type="button"
                      onClick={() => setIdSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case text-[9px] font-bold uppercase tracking-wide text-slate-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                      title={idSortDir === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
                    >
                      <span>ID</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 12 8"
                        fill="none"
                        className={`h-2 w-2.5 shrink-0 opacity-70 transition-transform ${idSortDir === "asc" ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </th>
                  <th className={thClass("requester", "w-[12%]")}>
                    <ColumnFilterHeader label="Requester" active={requesterFilter.size > 0}>
                      <CheckboxFilterContent options={requesterOptions} selected={requesterFilter} onChange={setRequesterFilter} searchable />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("issue", "w-[25%]")}>
                    <ColumnFilterHeader label="Issue" active={issueQuery.trim() !== ""}>
                      <TextFilterContent value={issueQuery} onChange={setIssueQuery} placeholder="Contains…" />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("status", "w-[9%]")}>
                    <ColumnFilterHeader label="Status" active={statusFilter.size > 0}>
                      <CheckboxFilterContent options={statusOptions} selected={statusFilter} onChange={setStatusFilter} />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("priority", "w-[9%]")}>
                    <ColumnFilterHeader label="Priority" active={priorityFilter.size > 0}>
                      <CheckboxFilterContent options={priorityOptions} selected={priorityFilter} onChange={setPriorityFilter} />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("category", "hidden lg:table-cell w-[9%]")}>
                    <ColumnFilterHeader label="Category" active={categoryFilter.size > 0}>
                      <CheckboxFilterContent options={categoryOptions} selected={categoryFilter} onChange={setCategoryFilter} />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("assignee", "w-[11%]")}>
                    <ColumnFilterHeader label="Assignee" active={assigneeFilter.size > 0}>
                      <CheckboxFilterContent options={assigneeOptions} selected={assigneeFilter} onChange={setAssigneeFilter} searchable />
                    </ColumnFilterHeader>
                  </th>
                  <th className={thClass("submitted", "hidden lg:table-cell w-[10%]", !showActionsColumn)}>
                    <ColumnFilterHeader label="Submitted" align="right" active={submittedFilter !== "all"}>
                      <RadioFilterContent name="it-ticket-submitted-desktop" options={SUBMITTED_RANGE_OPTIONS} value={submittedFilter} onChange={setSubmittedFilter} />
                    </ColumnFilterHeader>
                  </th>
                  {showActionsColumn ? <th className={thClass("actions", "text-center w-[7%]", true)}>Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={showActionsColumn ? 9 : 8} className="px-6 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">
                        {counts.all === 0 ? "No tickets yet" : "Nothing in this filter"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {counts.all === 0
                          ? "Submit a request using the form below."
                          : "Try adjusting the filters above."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((t, rowIdx) => {
                  const typeLabel = issueTypeFromTicketTitle(t.title);
                  const issueName = titleWithoutTypePrefix(t.title);
                  const attCount = parseTicketAttachments(t).length;
                  const expanded = expandedId === t.id;
                  const canEdit = canUserEditTicket(t, currentUser, { isIT, isAdmin });
                  const hasRowActions = isIT || isAdmin || canEdit;
                  const lastCol = !showActionsColumn;
                  return (
                    <Fragment key={t.id}>
                      <tr className="group border-b border-slate-200/80 transition-colors dark:border-slate-700/50">
                        <td className={tdClass("id", rowIdx, "text-center")}>
                          <div className="inline-flex flex-col items-center gap-1">
                            <button
                              type="button"
                              className={["inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded text-[10px] font-bold tabular-nums transition",
                                expanded
                                  ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                                  : "bg-slate-100 text-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:bg-white/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]",
                              ].join(" ")}
                              onClick={() => setExpandedId(expanded ? null : t.id)}
                              title={expanded ? "Collapse" : "View details & notes"}
                              aria-expanded={expanded}
                              aria-label={expanded ? `Hide details for ticket ${t.id}` : `View details for ticket ${t.id}`}
                            >
                              <span>{t.id}</span>
                              <span className={["text-[9px] leading-none", expanded ? "rotate-180" : ""].join(" ")} aria-hidden>▾</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : t.id)}
                              title="Open notes"
                              className={["relative inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide transition",
                                expanded
                                  ? "bg-[#A7D344]/20 text-[#3a6600] dark:bg-[#A7D344]/25 dark:text-[#A7D344]"
                                  : "bg-[#A7D344]/15 text-[#3a6600] hover:bg-[#A7D344]/30 dark:bg-[#A7D344]/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/25",
                              ].join(" ")}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5" aria-hidden>
                                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H9.707l-2.147 2.146A.5.5 0 0 1 7 12.793V11H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" />
                              </svg>
                              Notes
                              {unreadCounts[t.id] > 0 ? (
                                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[7px] font-bold leading-none text-white">
                                  {unreadCounts[t.id] > 9 ? "9+" : unreadCounts[t.id]}
                                </span>
                              ) : null}
                            </button>
                          </div>
                        </td>
                        <td className={tdClass("requester", rowIdx, "overflow-hidden")}>
                          <RequesterCell ticket={t} currentUser={currentUser} compact />
                        </td>
                        <td className={tdClass("issue", rowIdx, "align-top")}>
                          <div className="min-w-0 overflow-hidden">
                            <div className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-900 dark:text-white" title={issueName}>{issueName}</div>
                            {attCount > 0 ? (
                              <div className="mt-0.5 inline-flex rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                                {attCount} attachment{attCount === 1 ? "" : "s"}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className={tdClass("status", rowIdx)}>
                          <span className={`${BADGE} ${statusBadgeClass(t.status)}`}>{statusBadgeLabel(t.status)}</span>
                        </td>
                        <td className={tdClass("priority", rowIdx)}>
                          <span className={`${BADGE} ${priorityBadgeClass(t.priority)}`}>{priorityBadgeLabel(t.priority)}</span>
                        </td>
                        <td className={`${tdClass("category", rowIdx)} hidden lg:table-cell`}>
                          {typeLabel ? (
                            <span className={`${BADGE} truncate ${issueTypeBadgeClass(typeLabel)}`} title={typeLabel}>{typeLabel}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={tdClass("assignee", rowIdx, "overflow-hidden")}>
                          <span className="block truncate text-[11px] font-medium text-slate-800 dark:text-slate-200" title={t.assignee_name?.trim() || ""}>
                            {t.assignee_name?.trim() ? firstNameOnly(t.assignee_name) : "—"}
                          </span>
                        </td>
                        <td className={`${tdClass("submitted", rowIdx, "", lastCol)} hidden lg:table-cell`}>
                          <div className="tabular-nums">
                            <div className="text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-200">{formatSubmittedDate(t.created_at)}</div>
                            <div className="text-[9px] leading-tight text-slate-500 dark:text-slate-400">{formatSubmittedTime(t.created_at)}</div>
                          </div>
                        </td>
                        {showActionsColumn ? (
                          <td className={tdClass("actions", rowIdx, "", true)}>
                            {hasRowActions ? (
                              <div className="flex justify-center">
                                <TicketRowActions
                                  ticket={t}
                                  canEdit={canEdit}
                                  isIT={isIT}
                                  isAdmin={isAdmin}
                                  deletingId={deletingId}
                                  onEdit={onEdit}
                                  onStatusChange={onStatusChange}
                                  onDelete={onDelete}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                      {expanded ? (
                        <tr className="group border-b border-[#0B3EAF]/20 dark:border-slate-700/50">
                          <td
                            colSpan={99}
                            className={`px-3 py-3 ${bodyColBg("issue", rowIdx)} border-t border-slate-200/60 dark:border-slate-600/40`}
                          >
                            <div className="rounded-lg border border-[#0B3EAF]/20 border-l-4 border-l-[#0B3EAF] bg-[#c2d9f2] px-3 py-3 text-xs shadow-sm dark:border-[#5b8fd9]/30 dark:border-l-[#5b8fd9] dark:bg-[#111c2e]/80">
                              <div className="grid gap-5 sm:grid-cols-2">
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Requester</div>
                                  <div className="mt-2"><RequesterCell ticket={t} currentUser={currentUser} /></div>
                                  {(isIT || isAdmin) && t.user_email ? (
                                    <a href={`mailto:${t.user_email}`} className="mt-2 inline-block text-sm font-medium text-[#0B3EAF] underline-offset-2 hover:underline dark:text-[#A7D344]">{t.user_email}</a>
                                  ) : null}
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Description</div>
                                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">{t.description?.trim() || "—"}</div>
                                </div>
                              </div>
                              {parseTicketAttachments(t).length > 0 ? (
                                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">Attachments</div>
                                  <ul className="mt-2 flex flex-wrap gap-2">
                                    {parseTicketAttachments(t).map((a, i) => (
                                      <li key={`${t.id}-att-${i}`}>
                                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex rounded-md border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-xs font-semibold text-[#0B3EAF] shadow-sm transition hover:border-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:border-[#A7D344]/30 dark:bg-[#1a1a1a] dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]">
                                          {a.name || `File ${i + 1}`}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <TicketChatThread ticketId={t.id} currentUser={currentUser} />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
