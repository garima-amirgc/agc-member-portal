/**
 * Global decorative band above the footer.
 * Birds sit bottom-right inside this band (no overlap with content).
 */
export default function BottomBirdBand() {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none relative h-[240px] w-full select-none sm:h-[300px]" aria-hidden>
        <img
          src="/agc-birds-accent.png"
          alt=""
          aria-hidden
          className="absolute bottom-0 right-2 h-auto w-[640px] max-w-[95vw] opacity-95 dark:opacity-90 sm:right-4 sm:w-[840px]"
        />
      </div>
    </div>
  );
}

