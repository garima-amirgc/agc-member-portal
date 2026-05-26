/**
 * Decorative birds anchored to the bottom-right of auth screens.
 * Sits behind content; only the image is hover-interactive.
 */
export default function AuthBirdsCorner() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 right-0 z-0 h-[100px] w-[min(92vw,340px)] overflow-hidden select-none sm:h-[120px] sm:w-[min(92vw,420px)] lg:h-[135px] lg:w-[480px]"
      aria-hidden
    >
      <img
        src="/mp-birds.png"
        alt=""
        aria-hidden
        className="absolute bottom-0 right-0 h-full w-auto max-w-none opacity-95 drop-shadow-[0_8px_24px_rgba(11,62,175,0.10)]"
      />
    </div>
  );
}

