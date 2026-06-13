import { useCallback, useRef } from "react";
import { SPOTLIGHT_COMPACT_SLIDE_HEIGHT } from "../hooks/useSpotlightCarousel";

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

export function SpotlightSlidePagination({
  count,
  activeIndex,
  onSelect,
  labelPrefix = "Spotlight slide",
}) {
  if (count <= 1) return null;
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
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
            aria-label={`Show slide ${idx + 1} of ${count}`}
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

export default function SpotlightCardSlider({
  itemCount,
  activeIndex,
  onChange,
  compact = false,
  slideKey,
  children,
  paginationLabel,
}) {
  const touchStartX = useRef(null);
  const hasMultiple = itemCount > 1;
  const safeIndex = Math.min(activeIndex, Math.max(itemCount - 1, 0));

  const goPrev = useCallback(() => {
    onChange(Math.max(0, safeIndex - 1));
  }, [onChange, safeIndex]);

  const goNext = useCallback(() => {
    onChange(Math.min(itemCount - 1, safeIndex + 1));
  }, [itemCount, onChange, safeIndex]);

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
    <>
      <div className={`relative shrink-0 ${hasMultiple ? "px-8 sm:px-9" : ""}`}>
        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={safeIndex === 0}
              className="absolute left-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/95 text-[#0B3EAF] shadow-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/95 dark:text-[#A7D344]"
              aria-label="Previous slide"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={safeIndex >= itemCount - 1}
              className="absolute right-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#b6c9f5]/50 bg-white/95 text-[#0B3EAF] shadow-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/15 dark:bg-slate-900/95 dark:text-[#A7D344]"
              aria-label="Next slide"
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        ) : null}

        <div
          className={`overflow-hidden ${compact && hasMultiple ? SPOTLIGHT_COMPACT_SLIDE_HEIGHT : ""}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div key={slideKey ?? safeIndex}>{children}</div>
        </div>
      </div>

      <div className="shrink-0">
        <SpotlightSlidePagination
          count={itemCount}
          activeIndex={safeIndex}
          onSelect={onChange}
          labelPrefix={paginationLabel}
        />
      </div>
    </>
  );
}
