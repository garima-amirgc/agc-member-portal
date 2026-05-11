/**
 * Global decorative band above the footer.
 * Birds sit bottom-right inside this band (no overlap with content).
 */
export default function BottomBirdBand() {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none relative h-[80px] w-full select-none sm:h-[110px]" aria-hidden>
        <img
          src="/agc-birds-accent.png"
          alt=""
          aria-hidden
          className="absolute bottom-0 right-2 h-auto w-[420px] max-w-[92vw] opacity-90 dark:opacity-80 sm:right-4 sm:w-[560px]"
        />
      </div>
    </div>
  );
}

