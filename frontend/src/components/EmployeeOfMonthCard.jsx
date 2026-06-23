import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  EMPLOYEE_OF_MONTH_FALLBACK_AVATAR,
  EmployeeOfMonthBackgroundStar,
} from "./EmployeeOfMonthCardDecor";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

import { SPOTLIGHT_FEED_CARD_MIN_H, SPOTLIGHT_FEED_HOME_DESC_MIN_H, SPOTLIGHT_FEED_HOME_LINE_CLAMP, spotlightFeedNeedsReadMore } from "../utils/spotlightFeedDisplay";

const AUTO_ROTATE_MS = 6000;
const COMPACT_SLIDE_HEIGHT = "h-[13rem]";

const EOM_HISTORY_PATH = "/employee-of-month/history";

function HistoryLink() {
  return (
    <Link
      to={EOM_HISTORY_PATH}
      className="text-[11px] font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
    >
      Past winners
    </Link>
  );
}

function ReadMoreHistoryLink() {
  return (
    <Link
      to={EOM_HISTORY_PATH}
      className="text-[11px] font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
    >
      Read more
    </Link>
  );
}

function CardFooterLinks({ citation }) {
  const needsMore = spotlightFeedNeedsReadMore(citation);
  return (
    <div className="mt-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 pt-3">
      {needsMore ? <ReadMoreHistoryLink /> : null}
      <HistoryLink />
    </div>
  );
}

function ChevronIcon({ direction = "left" }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      {direction === "left" ? (
        <path d="M12.5 4.5 7.5 10l5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7.5 4.5 12.5 10l-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function SlidePagination({ count, activeIndex, onSelect, labelPrefix = "Employee of the Month" }) {
  if (count <= 1) return null;
  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {activeIndex + 1} of {count}
      </p>
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        role="tablist"
        aria-label={`${labelPrefix} pagination`}
      >
        {Array.from({ length: count }, (_, idx) => (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={idx === activeIndex}
            aria-label={`Show winner ${idx + 1} of ${count}`}
            onClick={() => onSelect(idx)}
            className={[
              "h-2.5 rounded-full transition-all",
              idx === activeIndex
                ? "w-7 bg-[#0B3EAF] dark:bg-[#A7D344]"
                : "w-2.5 bg-[#b6c9f5]/70 hover:bg-[#0B3EAF]/60 dark:bg-white/25 dark:hover:bg-[#A7D344]/60",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}

function EmployeeSlideBody({ entry, compact, stableLayout = false }) {
  const emp = entry.employee;
  const img = resolvePublicMediaUrl(entry.image_url || emp.profile_image_url);
  const designation = String(emp.designation || "").trim();
  const department = String(emp.department || "").trim();
  const facility = String(emp.business_unit || "").trim();
  const citation = String(entry.citation || "").trim();

  if (compact) {
    if (stableLayout) {
      return (
        <>
          <div className="mb-4 flex min-h-[6.25rem] items-start gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#A7D344]/50 bg-white shadow-md">
              <img src={img || EMPLOYEE_OF_MONTH_FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-base font-bold text-slate-900 dark:text-white">{emp.name}</p>
              <p className="mt-1 min-h-[1.25rem] text-sm text-slate-700 dark:text-slate-200">
                {designation || "\u00A0"}
              </p>
              <p className="mt-1 min-h-[1rem] text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {[department, facility].filter(Boolean).join(" · ") || "\u00A0"}
              </p>
            </div>
          </div>
          <p
            className={`${SPOTLIGHT_FEED_HOME_DESC_MIN_H} overflow-hidden text-sm leading-relaxed text-slate-700 dark:text-slate-300`}
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
          >
            {citation || "\u00A0"}
          </p>
        </>
      );
    }

    return (
      <>
        <div className="mb-4 flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#A7D344]/50 bg-white shadow-md">
            <img src={img || EMPLOYEE_OF_MONTH_FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-base font-bold text-slate-900 dark:text-white">{emp.name}</p>
            {designation ? (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{designation}</p>
            ) : null}
            {[department, facility].filter(Boolean).length > 0 ? (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {[department, facility].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        {citation ? (
          <p className={`${SPOTLIGHT_FEED_HOME_LINE_CLAMP} text-sm leading-relaxed text-slate-700 dark:text-slate-300`}>{citation}</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-[#A7D344]/60 bg-white shadow-md sm:mx-0">
          <img src={img || EMPLOYEE_OF_MONTH_FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="text-xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">{emp.name}</h2>
          {designation ? (
            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{designation}</p>
          ) : null}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {[department, facility].filter(Boolean).join(" · ")}
          </p>
          {citation ? (
            <p className={`mt-3 ${SPOTLIGHT_FEED_HOME_LINE_CLAMP} text-sm leading-relaxed text-slate-700 dark:text-slate-300`}>{citation}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function normalizeEntries(entry, entries) {
  if (Array.isArray(entries) && entries.length) {
    return entries.filter((item) => item?.employee?.name);
  }
  if (entry?.employee?.name) return [entry];
  return [];
}

function EmployeeOfMonthSlider({ list, activeIndex, onChange, compact }) {
  const touchStartX = useRef(null);
  const hasMultiple = list.length > 1;
  const safeIndex = Math.min(activeIndex, Math.max(list.length - 1, 0));

  const goPrev = useCallback(() => {
    onChange(Math.max(0, safeIndex - 1));
  }, [onChange, safeIndex]);

  const goNext = useCallback(() => {
    onChange(Math.min(list.length - 1, safeIndex + 1));
  }, [list.length, onChange, safeIndex]);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null || !hasMultiple) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = endX - touchStartX.current;
    touchStartX.current = null;
    if (diff > 48) goPrev();
    else if (diff < -48) goNext();
  };

  return (
    <div className={`relative ${hasMultiple ? "px-8 sm:px-9" : ""}`}>
      {hasMultiple ? (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex === 0}
            className="absolute left-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/95 text-[#0B3EAF] shadow-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/95 dark:text-[#A7D344]"
            aria-label="Previous winner"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex >= list.length - 1}
            className="absolute right-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/95 text-[#0B3EAF] shadow-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/95 dark:text-[#A7D344]"
            aria-label="Next winner"
          >
            <ChevronIcon direction="right" />
          </button>
        </>
      ) : null}

      <div
        className={`relative overflow-hidden ${
          compact ? (hasMultiple ? COMPACT_SLIDE_HEIGHT : "") : "min-h-[10rem]"
        }`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={list[safeIndex]?.id ?? safeIndex} className={compact ? "h-full" : undefined}>
          <EmployeeSlideBody entry={list[safeIndex]} compact={compact} stableLayout={hasMultiple} />
        </div>
        {compact && hasMultiple ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

export default function EmployeeOfMonthCard({ entry, entries, loading, compact = false }) {
  const list = useMemo(() => normalizeEntries(entry, entries), [entry, entries]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const safeIndex = list.length ? Math.min(activeIndex, list.length - 1) : 0;
  const current = list[safeIndex];

  useEffect(() => {
    setActiveIndex(0);
  }, [list.length, list[0]?.id, list[1]?.id]);

  useEffect(() => {
    if (list.length <= 1 || paused) return undefined;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const id = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % list.length);
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(id);
  }, [list.length, paused, safeIndex]);

  const pauseProps = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocusCapture: () => setPaused(true),
    onBlurCapture: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
    },
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading Employee of the Month…</p>
      </div>
    );
  }

  if (!current) return null;

  if (compact) {
    return (
      <div
        className={`card group relative overflow-hidden rounded-2xl border-[#0B3EAF]/12 bg-gradient-to-br from-[#eef3ff] via-white to-[#f4fbe8] transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-[#A7D344]/20 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10 ${SPOTLIGHT_FEED_CARD_MIN_H} flex flex-col`}
        {...pauseProps}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
        <EmployeeOfMonthBackgroundStar className="right-10 top-1/2 h-32 w-32 -translate-y-1/2 text-[#0B3EAF]/[0.14] dark:text-[#A7D344]/[0.16]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/75 via-white/55 to-[#eef3ff]/40 dark:from-slate-900/70 dark:via-slate-900/45 dark:to-[#0B3EAF]/10" />

        <div className="relative z-10 flex flex-1 flex-col">
          <div className="mb-4 text-left">
            <h2 className="text-lg font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Employee of the Month</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{current.period_label}</p>
          </div>

          <div className="shrink-0">
            <EmployeeOfMonthSlider
              list={list}
              activeIndex={safeIndex}
              onChange={setActiveIndex}
              compact
            />
          </div>

          <div className="shrink-0">
            <SlidePagination count={list.length} activeIndex={safeIndex} onSelect={setActiveIndex} />
          </div>

          <CardFooterLinks citation={String(current.citation || "").trim()} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="card group no-title-underline relative overflow-hidden rounded-2xl border-[#0B3EAF]/12 bg-gradient-to-br from-[#eef3ff] via-white to-[#f4fbe8] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5 dark:border-[#A7D344]/25 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10"
      {...pauseProps}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
      <EmployeeOfMonthBackgroundStar className="right-4 top-1/2 h-36 w-36 -translate-y-1/2 text-[#0B3EAF]/[0.14] dark:text-[#A7D344]/[0.16]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/80 via-white/60 to-[#eef3ff]/50 dark:from-slate-900/75 dark:via-slate-900/50 dark:to-[#0B3EAF]/10" />

      <div className="relative z-10">
        <div className="mb-3 text-left">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B3EAF] dark:text-[#A7D344]">
            Employee of the Month
          </h2>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{current.period_label}</p>
        </div>

        <EmployeeOfMonthSlider list={list} activeIndex={safeIndex} onChange={setActiveIndex} compact={false} />

        <SlidePagination count={list.length} activeIndex={safeIndex} onSelect={setActiveIndex} />
        <CardFooterLinks citation={String(current.citation || "").trim()} />
      </div>
    </div>
  );
}
