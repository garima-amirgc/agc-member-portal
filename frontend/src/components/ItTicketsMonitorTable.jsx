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

const TH =
  "px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const TD = "px-4 py-3.5 align-middle";
const BADGE =
  "inline-flex min-w-[5.5rem] items-center justify-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide";

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

function formatSubmittedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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
    <div className="flex min-w-0 items-center gap-2.5">
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
      canUserEditTicket(t, currentUser?.id)
    );
  }, [tickets, isIT, isAdmin, currentUser?.id]);

  const colCount = showActionsColumn ? 10 : 9;

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
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[3.25rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[14rem]" />
              <col />
              <col className="w-[10.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[7.5rem]" />
              {showActionsColumn ? <col className="w-[11.5rem]" /> : null}
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm dark:border-white/10 dark:bg-[#1a1a1a]/95">
              <tr>
                <th className={`${TH} text-center`}>ID</th>
                <th className={TH}>Status</th>
                <th className={TH}>Priority</th>
                <th className={TH}>Category</th>
                <th className={TH}>Issue</th>
                <th className={TH}>Description</th>
                <th className={TH}>Requester</th>
                <th className={TH}>Assignee</th>
                <th className={TH}>Submitted</th>
                {showActionsColumn ? <th className={`${TH} text-right`}>Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((t) => {
                const typeLabel = issueTypeFromTicketTitle(t.title);
                const issueName = titleWithoutTypePrefix(t.title);
                const attCount = parseTicketAttachments(t).length;
                const expanded = expandedId === t.id;
                const canEdit = canUserEditTicket(t, currentUser?.id);
                const hasRowActions = isIT || isAdmin || canEdit;
                return (
                  <Fragment key={t.id}>
                    <tr className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                      <td className={`${TD} text-center`}>
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
                      <td className={TD}>
                        <span className={`${BADGE} ${statusBadgeClass(t.status)}`}>
                          {statusBadgeLabel(t.status)}
                        </span>
                      </td>
                      <td className={TD}>
                        <span className={`${BADGE} ${priorityBadgeClass(t.priority)}`}>
                          {priorityBadgeLabel(t.priority)}
                        </span>
                      </td>
                      <td className={TD}>
                        {typeLabel ? (
                          <span className={`${BADGE} ${issueTypeBadgeClass(typeLabel)}`}>{typeLabel}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`${TD} align-top`}>
                        <div className="min-w-0">
                          <div className="font-semibold leading-snug text-slate-900 dark:text-white">{issueName}</div>
                          {attCount > 0 ? (
                            <div className="mt-1 inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                              {attCount} attachment{attCount === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={`${TD} align-top`}>
                        <span className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {t.description?.trim() || "—"}
                        </span>
                      </td>
                      <td className={TD}>
                        <RequesterCell ticket={t} currentUser={currentUser} compact />
                      </td>
                      <td className={TD}>
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {t.assignee_name?.trim() || "—"}
                        </span>
                      </td>
                      <td className={TD}>
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
                        <td className={`${TD} text-right`}>
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
                      <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        <td colSpan={colCount} className="px-4 py-4">
                          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#141414]">
                            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Ticket #{t.id}
                              </span>
                              <span className={`${BADGE} ${statusBadgeClass(t.status)}`}>
                                {statusBadgeLabel(t.status)}
                              </span>
                              <span className={`${BADGE} ${priorityBadgeClass(t.priority)}`}>
                                {priorityBadgeLabel(t.priority)}
                              </span>
                              {typeLabel ? (
                                <span className={`${BADGE} ${issueTypeBadgeClass(typeLabel)}`}>{typeLabel}</span>
                              ) : null}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="sm:col-span-2 lg:col-span-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Full title
                                </div>
                                <div className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                  {t.title}
                                </div>
                              </div>
                              {t.description?.trim() ? (
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Description
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                    {t.description.trim()}
                                  </div>
                                </div>
                              ) : null}
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Requester
                                </div>
                                <div className="mt-2">
                                  <RequesterCell ticket={t} currentUser={currentUser} />
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Assignee
                                </div>
                                <div className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                                  {t.assignee_name?.trim() || "Unassigned"}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Submitted
                                </div>
                                <div className="mt-1 text-sm tabular-nums text-slate-800 dark:text-slate-200">
                                  {formatSubmittedAt(t.created_at)}
                                </div>
                              </div>
                              {(isIT || isAdmin) && t.user_email ? (
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Contact
                                  </div>
                                  <div className="mt-1 text-sm">
                                    <a
                                      href={`mailto:${t.user_email}`}
                                      className="font-medium text-[#0B3EAF] underline-offset-2 hover:underline dark:text-[#A7D344]"
                                    >
                                      {t.user_email}
                                    </a>
                                  </div>
                                </div>
                              ) : null}
                              {parseTicketAttachments(t).length > 0 ? (
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Attachments
                                  </div>
                                  <ul className="mt-2 flex flex-wrap gap-2">
                                    {parseTicketAttachments(t).map((a, i) => (
                                      <li key={`${t.id}-exp-att-${i}`}>
                                        <a
                                          href={a.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-[#0B3EAF] transition hover:border-[#0B3EAF] hover:bg-[#0B3EAF] hover:text-white dark:border-white/10 dark:bg-[#1a1a1a] dark:text-[#A7D344]"
                                        >
                                          {a.name || `File ${i + 1}`}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
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
