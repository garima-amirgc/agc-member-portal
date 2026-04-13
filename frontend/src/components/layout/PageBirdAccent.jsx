/**
 * Decorative chickens graphic — bottom-right on authenticated main pages.
 * Asset: /agc-birds-accent.png (transparent PNG).
 */
export default function PageBirdAccent() {
  return (
    <img
      src="/agc-birds-accent.png"
      alt=""
      className="pointer-events-none fixed bottom-14 right-2 z-[2] h-auto max-h-[min(5.5rem,18vw)] w-auto max-w-[min(180px,38vw)] select-none opacity-95 sm:bottom-16 sm:right-4 sm:max-h-[min(6.25rem,15vw)] dark:opacity-90"
      aria-hidden
    />
  );
}
