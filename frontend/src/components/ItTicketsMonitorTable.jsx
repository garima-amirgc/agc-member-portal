import { Fragment, useMemo, useState } from "react";
import { ticketRequesterPhotoUrl } from "../utils/ticketUserAvatar";
import {
  IT_FILTER_TABS,
  IT_TYPE_FILTER_TABS,
  issueTypeBadgeClass,
  issueTypeFromTicketTitle,
  ticketMatchesIssueTypeFilter,
} from "../utils/itTicketStyles";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Completed" },
];

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

function RequesterCell({ ticket, currentUser }) {
  const img = ticketRequesterPhotoUrl(ticket, currentUser);
  const name = ticket?.user_name || "—";
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = img && !imgFailed;
  return (
    <div className="flex min-w-[160px] items-center gap-3">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#0B3EAF] to-[#1a5fd4] p-[2px] shadow-sm">
        <div className="h-full w-full overflow-hidden rounded-full bg-white dark:bg-[#141414]">
          {showImg ? (
            <img
              src={img}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[rgba(11,62,175,0.08)] text-xs font-bold text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
              {initialsFromName(name)}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{name}</div>
        {ticket?.user_department ? (
          <div className="truncate text-xs font-medium text-[#0B3EAF]/80 dark:text-[#A7D344]/90">
            {ticket.user_department}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div
      className={`flex min-h-[4.25rem] flex-col items-center justify-center rounded-xl px-3 py-2.5 text-center shadow-sm ring-1 ring-white/25 sm:min-w-[5.25rem] sm:px-4 ${accent}`}
    >
      <div className="text-xl font-bold leading-none tabular-nums sm:text-2xl">{value}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-90 sm:text-[10px]">{label}</div>
    </div>
  );
}

/**
 * Table board for monitoring IT tickets (issues, status, assignee, dates).
 */
export default function ItTicketsMonitorTable({ tickets, loading, isIT, onStatusChange, currentUser }) {
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

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
    <section className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-[rgba(11,62,175,0.08)] dark:ring-[rgba(167,211,68,0.12)]">
      <div className="it-ticket-board-header relative overflow-hidden border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4]">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#A7D344]/25 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-32 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
            <h2 className="shrink-0 text-2xl font-bold tracking-tight sm:text-[1.65rem]">
              {isIT ? "IT ticket board" : "Your tickets"}
            </h2>

            <div className="grid w-full grid-cols-4 gap-2 sm:gap-3 md:w-auto md:shrink-0">
              <StatPill label="Total" value={counts.all} accent="bg-white/20 text-white" />
              <StatPill label="Open" value={counts.open} accent="bg-[#A7D344] text-[#0a0a0a]" />
              <StatPill label="In progress" value={counts.in_progress} accent="bg-amber-300 text-amber-950" />
              <StatPill label="Done" value={counts.closed} accent="bg-emerald-300 text-emerald-950" />
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/20 pt-5">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter tickets by status">
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
                      "min-h-[2.25rem] rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm",
                      isActive ? tab.active : tab.idle,
                    ].join(" ")}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter tickets by issue type">
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
                      "min-h-[2.25rem] rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm",
                      isActive ? tab.active : tab.idle,
                    ].join(" ")}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 px-6 py-14">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#A7D344] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0B3EAF] [animation-delay:300ms] dark:bg-[#A7D344]" />
          <p className="ml-2 text-sm font-medium text-slate-600 dark:text-slate-300">Loading tickets…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-5 my-10 rounded-2xl border-2 border-dashed border-[rgba(11,62,175,0.2)] bg-[rgba(11,62,175,0.04)] px-6 py-12 text-center dark:border-[rgba(167,211,68,0.25)] dark:bg-[rgba(167,211,68,0.06)]">
          <p className="text-base font-semibold text-[#0B3EAF] dark:text-[#A7D344]">
            {filter === "all" && typeFilter === "all" ? "No tickets yet" : "Nothing in this filter"}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {filter === "all" && typeFilter === "all"
              ? "Submit a request using the form below."
              : "Try another status or issue type filter above."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-2 pt-1 sm:px-3">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-[rgba(11,62,175,0.06)] text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:from-[#1a1a1a] dark:to-[rgba(11,62,175,0.15)] dark:text-[#A7D344]">
                <th className="rounded-tl-xl px-5 py-4">#</th>
                <th className="px-5 py-4">Submitted by</th>
                <th className="px-5 py-4">Issue</th>
                <th className="px-5 py-4">Description</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Submitted</th>
                <th className="px-5 py-4">Assigned to</th>
                {isIT ? <th className="rounded-tr-xl px-5 py-4 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, rowIdx) => {
                const typeLabel = issueTypeFromTicketTitle(t.title);
                const issueName = titleWithoutTypePrefix(t.title);
                const attCount = parseTicketAttachments(t).length;
                const expanded = expandedId === t.id;
                const zebra = rowIdx % 2 === 0 ? "bg-white dark:bg-[#141414]" : "bg-slate-50/80 dark:bg-[#181818]";
                return (
                  <Fragment key={t.id}>
                    <tr
                      className={`border-b border-slate-100 transition hover:bg-[rgba(11,62,175,0.05)] dark:border-white/5 dark:hover:bg-[rgba(167,211,68,0.06)] ${zebra}`}
                    >
                      <td className="px-5 py-4 align-top">
                        <button
                          type="button"
                          className="inline-flex min-h-[2rem] min-w-[2rem] items-center justify-center rounded-lg bg-[rgba(11,62,175,0.1)] px-2 font-bold text-[#0B3EAF] transition hover:bg-[#0B3EAF] hover:text-white dark:bg-[rgba(167,211,68,0.15)] dark:text-[#A7D344] dark:hover:bg-[#A7D344] dark:hover:text-[#0a0a0a]"
                          onClick={() => setExpandedId(expanded ? null : t.id)}
                          title="Show details"
                        >
                          {t.id}
                        </button>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <RequesterCell ticket={t} currentUser={currentUser} />
                      </td>
                      <td className="max-w-[220px] px-5 py-4 align-top">
                        <div className="font-bold text-slate-900 dark:text-white">{issueName}</div>
                        {attCount > 0 ? (
                          <div className="mt-1.5 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                            {attCount} file{attCount === 1 ? "" : "s"}
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-[240px] px-5 py-4 align-top text-slate-700 dark:text-slate-300">
                        <span className={expanded ? "whitespace-pre-wrap leading-relaxed" : "line-clamp-2"}>
                          {t.description?.trim() || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(t.status)}`}
                        >
                          {statusBadgeLabel(t.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {typeLabel ? (
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${issueTypeBadgeClass(typeLabel)}`}
                          >
                            {typeLabel}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 align-top text-xs font-medium text-slate-600 dark:text-slate-400">
                        {formatSubmittedAt(t.created_at)}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                          {t.assignee_name?.trim() || "—"}
                        </span>
                      </td>
                      {isIT ? (
                        <td className="px-5 py-4 align-top text-right">
                          <div className="flex flex-col items-end gap-2">
                            <select
                              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#0B3EAF] shadow-sm outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-[#A7D344]"
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
                                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600"
                                onClick={() => onStatusChange(t.id, "closed")}
                              >
                                Mark completed
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {expanded ? (
                      <tr className="border-b border-slate-100 dark:border-white/5">
                        <td colSpan={isIT ? 9 : 8} className="px-5 py-4">
                          <div className="rounded-xl border-l-4 border-[#A7D344] bg-gradient-to-r from-[rgba(11,62,175,0.06)] to-transparent px-5 py-4 dark:from-[rgba(167,211,68,0.08)]">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                                  Full title
                                </div>
                                <div className="mt-1.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                  {t.title}
                                </div>
                              </div>
                              {isIT && t.user_email ? (
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                                    Contact
                                  </div>
                                  <div className="mt-1.5 text-sm text-slate-800 dark:text-slate-200">{t.user_email}</div>
                                </div>
                              ) : null}
                              {parseTicketAttachments(t).length > 0 ? (
                                <div className="sm:col-span-2">
                                  <div className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                                    Attachments
                                  </div>
                                  <ul className="mt-2 flex flex-wrap gap-2">
                                    {parseTicketAttachments(t).map((a, i) => (
                                      <li key={`${t.id}-exp-att-${i}`}>
                                        <a
                                          href={a.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0B3EAF] ring-1 ring-[#0B3EAF]/20 transition hover:bg-[#0B3EAF] hover:text-white dark:bg-[#1a1a1a] dark:text-[#A7D344] dark:ring-[#A7D344]/30"
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
