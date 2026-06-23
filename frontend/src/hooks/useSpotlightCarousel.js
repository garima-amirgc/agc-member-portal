import { useEffect, useState } from "react";

export const SPOTLIGHT_AUTO_ROTATE_MS = 6000;
export const SPOTLIGHT_COMPACT_SLIDE_HEIGHT = "h-[13rem]";

export function useSpotlightCarousel(itemCount, resetKeys = []) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const safeIndex = itemCount ? Math.min(activeIndex, itemCount - 1) : 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [itemCount, ...resetKeys]);

  useEffect(() => {
    if (itemCount <= 1 || paused) return undefined;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const id = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % itemCount);
    }, SPOTLIGHT_AUTO_ROTATE_MS);

    return () => window.clearInterval(id);
  }, [itemCount, paused, safeIndex]);

  const pauseProps = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocusCapture: () => setPaused(true),
    onBlurCapture: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
    },
  };

  return { activeIndex, setActiveIndex, safeIndex, pauseProps };
}
