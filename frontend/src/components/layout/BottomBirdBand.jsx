export default function BottomBirdBand() {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none relative h-[80px] w-full select-none sm:h-[110px]" aria-hidden>
        <div className="absolute bottom-0 right-2 h-full w-[min(92vw,320px)] overflow-hidden sm:right-4 sm:w-[min(92vw,400px)]">
          <img
            src="/mp-birds.png"
            alt=""
            aria-hidden
            className="absolute bottom-0 right-0 h-full w-auto max-w-none opacity-90 dark:opacity-80"
          />
        </div>
      </div>
    </div>
  );
}

