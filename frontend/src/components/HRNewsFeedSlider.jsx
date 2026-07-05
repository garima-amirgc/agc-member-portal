import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const AUTO_INTERVAL_MS = 5000;

function FacilityBadge({ label }) {
  return (
    <span className="rounded bg-[#0B3EAF]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">
      {label}
    </span>
  );
}

function DepartmentBadge({ label }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {label}
    </span>
  );
}

export default function HRNewsFeedSlider({ items, loading }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  const total = items?.length || 0;

  const go = (next) => {
    setIdx(((next % total) + total) % total);
  };

  const resetTimer = () => {
    clearInterval(timerRef.current);
    if (total > 1) {
      timerRef.current = setInterval(() => setIdx((i) => (i + 1) % total), AUTO_INTERVAL_MS);
    }
  };

  useEffect(() => {
    resetTimer();
    return () => clearInterval(timerRef.current);
  }, [total]);

  if (loading || total === 0) return null;

  const item = items[idx];
  const imgSrc = item.image_url ? resolvePublicMediaUrl(item.image_url) : null;

  return (
    <div className="card relative flex overflow-hidden rounded-2xl p-0" style={{ minHeight: "240px" }}>
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-[#0B3EAF] via-[#A7D344] to-[#0B3EAF]" aria-hidden />

      {/* Left: image — full card height, object-contain so nothing is cut off */}
      {imgSrc && (
        <div className="relative w-2/5 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-900">
          <img
            src={imgSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
          />
        </div>
      )}

      {/* Right: content column */}
      <div className={`flex min-w-0 flex-1 flex-col ${!imgSrc ? "w-full" : ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Newsfeed
          </span>
          {total > 1 && (
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {idx + 1} / {total}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col justify-between gap-2 px-4 pb-3">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.isArray(item.facilities) &&
              item.facilities.map((f) => <FacilityBadge key={f} label={f} />)}
            {item.department ? <DepartmentBadge label={item.department} /> : null}
          </div>

          {/* Title + body */}
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-white">
              {item.title}
            </h3>
            {item.body ? (
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {item.body}
              </p>
            ) : null}
          </div>

          {/* Read more */}
          <Link
            to="/newsfeed"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
          >
            Read more
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        </div>

        {/* Controls */}
        {total > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-700">
            {/* Dots */}
            <div className="flex items-center gap-1">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { go(i); resetTimer(); }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx
                      ? "w-4 bg-[#0B3EAF] dark:bg-[#A7D344]"
                      : "w-1.5 bg-slate-300 dark:bg-slate-600"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Prev / Next */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { go(idx - 1); resetTimer(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                aria-label="Previous"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { go(idx + 1); resetTimer(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                aria-label="Next"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
