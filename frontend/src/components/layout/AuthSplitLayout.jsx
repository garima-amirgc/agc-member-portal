import AuthBirdsCorner from "./AuthBirdsCorner";

/** White form card — matches login overlap layout */
export const AUTH_FORM_CARD =
  "w-full min-w-0 rounded-2xl border border-black/[0.07] bg-white px-5 py-7 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:px-8 sm:py-9 md:px-9 md:py-10 lg:rounded-[1.75rem] lg:px-10 lg:py-11 lg:shadow-[0_16px_56px_rgba(11,62,175,0.2),0_6px_24px_rgba(15,23,42,0.1)] dark:lg:shadow-[0_20px_60px_rgba(0,0,0,0.55)]";

const HERO_PANEL =
  "agc-login-hero relative isolate z-0 order-1 flex w-full min-w-0 flex-col gap-6 overflow-hidden rounded-2xl px-6 py-8 pb-28 shadow-[0_20px_60px_rgba(11,62,175,0.35)] sm:gap-7 sm:rounded-3xl sm:px-8 sm:py-10 sm:pb-32 md:px-10 md:py-11 lg:order-none lg:min-h-[min(540px,88vh)] lg:w-[min(100%,520px)] lg:flex-shrink-0 lg:rounded-l-[1.75rem] lg:rounded-r-none lg:px-10 lg:py-11 lg:pr-24 lg:pb-11 xl:pr-28";

const FORM_WRAP =
  "relative z-20 order-2 w-full min-w-0 max-w-full lg:order-none lg:-ml-20 lg:max-w-[min(100%,440px)] lg:flex-shrink-0 lg:self-center lg:-translate-y-1 xl:-ml-24 xl:max-w-[460px]";

function HeroBackdrop() {
  return (
    <>
      <AuthBirdsCorner placement="hero" />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B3EAF] via-[#0a3494] to-[#061f5c]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-[#4a7eef]/20 blur-3xl sm:h-72 sm:w-72"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl sm:h-80 sm:w-80"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[18%] right-[12%] h-40 w-40 rounded-full bg-brand-green/12 blur-2xl sm:h-48 sm:w-48"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 14px,
                rgba(255,255,255,0.06) 14px,
                rgba(255,255,255,0.06) 28px
              )`,
        }}
        aria-hidden
      />
    </>
  );
}

/** Brand accent bars at bottom of hero panel */
export function AuthHeroAccentBars() {
  return (
    <div className="relative z-10 mt-1 flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
      <span className="h-2 w-8 rounded-full bg-brand-green shadow-sm shadow-black/20 sm:w-9" />
      <span className="h-2 w-8 rounded-full bg-white/90 shadow-sm shadow-black/10 sm:w-9" />
      <span className="h-2 w-8 rounded-full bg-brand-red shadow-sm shadow-black/20 sm:w-9" />
    </div>
  );
}

/**
 * Split auth screen: blue hero (left, rounded left only on desktop) + overlapping white card.
 */
export default function AuthSplitLayout({ hero, children, heroHeadingId, contentPy = "lg:py-10" }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#eef2fb] via-[#f4f6fb] to-[#e2e8f3] dark:from-[#0a0a0a] dark:via-[#0c0c0c] dark:to-[#111111]">
      <div
        className={`mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col justify-center gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-10 md:px-8 lg:gap-0 lg:px-8 ${contentPy} xl:px-10`}
      >
        <div className="flex w-full min-w-0 flex-col justify-center gap-5 overflow-visible sm:gap-6 lg:relative lg:mx-auto lg:max-w-[min(100%,940px)] lg:flex-row lg:items-center lg:justify-center lg:gap-0">
          <section className={HERO_PANEL} aria-labelledby={heroHeadingId}>
            <HeroBackdrop />
            {hero}
          </section>
          <div className={FORM_WRAP}>{children}</div>
        </div>
      </div>
      <div className="absolute bottom-0 right-0 z-10 hidden lg:block">
        <AuthBirdsCorner placement="band" />
      </div>
    </div>
  );
}
