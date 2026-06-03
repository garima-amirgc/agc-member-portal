import { useCallback, useEffect, useRef, useState } from "react";
import api, { postItTicketAttachment } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import { userHasDepartment } from "../utils/userDepts";
import { friendlyErrorMessage } from "../services/friendlyError";
import ItTicketsMonitorTable from "../components/ItTicketsMonitorTable";
import { ticketRequesterPhotoUrl } from "../utils/ticketUserAvatar";
import { FORM_FIELD, FORM_LABEL, ISSUE_TYPE_PILL_STYLES, issueTypeBadgeClass } from "../utils/itTicketStyles";

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

const ISSUE_TYPES = [
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "report_access", label: "Report Access" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

function formatSubmittedAt(iso) {
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

const MAX_TICKET_ATTACHMENTS = 5;
const TICKET_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp";

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

export default function ItTicketsPage() {
  const { user } = useAuth();
  const isIT = userHasDepartment(user, "IT");

  const [tickets, setTickets] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [issueType, setIssueType] = useState("hardware");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [otherIssue, setOtherIssue] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState("");
  const [submittedTicketId, setSubmittedTicketId] = useState(null);
  const [submissionModalTicket, setSubmissionModalTicket] = useState(null);
  const [resolvedModalTicket, setResolvedModalTicket] = useState(null);
  const prevStatusByIdRef = useRef(new Map());
  /** @type {[{ url: string, name: string }]} */
  const [attachments, setAttachments] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/tickets")
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

  // Poll so the requestor can see a confirmation when IT marks a ticket completed.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    api
      .get("/tickets/it-assignees")
      .then((r) => setAssignees(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssignees([]));
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!assigneeId) {
      setError("Please select an IT staff member.");
      return;
    }

    const typeLabel = ISSUE_TYPES.find((x) => x.value === issueType)?.label || "Issue";

    let payloadTitle;
    let payloadDescription;

    if (issueType === "other") {
      if (!otherIssue.trim()) {
        setError("Please describe your issue.");
        return;
      }
      const detail = otherIssue.trim();
      payloadTitle = `[Other] ${detail.length > 90 ? `${detail.slice(0, 87)}…` : detail}`;
      payloadDescription = detail.length > 90 ? detail : undefined;
    } else {
      if (!title.trim()) {
        setError("Please enter a short title.");
        return;
      }
      payloadTitle = `[${typeLabel}] ${title.trim()}`;
      payloadDescription = description.trim() || undefined;
    }

    setSubmitting(true);
    setSubmittedTicketId(null);
    try {
      const res = await api.post("/tickets", {
        title: payloadTitle,
        description: payloadDescription,
        assignee_id: Number(assigneeId),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      const newTicket = res.data;
      const newId = newTicket?.id;
      if (newId != null) setSubmittedTicketId(Number(newId));
      if (newTicket) setSubmissionModalTicket(newTicket);
      setTitle("");
      setDescription("");
      setOtherIssue("");
      setAssigneeId("");
      setIssueType("hardware");
      setAttachments([]);
      await load();
      window.dispatchEvent(new Event("agc-it-tickets-changed"));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not submit ticket."));
    } finally {
      setSubmitting(false);
    }
  };

  const onAttachmentFiles = async (fileList) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploadError("");
    const room = MAX_TICKET_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setUploadError(`You can attach up to ${MAX_TICKET_ATTACHMENTS} files.`);
      return;
    }
    const toUpload = files.slice(0, room);
    setUploadBusy(true);
    try {
      const next = [...attachments];
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("file", file);
        const data = await postItTicketAttachment(fd);
        const url = data?.file_url;
        if (!url) throw new Error("Upload did not return a file URL.");
        const name = String(data?.original_name || file.name || "attachment").slice(0, 200);
        next.push({ url, name });
      }
      setAttachments(next);
    } catch (err) {
      setUploadError(friendlyErrorMessage(err, "Upload failed."));
    } finally {
      setUploadBusy(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // When a ticket transitions into "closed", show a confirmation modal to the requestor.
  useEffect(() => {
    const prev = prevStatusByIdRef.current;
    let newlyResolved = null;
    for (const t of tickets) {
      const old = prev.get(t.id);
      if (old && old !== "closed" && t.status === "closed") {
        newlyResolved = t;
        break;
      }
    }

    const next = new Map();
    for (const t of tickets) next.set(t.id, t.status);
    prevStatusByIdRef.current = next;

    if (newlyResolved && !resolvedModalTicket) {
      setResolvedModalTicket(newlyResolved);
    }
  }, [tickets, resolvedModalTicket]);

  const submissionPhoto = submissionModalTicket
    ? ticketRequesterPhotoUrl(submissionModalTicket, user)
    : "";

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/tickets/${id}`, { status });
      await load();
      window.dispatchEvent(new Event("agc-it-tickets-changed"));
    } catch (err) {
      window.alert(err.response?.data?.message || err.message || "Update failed");
    }
  };

  return (
    <main className={PAGE_SHELL}>
      <ItTicketsMonitorTable
        tickets={tickets}
        loading={loading}
        isIT={isIT}
        onStatusChange={setStatus}
        currentUser={user}
      />

      <section className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-[rgba(11,62,175,0.08)] dark:ring-[rgba(167,211,68,0.12)]">
          <div className="border-b border-[#082d82]/20 bg-gradient-to-r from-[rgba(167,211,68,0.35)] via-[rgba(167,211,68,0.2)] to-[rgba(11,62,175,0.08)] px-6 py-5 sm:px-8 sm:py-6 dark:from-[rgba(167,211,68,0.12)] dark:via-[rgba(11,62,175,0.2)] dark:to-transparent">
            <h2 className="text-xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">Raise a ticket</h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Choose a category, describe the issue, and assign it to an IT team member.
            </p>
          </div>
          <form className="agc-form space-y-6 px-6 py-7 sm:px-8 sm:py-8" onSubmit={onSubmit}>
            {error ? (
              <div className="rounded-xl border-2 border-[#E02B20]/40 bg-red-50 px-4 py-3 text-sm font-medium text-[#E02B20] dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            ) : null}
            {submittedTicketId ? (
              <div className="rounded-xl border-2 border-[#A7D344]/50 bg-[rgba(167,211,68,0.15)] px-4 py-3 text-sm font-semibold text-[#1a3d00] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
                Ticket #{submittedTicketId} was submitted successfully.
              </div>
            ) : null}
            <div>
              <span className={FORM_LABEL}>Issue type</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {ISSUE_TYPES.map((t) => {
                  const styles = ISSUE_TYPE_PILL_STYLES[t.value] || ISSUE_TYPE_PILL_STYLES.other;
                  const selected = issueType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setIssueType(t.value)}
                      className={[
                        "rounded-xl border-2 px-3 py-3 text-center text-xs font-bold transition sm:text-sm",
                        selected ? styles.active : styles.idle,
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {issueType === "other" ? (
              <div>
                <label className={FORM_LABEL}>Describe your issue</label>
                <textarea
                  className={`${FORM_FIELD} min-h-[140px]`}
                  value={otherIssue}
                  onChange={(e) => setOtherIssue(e.target.value)}
                  placeholder="Type what you need help with…"
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <label className={FORM_LABEL}>Title</label>
                  <input
                    className={FORM_FIELD}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. VPN disconnects from home office"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className={FORM_LABEL}>Details (optional)</label>
                  <textarea
                    className={`${FORM_FIELD} min-h-[120px]`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Steps to reproduce, error messages, device name…"
                  />
                </div>
              </>
            )}

            <div className="rounded-2xl border-2 border-dashed border-[rgba(11,62,175,0.2)] bg-[rgba(11,62,175,0.03)] p-5 dark:border-[rgba(167,211,68,0.25)] dark:bg-[rgba(167,211,68,0.04)]">
              <label className={FORM_LABEL}>
                Attachments (optional)
              </label>
              {uploadError ? (
                <p className="mb-2 text-sm text-[#E02B20] dark:text-red-300">{uploadError}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-outline inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-50">
                  <input
                    type="file"
                    className="sr-only"
                    accept={TICKET_ACCEPT}
                    multiple
                    disabled={uploadBusy || attachments.length >= MAX_TICKET_ATTACHMENTS}
                    onChange={(e) => {
                      void onAttachmentFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {uploadBusy ? "Uploading…" : "Choose files"}
                </label>
                <span className="text-xs text-[#000000]/60 dark:text-white/50">
                  {attachments.length}/{MAX_TICKET_ATTACHMENTS} attached
                </span>
              </div>
              {attachments.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {attachments.map((a, idx) => (
                    <li
                      key={`${a.url}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[rgba(11,62,175,0.12)] bg-white px-3 py-2 dark:border-[rgba(167,211,68,0.2)] dark:bg-[#1a1a1a]"
                    >
                      <span className="min-w-0 truncate font-medium text-[#0B3EAF] dark:text-[#A7D344]" title={a.name}>
                        {a.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-[#E02B20] underline"
                        onClick={() => removeAttachment(idx)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <label className={FORM_LABEL}>Assign to (IT)</label>
              <select
                className={FORM_FIELD}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                required
                disabled={assignees.length === 0}
              >
                <option value="">{assignees.length === 0 ? "No IT staff available" : "Select IT staff…"}</option>
                {assignees.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              {assignees.length === 0 ? (
                <p className="mt-2 text-sm text-[#000000]/70 dark:text-white/60">
                  There are no users with IT in their departments yet. An admin can add IT under user departments.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-6 dark:border-white/10">
            <button
              type="submit"
              disabled={submitting || assignees.length === 0}
              className="btn-primary min-h-[44px] px-8 text-base disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">IT will be notified by email when configured.</p>
            </div>
          </form>
        </section>

        {submissionModalTicket ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="it-ticket-submitted-title"
            onClick={() => {
              setSubmissionModalTicket(null);
              setSubmittedTicketId(null);
            }}
          >
            <div
              className="w-full max-w-3xl overflow-hidden rounded-2xl border-2 border-[rgba(11,62,175,0.15)] bg-white shadow-2xl dark:border-[rgba(167,211,68,0.2)] dark:bg-[#101010]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-[#0B3EAF] to-[#1a5fd4] px-6 py-5 sm:px-7">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-white p-[3px] shadow-md ring-2 ring-[#A7D344]">
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
                      id="it-ticket-submitted-title"
                      className="text-lg font-bold text-white"
                    >
                      Ticket #{submissionModalTicket.id} submitted
                    </h2>
                    <p className="mt-1 text-sm text-white/85">
                      Requester: {submissionModalTicket.user_name || "—"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full border-2 border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/25"
                  onClick={() => {
                    setSubmissionModalTicket(null);
                    setSubmittedTicketId(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="space-y-5 p-6 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide",
                      submissionModalTicket.status === "open"
                        ? "bg-[rgba(167,211,68,0.35)] text-[#1a3d00] ring-1 ring-[#A7D344]/50 dark:text-[#A7D344]"
                        : submissionModalTicket.status === "in_progress"
                          ? "bg-amber-100 text-amber-950 ring-1 ring-amber-200"
                          : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
                    ].join(" ")}
                  >
                    {statusBadgeLabel(submissionModalTicket.status)}
                  </span>

                  {issueTypeFromTitle(submissionModalTicket.title) ? (
                    <span
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${issueTypeBadgeClass(issueTypeFromTitle(submissionModalTicket.title))}`}
                    >
                      {issueTypeFromTitle(submissionModalTicket.title)}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                    <div className={FORM_LABEL}>Title</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      {submissionModalTicket.title}
                    </div>
                  </div>

                  {submissionModalTicket.description ? (
                    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                      <div className={FORM_LABEL}>Description</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        {submissionModalTicket.description}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border-2 border-[rgba(11,62,175,0.12)] px-4 py-3 dark:border-white/10">
                      <div className={FORM_LABEL}>Submitted</div>
                      <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                        {formatSubmittedAt(submissionModalTicket.created_at)}
                      </div>
                    </div>
                    <div className="rounded-xl border-2 border-[rgba(167,211,68,0.35)] px-4 py-3 dark:border-[#A7D344]/30">
                      <div className={FORM_LABEL}>Assigned to</div>
                      <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                        {submissionModalTicket.assignee_name?.trim()
                          ? submissionModalTicket.assignee_name
                          : "Unassigned"}
                      </div>
                    </div>
                  </div>

                  {parseTicketAttachments(submissionModalTicket).length > 0 ? (
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Attachments</div>
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
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {resolvedModalTicket ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="it-ticket-resolved-title"
            onClick={() => setResolvedModalTicket(null)}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white shadow-2xl dark:border-emerald-800 dark:bg-[#101010]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="it-ticket-resolved-title"
                      className="text-lg font-bold text-white"
                    >
                      Ticket #{resolvedModalTicket.id} completed
                    </h2>
                    <p className="mt-1 text-sm text-emerald-50">
                      Confirmation sent to your email (if configured).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border-2 border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25"
                    onClick={() => setResolvedModalTicket(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="space-y-3 p-6">
                <div className="text-base font-bold text-slate-900 dark:text-white">{resolvedModalTicket.title}</div>
                {resolvedModalTicket.description ? (
                  <div className="rounded-xl bg-emerald-50/80 px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200">
                    {resolvedModalTicket.description}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
    </main>
  );
}
