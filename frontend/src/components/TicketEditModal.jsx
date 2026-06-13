import { useEffect, useState } from "react";
import api, { postItTicketAttachment } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import {
  FORM_FIELD,
  FORM_LABEL,
  ISSUE_TYPE_PILL_STYLES,
  TICKET_PRIORITY_OPTIONS,
} from "../utils/itTicketStyles";
import { TICKET_ISSUE_TYPES, buildTicketPayload, ticketToEditForm } from "../utils/ticketForm";

const MAX_TICKET_ATTACHMENTS = 5;
const TICKET_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp";

export default function TicketEditModal({ ticket, assignees, onClose, onSaved }) {
  const [issueType, setIssueType] = useState("hardware");
  const [priority, setPriority] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [otherIssue, setOtherIssue] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (!ticket) return;
    const form = ticketToEditForm(ticket);
    setIssueType(form.issueType);
    setPriority(form.priority);
    setTitle(form.title);
    setDescription(form.description);
    setOtherIssue(form.otherIssue);
    setAssigneeId(form.assigneeId);
    setAttachments(form.attachments);
    setError("");
    setUploadError("");
  }, [ticket]);

  if (!ticket) return null;

  const onAttachmentFiles = async (fileList) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploadError("");
    const room = MAX_TICKET_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setUploadError(`You can attach up to ${MAX_TICKET_ATTACHMENTS} files.`);
      return;
    }
    setUploadBusy(true);
    try {
      const next = [...attachments];
      for (const file of files.slice(0, room)) {
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!assigneeId) {
      setError("Please select an IT staff member.");
      return;
    }

    const built = buildTicketPayload({
      issueType,
      title,
      description,
      otherIssue,
      priority,
      assigneeId,
      attachments,
    });
    if (built.error) {
      setError(built.error);
      return;
    }

    setSaving(true);
    try {
      const res = await api.patch(`/tickets/${ticket.id}`, built.payload);
      onSaved?.(res.data);
      onClose?.();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save changes."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-ticket-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#101010]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-[#101010]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="edit-ticket-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Edit ticket #{ticket.id}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Update open tickets while IT has not started work on them yet.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <form className="agc-form space-y-5 px-6 py-6" onSubmit={onSubmit}>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div>
            <span className={FORM_LABEL}>Issue type</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TICKET_ISSUE_TYPES.map((t) => {
                const styles = ISSUE_TYPE_PILL_STYLES[t.value] || ISSUE_TYPE_PILL_STYLES.other;
                const selected = issueType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setIssueType(t.value)}
                    className={[
                      "rounded-lg border-2 px-3 py-2.5 text-center text-xs font-bold transition",
                      selected ? styles.active : styles.idle,
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={FORM_LABEL} htmlFor="edit-ticket-priority">
              Priority
            </label>
            <select
              id="edit-ticket-priority"
              className={FORM_FIELD}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {TICKET_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {issueType === "other" ? (
            <div>
              <label className={FORM_LABEL}>Describe your issue</label>
              <textarea
                className={`${FORM_FIELD} min-h-[120px]`}
                value={otherIssue}
                onChange={(e) => setOtherIssue(e.target.value)}
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
                  maxLength={200}
                  required
                />
              </div>
              <div>
                <label className={FORM_LABEL}>Details (optional)</label>
                <textarea
                  className={`${FORM_FIELD} min-h-[100px]`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <label className={FORM_LABEL}>Attachments (optional)</label>
            {uploadError ? <p className="mb-2 text-sm text-red-600 dark:text-red-300">{uploadError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-outline inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-sm font-bold">
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
                {uploadBusy ? "Uploading…" : "Add files"}
              </label>
              <span className="text-xs text-slate-500">
                {attachments.length}/{MAX_TICKET_ATTACHMENTS}
              </span>
            </div>
            {attachments.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {attachments.map((a, idx) => (
                  <li
                    key={`${a.url}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1a1a1a]"
                  >
                    <span className="min-w-0 truncate font-medium">{a.name}</span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600 underline"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
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
            >
              <option value="">Select IT staff…</option>
              {assignees.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
            <button type="submit" disabled={saving} className="btn-primary min-h-[42px] px-6 disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn-outline min-h-[42px] px-6" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
