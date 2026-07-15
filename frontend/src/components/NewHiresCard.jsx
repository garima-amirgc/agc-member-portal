import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";

function initialsFromName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SlideCard({ entry }) {
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const name = String(entry.title || "").trim();
  const role = String(entry.description || "").trim();
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  return (
    <Link
      to={`/new-hires/${encodeURIComponent(String(entry.id))}`}
      className="block"
    >
      <div className="flex h-52 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
        {/* Left: Image */}
        <div className="relative w-2/5 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
          {img ? (
            <img src={img} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#A7D344]/20 to-[#0B3EAF]/10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3EAF]/10 text-2xl font-bold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                {initialsFromName(name)}
              </div>
            </div>
          )}
        </div>

        {/* Right: Content */}
        <div className="flex flex-1 flex-col justify-between p-4 min-w-0">
          {/* Top: badge + facility */}
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="rounded-full bg-[#A7D344] px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal whitespace-nowrap text-white shadow-sm">
              New Hire
            </span>
            {entry.facility ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {entry.facility}
              </span>
            ) : null}
          </div>

          {/* Middle: name + role */}
          <div className="mt-2 flex-1">
            <p className="font-bold leading-snug text-slate-900 dark:text-white line-clamp-2">
              {name}
            </p>
            {role ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-3">
                {role}
              </p>
            ) : null}
          </div>

          {/* Bottom: date */}
          {dateLabel ? (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{dateLabel}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function NewHiresCard({ newHireEntries, newHireLoading, canManageNewHires }) {
  const items = newHireEntries || [];
  const total = items.length;
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [total]);

  const prev = useCallback(() => setIndex((i) => (i === 0 ? total - 1 : i - 1)), [total]);
  const next = useCallback(() => setIndex((i) => (i === total - 1 ? 0 : i + 1)), [total]);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [total, next]);

  return (
    <div className="card relative flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#A7D344] to-[#0B3EAF]" aria-hidden />

      {/* Header */}
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
            className="text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
          >
            Manage
          </Link>
        ) : null}
      </div>

      {/* Slider body */}
      <div className="mt-3">
        {newHireLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#A7D344] dark:border-slate-700 dark:border-t-[#A7D344]" />
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">No new hires have been published yet.</p>
        ) : (
          <>
            {/* Slide */}
            <div>
              <SlideCard entry={items[index]} />
            </div>

            {/* Controls */}
            {total > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                {/* Prev arrow */}
                <button
                  type="button"
                  onClick={prev}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                  aria-label="Previous"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Dots */}
                <div className="flex items-center gap-1.5">
                  {items.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`rounded-full transition-all ${
                        i === index
                          ? "h-2 w-5 bg-[#A7D344]"
                          : "h-2 w-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                      }`}
                    />
                  ))}
                </div>

                {/* Next arrow */}
                <button
                  type="button"
                  onClick={next}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                  aria-label="Next"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}

            {/* Counter */}
            {total > 1 && (
              <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                {index + 1} / {total}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
