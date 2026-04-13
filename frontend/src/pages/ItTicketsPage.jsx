import { useCallback, useEffect, useState } from "react";
import api, { postItTicketAttachment } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import { formatDepartments, userHasDepartment } from "../utils/userDepts";

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
  { value: "access", label: "Access" },
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
      const newId = res.data?.id;
      if (newId != null) setSubmittedTicketId(Number(newId));
      setTitle("");
      setDescription("");
      setOtherIssue("");
      setAssigneeId("");
      setIssueType("hardware");
      setAttachments([]);
      await load();
      window.dispatchEvent(new Event("agc-it-tickets-changed"));
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not submit ticket.");
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
      setUploadError(err.response?.data?.message || err.message || "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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
      <section>
        <h1 className="mb-3 text-2xl font-bold text-[#000000] dark:text-white">IT Ticket</h1>
        <p className="text-sm text-[#0B3EAF] dark:text-[#A7D344]">
          Submit hardware, software, or access issues and track them until IT marks them completed.
        </p>
      </section>

      <section className="card">
          <h2 className="text-lg font-semibold">Raise a ticket</h2>
          <p className="mt-1 text-sm text-[#0B3EAF] dark:text-[#A7D344]">
            IT staff are emailed when SMTP is configured on the server. Your departments:{" "}
            <strong className="text-[#000000] dark:text-white">{user ? formatDepartments(user) : "—"}</strong>
          </p>
          <form className="agc-form mt-4 space-y-3" onSubmit={onSubmit}>
            {submittedTicketId != null ? (
              <div
                className="rounded-portal border border-[rgba(167,211,68,0.5)] bg-[rgba(167,211,68,0.12)] px-3 py-3 text-sm text-[#000000] dark:bg-[rgba(167,211,68,0.08)] dark:text-white"
                role="status"
              >
                <p className="font-bold text-[#0B3EAF] dark:text-[#A7D344]">Ticket #{submittedTicketId} submitted</p>
                <p className="mt-1 text-[#000000]/85 dark:text-white/80">
                  Save this number for your records. You can follow progress under <strong>Your tickets</strong> below. When
                  IT marks it completed, you will see <strong>Completed</strong> here.
                </p>
                <button
                  type="button"
                  className="btn-outline mt-3 text-xs"
                  onClick={() => setSubmittedTicketId(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-portal border border-[#E02B20]/40 bg-red-50 px-3 py-2 text-sm text-[#E02B20] dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">Issue type</label>
              <select
                className="w-full rounded-portal border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-sm dark:border-[rgba(167,211,68,0.3)] dark:bg-[#141414]"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
              >
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm leading-relaxed text-[#000000]/75 dark:text-white/70">
                Report hardware, software, or access issues for the IT team.
              </p>
            </div>

            {issueType === "other" ? (
              <div>
                <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">Describe your issue</label>
                <textarea
                  className="min-h-[120px] w-full rounded-portal border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-sm dark:border-[rgba(167,211,68,0.3)] dark:bg-[#141414]"
                  value={otherIssue}
                  onChange={(e) => setOtherIssue(e.target.value)}
                  placeholder="Type what you need help with…"
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">Title</label>
                  <input
                    className="w-full rounded-portal border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-sm dark:border-[rgba(167,211,68,0.3)] dark:bg-[#141414]"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. VPN disconnects from home office"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">Details (optional)</label>
                  <textarea
                    className="min-h-[100px] w-full rounded-portal border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-sm dark:border-[rgba(167,211,68,0.3)] dark:bg-[#141414]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Steps to reproduce, error messages, device name…"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">
                Attachments (optional)
              </label>
              <p className="mb-2 text-sm leading-relaxed text-[#000000]/75 dark:text-white/70">
                Add screenshots or documents (PDF, Office, images). Up to {MAX_TICKET_ATTACHMENTS} files (15 MB each by
                default; server may vary).
              </p>
              {uploadError ? (
                <p className="mb-2 text-sm text-[#E02B20] dark:text-red-300">{uploadError}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-outline inline-flex cursor-pointer items-center justify-center text-sm disabled:opacity-50">
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
                      className="flex flex-wrap items-center justify-between gap-2 rounded-portal border border-[rgba(11,62,175,0.15)] px-2 py-1.5 dark:border-[rgba(167,211,68,0.25)]"
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
              <label className="mb-1 block text-xs font-bold text-[#000000] dark:text-white">Assign to (IT)</label>
              <select
                className="w-full rounded-portal border border-[rgba(11,62,175,0.2)] bg-white px-3 py-2 text-sm dark:border-[rgba(167,211,68,0.3)] dark:bg-[#141414]"
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
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-[#000000]/75 dark:text-white/70">
                  The ticket is routed to this person; other IT staff are notified as well.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || assignees.length === 0}
              className="btn-primary disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">{isIT ? "All tickets (IT queue)" : "Your tickets"}</h2>
          {!isIT ? (
            <p className="mt-1 text-sm text-[#000000]/70 dark:text-white/65">
              Ticket numbers match the <strong className="text-[#0B3EAF] dark:text-[#A7D344]">#ID</strong> shown on each
              card. Completed requests are removed from this list 30 days after IT marks them complete.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#000000]/70 dark:text-white/65">
              Completed tickets stay visible for 30 days after they are marked complete, then they are removed from this
              list.
            </p>
          )}
          {loading ? (
            <p className="mt-3 text-sm text-[#000000]/70 dark:text-white/60">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="mt-3 text-sm text-[#000000]/70 dark:text-white/60">No tickets yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {tickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-portal border border-[rgba(11,62,175,0.12)] p-4 dark:border-[rgba(167,211,68,0.2)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">#{t.id}</span>
                      <h3 className="font-semibold text-[#000000] dark:text-white">{t.title}</h3>
                      {t.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#000000]/80 dark:text-white/75">{t.description}</p>
                      ) : null}
                      {parseTicketAttachments(t).length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-[#000000]/75 dark:text-white/65">Attachments</p>
                          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                            {parseTicketAttachments(t).map((a, i) => (
                              <li key={`${t.id}-att-${i}`}>
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-[#0B3EAF] underline underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344]"
                                >
                                  {a.name || `File ${i + 1}`}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-[#000000]/60 dark:text-white/50">
                        <span className="font-semibold text-[#000000]/75 dark:text-white/65">Submitted by:</span>{" "}
                        <strong>{t.user_name || "—"}</strong>
                        {isIT ? (
                          <>
                            {" "}
                            ({t.user_email || "—"}) · {t.user_department || "—"}
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-[#000000]/60 dark:text-white/50">
                        <span className="font-semibold text-[#000000]/75 dark:text-white/65">Submitted:</span>{" "}
                        {formatSubmittedAt(t.created_at)}
                      </p>
                      <p className="mt-1 text-xs text-[#000000]/60 dark:text-white/50">
                        <span className="font-semibold text-[#000000]/75 dark:text-white/65">Assigned to:</span>{" "}
                        {t.assignee_name?.trim() ? t.assignee_name : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={[
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                          t.status === "open"
                            ? "bg-[rgba(167,211,68,0.25)] text-[#000000] dark:text-[#A7D344]"
                            : t.status === "in_progress"
                              ? "bg-[rgba(11,62,175,0.15)] text-[#0B3EAF] dark:bg-[rgba(11,62,175,0.35)] dark:text-white"
                              : "bg-[rgba(167,211,68,0.2)] text-[#000000] dark:bg-[rgba(11,62,175,0.35)] dark:text-[#A7D344]",
                        ].join(" ")}
                      >
                        {statusBadgeLabel(t.status)}
                      </span>
                      {isIT ? (
                        <div className="flex flex-col items-end gap-2">
                          {t.status !== "closed" ? (
                            <button
                              type="button"
                              className="btn-primary text-xs"
                              onClick={() => setStatus(t.id, "closed")}
                            >
                              Mark completed
                            </button>
                          ) : null}
                          <select
                            className="rounded-portal border border-[rgba(11,62,175,0.25)] bg-white px-2 py-1.5 text-xs font-semibold dark:border-[rgba(167,211,68,0.35)] dark:bg-[#141414]"
                            value={t.status}
                            onChange={(e) => setStatus(t.id, e.target.value)}
                            aria-label={`Status for ticket ${t.id}`}
                          >
                            {STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
    </main>
  );
}
