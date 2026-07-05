import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";

const VISIBLE_COUNT = 3;
const SLIDE_INTERVAL_MS = 3000;

function initialsFromName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Avatar({ src, name }) {
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 ring-1 ring-[#0B3EAF]/15 dark:bg-white/10 dark:ring-white/15">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-[#0B3EAF] dark:text-[#A7D344]">
          {initialsFromName(name)}
        </div>
      )}
    </div>
  );
}

function NewHireRow({ entry }) {
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const name = String(entry.title || "").trim();
  const role = String(entry.description || "").trim();
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  return (
    <Link
      to={`/new-hires/${encodeURIComponent(String(entry.id))}`}
      className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-slate-50 dark:hover:bg-white/5"
    >
      <Avatar src={img} name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
        {role ? <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{role}</p> : null}
      </div>
      {dateLabel ? (
        <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">{dateLabel}</span>
      ) : null}
    </Link>
  );
}

function VerticalSlider({ entries }) {
  const [startIdx, setStartIdx] = useState(0);
  const timerRef = useRef(null);
  const total = entries.length;

  const advance = () => {
    setStartIdx((prev) => (prev + 1) % total);
  };

  const retreat = () => {
    setStartIdx((prev) => (prev - 1 + total) % total);
  };

  useEffect(() => {
    timerRef.current = setInterval(advance, SLIDE_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [total]);

  const resetTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(advance, SLIDE_INTERVAL_MS);
  };

  const visible = Array.from({ length: Math.min(VISIBLE_COUNT, total) }, (_, i) => entries[(startIdx + i) % total]);

  return (
    <div className="relative">
      <div className="space-y-0.5 overflow-hidden">
        {visible.map((entry) => (
          <NewHireRow key={`${entry.id}-${startIdx}`} entry={entry} />
        ))}
      </div>
      {total > VISIBLE_COUNT && (
        <div className="mt-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => { retreat(); resetTimer(); }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            aria-label="Previous"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {startIdx + 1} – {Math.min(startIdx + VISIBLE_COUNT, total)} / {total}
          </span>
          <button
            type="button"
            onClick={() => { advance(); resetTimer(); }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            aria-label="Next"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default function NewHiresCard({ newHireEntries, newHireLoading, canManageNewHires }) {
  const hasNewHires = (newHireEntries?.length || 0) > 0;
  const useSlider = (newHireEntries?.length || 0) > VISIBLE_COUNT;

  return (
    <div className="card relative flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#A7D344] to-[#0B3EAF]" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/new-hires"
          className="text-[11px] font-bold uppercase tracking-wide text-slate-700 hover:underline dark:text-slate-300"
        >
          New Hires
        </Link>
        {canManageNewHires ? (
          <Link
            to="/admin/new-hires"
            className="text-[10px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
          >
            Manage
          </Link>
        ) : null}
      </div>

      <div className="mt-3 flex-1">
        {newHireLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
        ) : !hasNewHires ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No new hires have been published yet.</p>
        ) : useSlider ? (
          <VerticalSlider entries={newHireEntries} />
        ) : (
          <div className="space-y-0.5">
            {newHireEntries.map((entry) => (
              <NewHireRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
