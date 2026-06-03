import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

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

function ChevronIcon({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

function PollSlide({ poll, answers, setAnswers, saving }) {
  const questions = useMemo(() => normalizeQuestions(poll?.definition), [poll]);
  const bannerUrl = useMemo(() => resolvePublicMediaUrl(poll?.banner_image_url || ""), [poll?.banner_image_url]);

  const endAtLabel = useMemo(() => {
    const raw = poll?.end_at;
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }, [poll?.end_at]);

  if (!poll) return null;

  return (
    <>
      {bannerUrl ? (
        <div className="-mx-5 -mt-5 mb-4 overflow-hidden border-b border-[#b6c9f5]/35 dark:border-white/10 sm:-mx-6 sm:-mt-6">
          <img
            src={bannerUrl}
            alt=""
            className="h-40 w-full object-cover sm:h-44"
            loading="lazy"
            onError={(e) => {
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
                disabled={saving}
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
                        disabled={saving}
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
                      disabled={saving}
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
    </>
  );
}

export default function PollPopupModal({ polls = [], open, startIndex = 0, onDismiss, onClose, onSubmitted }) {
  const list = useMemo(() => (Array.isArray(polls) ? polls.filter(Boolean) : []), [polls]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answersByPollId, setAnswersByPollId] = useState({});
  const [saving, setSaving] = useState(false);

  const poll = list[currentIndex] || null;
  const hasMultiple = list.length > 1;
  const answers = answersByPollId[poll?.id] || {};
  const questions = useMemo(() => normalizeQuestions(poll?.definition), [poll]);

  const setAnswers = useCallback(
    (updater) => {
      if (!poll) return;
      setAnswersByPollId((prev) => {
        const cur = prev[poll.id] || {};
        const next = typeof updater === "function" ? updater(cur) : updater;
        return { ...prev, [poll.id]: next };
      });
    },
    [poll]
  );

  useEffect(() => {
    if (!open) return;
    const safeStart = Math.min(Math.max(0, startIndex), Math.max(0, list.length - 1));
    setCurrentIndex(safeStart);
  }, [open, startIndex, list.length]);

  useEffect(() => {
    setCurrentIndex((i) => Math.min(i, Math.max(0, list.length - 1)));
  }, [list.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (poll) onClose?.(poll.id);
        return;
      }
      if (!hasMultiple || saving) return;
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex((i) => i - 1);
      }
      if (e.key === "ArrowRight" && currentIndex < list.length - 1) {
        e.preventDefault();
        setCurrentIndex((i) => i + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, poll, hasMultiple, saving, currentIndex, list.length]);

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(list.length - 1, i + 1));

  const submit = async () => {
    if (!poll) return;
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
      onSubmitted?.(poll.id);
      setAnswersByPollId((prev) => {
        const next = { ...prev };
        delete next[poll.id];
        return next;
      });
    } catch (e) {
      const st = e.response?.status;
      const msg = e.response?.data?.message || e.message;
      window.alert(st ? `Submit failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleLater = () => {
    if (!poll) return;
    if (hasMultiple && currentIndex < list.length - 1) {
      onDismiss?.(poll.id);
      setCurrentIndex((i) => i + 1);
      return;
    }
    onClose?.(poll.id);
  };

  if (!open || list.length === 0 || !poll) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-popup-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && poll) onClose?.(poll.id);
      }}
    >
      <div className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-[#b6c9f5]/45 bg-white shadow-2xl ring-1 ring-white/60 dark:border-white/10 dark:bg-slate-950 dark:ring-white/5">
        <div
          className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[1px] dark:bg-black/25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/96 via-white/88 to-white/40 dark:from-slate-950/95 dark:via-slate-950/82 dark:to-slate-950/55"
          aria-hidden
        />

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0 || saving}
              className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/90 text-[#0B3EAF] shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/90 dark:text-[#A7D344] dark:hover:bg-slate-900"
              aria-label="Previous poll"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex >= list.length - 1 || saving}
              className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/90 text-[#0B3EAF] shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/90 dark:text-[#A7D344] dark:hover:bg-slate-900"
              aria-label="Next poll"
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => onClose?.(poll.id)}
          className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white/95 transition hover:bg-black/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF] dark:text-white/95 dark:hover:bg-white/15 dark:hover:text-white"
          aria-label="Close"
        >
          <span className="text-3xl leading-none font-black tracking-tight" aria-hidden>
            ×
          </span>
        </button>

        <div
          className={`relative z-10 min-h-0 flex-1 overflow-y-auto py-5 sm:py-6 ${
            hasMultiple ? "px-14 sm:px-16" : "px-5 sm:px-6"
          }`}
        >
          {hasMultiple ? (
            <div className="mb-4 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#27418f]/75 dark:text-slate-300">
                {currentIndex + 1} of {list.length}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Poll pagination">
                {list.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === currentIndex}
                    aria-label={`Go to poll ${idx + 1}: ${p.title || "Feedback"}`}
                    disabled={saving}
                    onClick={() => setCurrentIndex(idx)}
                    className={[
                      "h-2.5 rounded-full transition-all",
                      idx === currentIndex
                        ? "w-7 bg-[#0B3EAF] dark:bg-[#A7D344]"
                        : "w-2.5 bg-[#b6c9f5]/70 hover:bg-[#0B3EAF]/60 dark:bg-white/25 dark:hover:bg-[#A7D344]/60",
                    ].join(" ")}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <PollSlide poll={poll} answers={answers} setAnswers={setAnswers} saving={saving} />

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={handleLater} disabled={saving}>
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
