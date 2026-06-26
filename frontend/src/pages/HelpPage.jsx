import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { postItTicketAttachment } from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const HELP_CATEGORIES = [
  { value: "", label: "Please select" },
  { value: "login_access", label: "Login / access" },
  { value: "profile", label: "Profile & account" },
  { value: "university", label: "AGC University / learning" },
  { value: "reports", label: "Reports & Power BI" },
  { value: "calendar", label: "Calendar & upcoming" },
  { value: "other", label: "Other" },
];

const HELP_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.txt";

function FieldLabel({ htmlFor, required, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
      {children}
      {required ? <span className="ml-0.5 text-[#E02B20]">*</span> : null}
    </label>
  );
}

function fieldClass(extra = "") {
  return [
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm",
    "focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20",
    "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
    extra,
  ].join(" ");
}

export default function HelpPage() {
  const [contacts, setContacts] = useState([]);
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api
      .get("/help/contacts")
      .then(({ data }) => setContacts(Array.isArray(data?.contacts) ? data.contacts : []))
      .catch(() => setContacts([]));
  }, []);

  const supportContacts = useMemo(() => {
    if (contacts.length > 0) return contacts;
    return [
      { id: "garima", name: "Garima", role: "Portal support", email: null },
      { id: "ashhar", name: "Ashhar", role: "Portal support", email: null },
    ];
  }, [contacts]);

  const contactLine = supportContacts
    .map((c) => (c.email ? `${c.name} (${c.email})` : c.name))
    .join(" and ");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!category) {
      setError("Please select a category.");
      return;
    }

    setSending(true);
    try {
      let attachments = [];
      if (attachmentFile) {
        const fd = new FormData();
        fd.append("file", attachmentFile);
        const up = await postItTicketAttachment(fd);
        const url = resolvePublicMediaUrl(up?.file_url || up?.url || "");
        if (url) {
          attachments = [{ name: up?.original_name || attachmentFile.name, url }];
        }
      }

      const { data } = await api.post("/help/report", {
        category,
        subject: subject.trim(),
        message: message.trim(),
        attachments,
      });
      setSuccess(data?.message || "Your request was sent. Garima and Ashhar will follow up by email.");
      setCategory("");
      setSubject("");
      setMessage("");
      setAttachmentFile(null);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not send your request."));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className={`${PAGE_SHELL} mx-auto max-w-3xl`}>
      <section className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          Having trouble? We&apos;re here to help!
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Use the form below to reach our portal support team. Your request goes to{" "}
          <span className="font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{contactLine}</span>.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
          For hardware, software, or report-access IT issues, use{" "}
          <Link to="/it-tickets" className="font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]">
            IT Ticket
          </Link>{" "}
          instead.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 sm:p-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Need assistance? Submit your request here</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Choose a category, describe the issue, and attach a screenshot if helpful.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-brand-red/35 bg-red-50/95 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/55 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
            {success}
          </div>
        ) : null}

        <form className="agc-form mt-6 space-y-5" onSubmit={onSubmit}>
          <div>
            <FieldLabel htmlFor="help-category" required>
              Category
            </FieldLabel>
            <select
              id="help-category"
              className={fieldClass()}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {HELP_CATEGORIES.map((opt) => (
                <option key={opt.value || "empty"} value={opt.value} disabled={opt.value === ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="help-subject" required>
              Subject
            </FieldLabel>
            <input
              id="help-subject"
              className={fieldClass()}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary"
              required
              maxLength={200}
            />
          </div>

          <div>
            <FieldLabel htmlFor="help-message" required>
              Please describe your issue in detail
            </FieldLabel>
            <textarea
              id="help-message"
              className={fieldClass("min-h-[160px] resize-y")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? What did you expect? Steps to reproduce if applicable…"
              required
              maxLength={8000}
            />
          </div>

          <div>
            <FieldLabel htmlFor="help-attachment">Upload a screenshot or relevant document</FieldLabel>
            <input
              id="help-attachment"
              type="file"
              accept={HELP_ACCEPT}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B3EAF] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#082d82] dark:text-slate-300"
              onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
            />
            {attachmentFile ? (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Selected: {attachmentFile.name}</p>
            ) : null}
          </div>

          <div className="pt-1">
            <button type="submit" className="btn-primary min-w-[8rem]" disabled={sending}>
              {sending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
