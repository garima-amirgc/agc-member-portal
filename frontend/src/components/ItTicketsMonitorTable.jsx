import { Fragment, useEffect, useMemo, useState } from "react";
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

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Completed" },
];

const TH_BASE =
  "px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300";
const TD = "px-4 py-3.5 align-middle";
const BADGE =
  "inline-flex min-w-[5.5rem] items-center justify-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide";

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

/** Per-column soft background + row alternation (always visible, not hover-only). */
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
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = img && !imgFailed;
  const size = compact ? "h-9 w-9" : "h-10 w-10";
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2.5 overflow-hidden">
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
            <div className="flex h-full w-full items-center justify-center bg-[rgba(11,62,175,0.08)] text-[10px] font-bold text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
              {initialsFromName(name)}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</div>
        {ticket?.user_department ? (
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{ticket.user_department}</div>
        ) : null}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div
      className={`flex min-h-[3.75rem] min-w-[4.75rem] flex-col items-center justify-center rounded-lg px-3 py-2 text-center ${accent}`}
    >
      <div className="text-xl font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider opacity-90">{label}</div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Table board for monitoring IT tickets (issues, status, assignee, dates).
 */
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
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

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

  const filtered = useMemo(() => {
    let list = Array.isArray(tickets) ? [...tickets] : [];
    if (filter !== "all") list = list.filter((t) => t.status === filter);
    if (typeFilter !== "all") list = list.filter((t) => ticketMatchesIssueTypeFilter(t, typeFilter));
    return list;
  }, [tickets, filter, typeFilter]);

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

  return (
    <section className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-slate-200/80 dark:ring-white/10">
      <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] text-white">
        <div className="relative flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                {isIT || isAdmin ? "IT ticket board" : "Your tickets"}
              </h2>
              <p className="mt-1 text-sm text-white/75">
                {isIT || isAdmin
                  ? "Triage, assign, and resolve support requests."
                  : "Track the status of your submitted requests."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatPill label="Total" value={counts.all} accent="bg-white/15 ring-1 ring-white/20" />
              <StatPill label="Open" value={counts.open} accent="bg-[#A7D344] text-[#0a0a0a]" />
              <StatPill label="In progress" value={counts.in_progress} accent="bg-amber-300 text-amber-950" />
              <StatPill label="Done" value={counts.closed} accent="bg-emerald-300 text-emerald-950" />
            </div>
          </div>

          <div className="grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
            <FilterGroup label="Status">
              {IT_FILTER_TABS.map((tab) => {
                const count = counts[tab.key] ?? 0;
                const isActive = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setFilter(tab.key)}
                    className={[
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      isActive ? tab.active : tab.idle,
                    ].join(" ")}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </FilterGroup>

            <FilterGroup label="Category">
              {IT_TYPE_FILTER_TABS.map((tab) => {
                const count = typeCounts[tab.key] ?? 0;
                const isActive = typeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setTypeFilter(tab.key)}
                    className={[
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      isActive ? tab.active : tab.idle,
                    ].join(" ")}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </FilterGroup>
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
      ) : filtered.length === 0 ? (
        <div className="mx-5 my-12 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-base font-semibold text-slate-800 dark:text-white">
            {filter === "all" && typeFilter === "all" ? "No tickets yet" : "Nothing in this filter"}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {filter === "all" && typeFilter === "all"
              ? "Submit a request using the form below."
              : "Try another status or category filter above."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse border border-slate-200 text-sm dark:border-slate-600/50">
            <colgroup>
              <col style={{ width: "3.25rem" }} />
              <col style={{ width: "11.5rem" }} />
              <col style={{ width: "14rem" }} />
              <col style={{ width: "6.75rem" }} />
              <col style={{ width: "6.75rem" }} />
              <col style={{ width: "7.25rem" }} />
              <col style={{ width: "8.5rem" }} />
              <col style={{ width: "7.5rem" }} />
              {showActionsColumn ? <col style={{ width: "11.5rem" }} /> : null}
            </colgroup>
            <thead className="sticky top-0 z-10 border-b-2 border-slate-300 backdrop-blur-sm dark:border-slate-600">
              <tr>
                <th className={thClass("id", "text-center")}>ID</th>
                <th className={thClass("requester")}>Requester</th>
                <th className={thClass("issue")}>Issue</th>
                <th className={thClass("status")}>Status</th>
                <th className={thClass("priority")}>Priority</th>
                <th className={thClass("category")}>Category</th>
                <th className={thClass("assignee")}>Assignee</th>
                <th className={thClass("submitted", "", !showActionsColumn)}>Submitted</th>
                {showActionsColumn ? <th className={thClass("actions", "text-right", true)}>Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {filtered.map((t, rowIdx) => {
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
                        <button
                          type="button"
                          className={[
                            "inline-flex h-8 min-w-[2rem] items-center justify-center gap-0.5 rounded-md text-xs font-bold tabular-nums transition",
                            expanded
                              ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                              : "bg-slate-100 text-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:bg-white/10 dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]",
                          ].join(" ")}
                          onClick={() => setExpandedId(expanded ? null : t.id)}
                          title={expanded ? "Hide details" : "View details"}
                          aria-expanded={expanded}
                          aria-label={expanded ? `Hide details for ticket ${t.id}` : `View details for ticket ${t.id}`}
                        >
                          <span>{t.id}</span>
                          <span
                            className={["text-[9px] leading-none", expanded ? "rotate-180" : ""].join(" ")}
                            aria-hidden
                          >
                            ▾
                          </span>
                        </button>
                      </td>
                      <td className={tdClass("requester", rowIdx, "max-w-[11.5rem] overflow-hidden")}>
                        <RequesterCell ticket={t} currentUser={currentUser} compact />
                      </td>
                      <td className={tdClass("issue", rowIdx, "max-w-[14rem] align-top")}>
                        <div className="min-w-0 overflow-hidden">
                          <div className="truncate font-semibold text-slate-900 dark:text-white" title={issueName}>
                            {issueName}
                          </div>
                          {attCount > 0 ? (
                            <div className="mt-1 inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                              {attCount} attachment{attCount === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={tdClass("status", rowIdx)}>
                        <span className={`${BADGE} ${statusBadgeClass(t.status)}`}>
                          {statusBadgeLabel(t.status)}
                        </span>
                      </td>
                      <td className={tdClass("priority", rowIdx)}>
                        <span className={`${BADGE} ${priorityBadgeClass(t.priority)}`}>
                          {priorityBadgeLabel(t.priority)}
                        </span>
                      </td>
                      <td className={tdClass("category", rowIdx)}>
                        {typeLabel ? (
                          <span className={`${BADGE} ${issueTypeBadgeClass(typeLabel)}`}>{typeLabel}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={tdClass("assignee", rowIdx, "max-w-[8.5rem] overflow-hidden")}>
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {t.assignee_name?.trim() || "—"}
                        </span>
                      </td>
                      <td className={tdClass("submitted", rowIdx, "", lastCol)}>
                        <div className="tabular-nums">
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {formatSubmittedDate(t.created_at)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatSubmittedTime(t.created_at)}
                          </div>
                        </div>
                      </td>
                      {showActionsColumn ? (
                        <td className={tdClass("actions", rowIdx, "text-right", true)}>
                          {hasRowActions ? (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="h-8 whitespace-nowrap rounded-md border border-[#0B3EAF]/25 bg-white px-2.5 text-[11px] font-semibold text-[#0B3EAF] transition hover:bg-[#0B3EAF] hover:text-white dark:border-[#A7D344]/30 dark:bg-[#1a1a1a] dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]"
                                  onClick={() => onEdit?.(t)}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {isIT ? (
                                <>
                                  <select
                                    className="h-8 max-w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 outline-none focus:border-[#0B3EAF] focus:ring-1 focus:ring-[#0B3EAF]/30 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-200"
                                    value={t.status}
                                    onChange={(e) => onStatusChange(t.id, e.target.value)}
                                    aria-label={`Status for ticket ${t.id}`}
                                  >
                                    {STATUS_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                  {t.status !== "closed" ? (
                                    <button
                                      type="button"
                                      className="h-8 whitespace-nowrap rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                                      onClick={() => onStatusChange(t.id, "closed")}
                                    >
                                      Done
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  disabled={deletingId === t.id}
                                  className="h-8 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                                  onClick={() => onDelete?.(t.id)}
                                >
                                  {deletingId === t.id ? "Deleting…" : "Delete"}
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {expanded ? (
                      <tr className="group border-b border-slate-200/80 dark:border-slate-700/50">
                        <td
                          colSpan={colCount}
                          className={`px-4 py-4 ${bodyColBg("issue", rowIdx)} border-t border-slate-200/60 dark:border-slate-600/40`}
                        >
                          <div className="rounded-lg border border-slate-200 border-l-4 border-l-[#0B3EAF] bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:border-l-[#5b8fd9] dark:bg-[#1c1c1c]">
                            <div className="grid gap-5 sm:grid-cols-2">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">
                                  Requester
                                </div>
                                <div className="mt-2">
                                  <RequesterCell ticket={t} currentUser={currentUser} />
                                </div>
                                {(isIT || isAdmin) && t.user_email ? (
                                  <a
                                    href={`mailto:${t.user_email}`}
                                    className="mt-2 inline-block text-sm font-medium text-[#0B3EAF] underline-offset-2 hover:underline dark:text-[#A7D344]"
                                  >
                                    {t.user_email}
                                  </a>
                                ) : null}
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">
                                  Description
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                  {t.description?.trim() || "—"}
                                </div>
                              </div>
                            </div>
                            {parseTicketAttachments(t).length > 0 ? (
                              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">
                                  Attachments
                                </div>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {parseTicketAttachments(t).map((a, i) => (
                                    <li key={`${t.id}-att-${i}`}>
                                      <a
                                        href={a.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex rounded-md border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-xs font-semibold text-[#0B3EAF] shadow-sm transition hover:border-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:border-[#A7D344]/30 dark:bg-[#1a1a1a] dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]"
                                      >
                                        {a.name || `File ${i + 1}`}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
