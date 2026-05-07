import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

/** Served from `frontend/public` — thumbs-up / feedback illustration for modal chrome */
const POLL_POPUP_BACKGROUND_URL = "/poll-feedback-popup-bg.png";

function normalizeQuestions(def) {
  const d = def && typeof def === "object" ? def : {};
  const qs = Array.isArray(d.questions) ? d.questions : [];
  return qs
    .map((q) => ({
      id: String(q?.id || "").trim(),
      type: q?.type === "multiselect" || q?.type === "text" ? q.type : "radio",
      label: String(q?.label || "").trim(),
      required: q?.required === true,
      options: Array.isArray(q?.options)
        ? q.options
            .map((o) => ({ id: String(o?.id || "").trim(), label: String(o?.label || "").trim() }))
            .filter((o) => o.id && o.label)
        : [],
    }))
    .filter((q) => q.id && q.label);
}

export default function PollPopupModal({ poll, open, onClose, onSubmitted }) {
  const questions = useMemo(() => normalizeQuestions(poll?.definition), [poll]);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  const bannerUrl = useMemo(() => resolvePublicMediaUrl(poll?.banner_image_url || ""), [poll?.banner_image_url]);

  const endAtLabel = useMemo(() => {
    const raw = poll?.end_at;
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }, [poll?.end_at]);

  useEffect(() => {
    if (!open) return;
    setAnswers({});
  }, [open, poll?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !poll) return null;

  const submit = async () => {
    const missing = [];
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      const ok =
        q.type === "text"
          ? typeof v === "string" && v.trim()
          : q.type === "multiselect"
            ? Array.isArray(v) && v.length > 0
            : typeof v === "string" && v;
      if (!ok) missing.push(q.label);
    }
    if (missing.length) {
      window.alert(`Please answer required question(s):\n\n- ${missing.join("\n- ")}`);
      return;
    }
    setSaving(true);
    try {
      await api.post(`/polls/${poll.id}/submit`, { answers });
      onSubmitted?.();
      onClose?.();
    } catch (e) {
      const st = e.response?.status;
      const msg = e.response?.data?.message || e.message;
      window.alert(st ? `Submit failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-popup-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#b6c9f5]/45 bg-white shadow-2xl ring-1 ring-white/60 dark:border-white/10 dark:bg-slate-950 dark:ring-white/5">
        <div
          className="pointer-events-none absolute inset-0 bg-right bg-no-repeat [background-size:1024px_auto]"
          style={{ backgroundImage: `url(${POLL_POPUP_BACKGROUND_URL})` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[1px] dark:bg-black/25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/96 via-white/88 to-white/40 dark:from-slate-950/95 dark:via-slate-950/82 dark:to-slate-950/55"
          aria-hidden
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full text-[#21408c]/80 transition hover:bg-white/50 hover:text-[#0B3EAF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF] dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white"
          aria-label="Close"
        >
          <span className="text-3xl leading-none font-black tracking-tight" aria-hidden>
            ×
          </span>
        </button>

        <div className="relative z-10 p-5 sm:p-6">
          {bannerUrl ? (
            <div className="-mx-5 -mt-5 mb-4 overflow-hidden border-b border-[#b6c9f5]/35 dark:border-white/10 sm:-mx-6 sm:-mt-6">
              <img
                src={bannerUrl}
                alt=""
                className="h-40 w-full object-cover sm:h-44"
                loading="lazy"
                onError={(e) => {
                  // Hide broken images so the modal still looks clean.
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          ) : null}
          <div className="pr-10">
            <div
              id="poll-popup-title"
              className="font-[cursive] text-3xl leading-tight text-[#0B3EAF] dark:text-[#A7D344] sm:text-4xl"
            >
              {poll.title || "Feedback"}
            </div>
            {poll.description ? (
              <div className="mt-1 text-sm font-semibold leading-relaxed text-[#27418f]/80 dark:text-slate-200">
                {poll.description}
              </div>
            ) : null}
            {endAtLabel ? (
              <div className="mt-2 text-xs font-semibold text-[#27418f] dark:text-slate-200">
                Submit by <span className="font-bold text-[#0B3EAF] dark:text-[#A7D344]">{endAtLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            {questions.map((q) => (
              <div
                key={q.id}
                className="rounded-portal border border-[#b6c9f5]/55 bg-white/65 p-3 shadow-sm backdrop-blur-sm dark:border-white/15 dark:bg-white/5"
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {q.label} {q.required ? <span className="text-brand-red">*</span> : null}
                </div>
                {q.type === "text" ? (
                  <textarea
                    className="mt-2 w-full rounded border border-[#b6c9f5]/60 bg-white/90 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-white/15 dark:bg-slate-900/40"
                    rows={3}
                    value={typeof answers[q.id] === "string" ? answers[q.id] : ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Type your answer…"
                  />
                ) : q.type === "multiselect" ? (
                  <div className="mt-2 space-y-2">
                    {q.options.map((o) => {
                      const cur = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const checked = cur.includes(o.id);
                      return (
                        <label key={o.id} className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => {
                              setAnswers((a) => {
                                const prev = Array.isArray(a[q.id]) ? a[q.id] : [];
                                const s = new Set(prev);
                                if (s.has(o.id)) s.delete(o.id);
                                else s.add(o.id);
                                return { ...a, [q.id]: Array.from(s) };
                              });
                            }}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {q.options.map((o) => (
                      <label key={o.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`poll_${poll.id}_${q.id}`}
                          className="mt-1"
                          checked={answers[q.id] === o.id}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Later
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

