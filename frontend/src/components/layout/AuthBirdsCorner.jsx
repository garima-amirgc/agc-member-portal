/**
 * Decorative birds anchored to the bottom-right of auth screens.
 * Sits behind content; only the image is hover-interactive.
 */
export default function AuthBirdsCorner() {
  return (
    <div className="absolute bottom-0 right-0 z-0 select-none" aria-hidden>
      <img
        src="/agc-birds-accent-transparent.png"
        alt=""
        aria-hidden
        className="pointer-events-auto h-auto w-[520px] max-w-[85vw] opacity-95 drop-shadow-[0_8px_24px_rgba(11,62,175,0.10)] sm:w-[640px] lg:w-[760px]"
      />
    </div>
  );
}

