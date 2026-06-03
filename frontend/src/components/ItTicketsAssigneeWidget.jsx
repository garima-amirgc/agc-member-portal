import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { friendlyErrorMessage } from "../services/friendlyError";
import { ticketRequesterPhotoUrl } from "../utils/ticketUserAvatar";
import { issueTypeBadgeClass } from "../utils/itTicketStyles";

function formatAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function initialsFromName(name) {
  const source = String(name || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "U";
}

function issueTypeFromTitle(title) {
  const raw = String(title || "");
  const m = raw.match(/^\s*\[([^\]]+)\]\s*/);
  return (m?.[1] || "").trim();
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

export default function ItTicketsAssigneeWidget() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);
  const [submissionModalTicket, setSubmissionModalTicket] = useState(null);
  const seenActiveTicketIdsRef = useRef(new Set());
  const didInitRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/tickets/assigned-to-me")
      .then((r) => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-it-tickets-changed", onRefresh);
    return () => window.removeEventListener("agc-it-tickets-changed", onRefresh);
  }, [load]);

  // Poll in case another user submits while this tab is open.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const active = tickets.filter((t) => t.status !== "closed");
    if (!didInitRef.current) {
      seenActiveTicketIdsRef.current = new Set(active.map((t) => t.id));
      didInitRef.current = true;
      return;
    }

    const unseen = active.find((t) => !seenActiveTicketIdsRef.current.has(t.id));
    if (unseen && !submissionModalTicket) {
      setSubmissionModalTicket(unseen);
    }
    for (const t of active) seenActiveTicketIdsRef.current.add(t.id);
  }, [tickets, submissionModalTicket]);

  const markCompleted = async (id) => {
    setCompletingId(id);
    try {
      await api.patch(`/tickets/${id}`, { status: "closed" });
      await load();
      window.dispatchEvent(new Event("agc-it-tickets-changed"));
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not update ticket."));
    } finally {
      setCompletingId(null);
    }
  };

  const active = tickets.filter((t) => t.status !== "closed");
  const submissionPhoto = submissionModalTicket
    ? ticketRequesterPhotoUrl(submissionModalTicket, user)
    : "";

  return (
    <section className="card no-title-underline overflow-hidden p-0 ring-1 ring-[rgba(11,62,175,0.1)] dark:ring-[rgba(167,211,68,0.15)]">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-[#0B3EAF] to-[#1a5fd4] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-bold text-white">Assigned to you</h2>
          <p className="mt-1 text-sm text-white/85">
            New tickets also appear on{" "}
            <Link
              to="/it-tickets"
              className="font-bold text-[#A7D344] underline decoration-2 underline-offset-2"
            >
              IT Ticket
            </Link>
            .
          </p>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full bg-[#A7D344] px-4 py-1.5 text-xs font-bold text-[#0a0a0a] shadow-sm">
            {active.length} open
          </span>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">No tickets are assigned to you yet.</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No active assignments. All tickets assigned to you are completed.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((t) => {
            const photo = ticketRequesterPhotoUrl(t, user);
            const typeLabel = issueTypeFromTitle(t.title);
            return (
            <li
              key={t.id}
              className="rounded-xl border-2 border-[rgba(11,62,175,0.12)] bg-gradient-to-r from-white to-[rgba(11,62,175,0.04)] p-4 dark:border-white/10 dark:from-[#1a1a1a] dark:to-[rgba(11,62,175,0.08)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-[#A7D344]/60">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[rgba(11,62,175,0.1)] text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                        {initialsFromName(t.user_name)}
                      </div>
                    )}
                  </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">Ticket #{t.id}</div>
                  <div className="font-bold text-slate-900 dark:text-white">{t.title}</div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    From <strong>{t.user_name}</strong> · {formatAt(t.created_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                  {typeLabel ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${issueTypeBadgeClass(typeLabel)}`}>
                      {typeLabel}
                    </span>
                  ) : null}
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      t.status === "open"
                        ? "bg-[rgba(167,211,68,0.35)] text-[#1a3d00] dark:text-[#A7D344]"
                        : "bg-amber-100 text-amber-950",
                    ].join(" ")}
                  >
                    {t.status === "in_progress" ? "In progress" : "Open"}
                  </span>
                  </div>
                </div>
                </div>
                <button
                  type="button"
                  disabled={completingId === t.id}
                  className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
                  onClick={() => markCompleted(t.id)}
                >
                  {completingId === t.id ? "Saving…" : "Mark completed"}
                </button>
              </div>
            </li>
          );
          })}
        </ul>
      )}
      </div>

      {submissionModalTicket ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="it-ticket-new-submitted-title"
          onClick={() => setSubmissionModalTicket(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border-2 border-[rgba(11,62,175,0.15)] bg-white shadow-2xl dark:border-[rgba(167,211,68,0.2)] dark:bg-[#101010]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-[#0B3EAF] to-[#1a5fd4] px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 overflow-hidden rounded-full bg-white p-[3px] ring-2 ring-[#A7D344]">
                  {submissionPhoto ? (
                    <img
                      src={submissionPhoto}
                      alt={submissionModalTicket.user_name || "User avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[rgba(11,62,175,0.1)] text-sm font-bold text-[#0B3EAF]">
                      {initialsFromName(submissionModalTicket.user_name)}
                    </div>
                  )}
                </div>
                <div>
                  <h2
                    id="it-ticket-new-submitted-title"
                    className="text-lg font-bold text-white"
                  >
                    New IT ticket #{submissionModalTicket.id}
                  </h2>
                  <p className="mt-1 text-sm text-white/85">
                    Requester: {submissionModalTicket.user_name || "—"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border-2 border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                onClick={() => setSubmissionModalTicket(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-6 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                {issueTypeFromTitle(submissionModalTicket.title) ? (
                  <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${issueTypeBadgeClass(issueTypeFromTitle(submissionModalTicket.title))}`}>
                    {issueTypeFromTitle(submissionModalTicket.title)}
                  </span>
                ) : null}
                <span
                  className={[
                    "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
                    submissionModalTicket.status === "open"
                      ? "bg-[rgba(167,211,68,0.25)] text-[#000000] dark:text-[#A7D344]"
                      : "bg-[rgba(11,62,175,0.15)] text-[#0B3EAF] dark:bg-[rgba(11,62,175,0.35)] dark:text-white",
                  ].join(" ")}
                >
                  {submissionModalTicket.status === "in_progress" ? "In progress" : "Open"}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Title</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                    {submissionModalTicket.title}
                  </div>
                </div>

                {submissionModalTicket.description ? (
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Description</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                      {submissionModalTicket.description}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Submitted</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {formatAt(submissionModalTicket.created_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Assigned to</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {submissionModalTicket.assignee_name?.trim()
                        ? submissionModalTicket.assignee_name
                        : "Unassigned"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Attachments</div>
                  {parseTicketAttachments(submissionModalTicket).length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                      {parseTicketAttachments(submissionModalTicket).map((a, i) => (
                        <li key={`${submissionModalTicket.id}-att-${i}`}>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[#0B3EAF] underline underline-offset-2"
                          >
                            {a.name || `File ${i + 1}`}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No attachments.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
