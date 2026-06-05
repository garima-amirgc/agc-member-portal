import { useEffect } from "react";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import CelebrationConfetti from "./CelebrationConfetti";

const FALLBACK_AVATAR_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#e8eefc"/>
      <stop offset="1" stop-color="#fff6e8"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" rx="40" fill="url(#g)"/>
  <circle cx="320" cy="250" r="110" fill="#0B3EAF" opacity="0.15"/>
  <path d="M210 520c26-86 90-132 110-132s84 46 110 132" fill="#0B3EAF" opacity="0.15"/>
</svg>`);

function PartyPopper({ className = "" }) {
  return (
    <span
      className={`celebration-popper inline-block text-4xl sm:text-5xl ${className}`}
      role="img"
      aria-hidden
    >
      🎉
    </span>
  );
}

export default function BirthdayPopupModal({ open, onClose, person, celebrationKind = "birthday" }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const name = String(person?.name || "—").trim() || "—";
  const organization = String(person?.facility_name || person?.company_name || "").trim();
  const photo = resolvePublicMediaUrl(person?.profile_image_url) || FALLBACK_AVATAR_SVG;
  const isAnniversary = celebrationKind === "anniversary";
  const years = Number(person?.years_employed);
  const yearsLine =
    isAnniversary && Number.isFinite(years) && years >= 1
      ? `${years} year${years === 1 ? "" : "s"} with the AGC Group`
      : null;
  const titleId = isAnniversary ? "anniversary-popup-title" : "birthday-popup-title";
  const headline = isAnniversary ? "Work anniversary!" : "Happy Birthday!";
  const subline = isAnniversary
    ? "Thank you for your dedication and contributions!"
    : "The AGC Group wishes you a wonderful day!";

  return (
    <div
      className="celebration-modal-backdrop fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <CelebrationConfetti active density={56} />

      <div
        className={`celebration-modal-card relative w-full max-w-lg overflow-hidden rounded-3xl border-2 shadow-[0_24px_80px_rgba(11,62,175,0.35)] ring-4 sm:max-w-xl ${
          isAnniversary
            ? "border-[#A7D344]/50 bg-gradient-to-br from-[#f0f7e8] via-[#fffef5] to-[#eef2fb] ring-[#A7D344]/25 dark:from-[#1a2410] dark:via-[#141414] dark:to-[#0f1729] dark:ring-[#A7D344]/15"
            : "border-[#ffcad8]/60 bg-gradient-to-br from-[#fff0f5] via-[#fffaf0] to-[#eef8ff] ring-[#ff9ec5]/30 dark:from-[#2a1520] dark:via-[#141414] dark:to-[#0f1729] dark:ring-[#ff6b9d]/15"
        }`}
      >
        <CelebrationConfetti active density={32} />

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#0B3EAF] via-[#A7D344] to-[#E02B20]"
          aria-hidden
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-xl font-bold text-slate-600 shadow-md transition hover:scale-105 hover:bg-white dark:border-white/20 dark:bg-slate-900/90 dark:text-white"
          aria-label="Close celebration"
        >
          ×
        </button>

        <PartyPopper className="absolute left-3 top-3 z-20" />
        <PartyPopper className="absolute right-14 top-2 z-20 [animation-delay:0.35s]" />
        <span
          className="celebration-sparkle absolute left-[18%] top-[42%] text-2xl opacity-80"
          aria-hidden
        >
          ✨
        </span>
        <span
          className="celebration-sparkle absolute right-[20%] top-[38%] text-xl opacity-80 [animation-delay:0.5s]"
          aria-hidden
        >
          ✨
        </span>
        <span className="absolute bottom-4 left-4 text-3xl opacity-90 motion-reduce:animate-none" aria-hidden>
          🎊
        </span>
        <span
          className="absolute bottom-5 right-5 text-3xl opacity-90 motion-reduce:animate-none [animation-delay:0.2s]"
          aria-hidden
        >
          🎊
        </span>

        <div className="relative z-10 px-6 pb-8 pt-10 text-center sm:px-8 sm:pb-10 sm:pt-12">
          <div
            className={`celebration-badge mx-auto mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${
              isAnniversary
                ? "bg-[#A7D344]/25 text-[#2d5016] dark:bg-[#A7D344]/20 dark:text-[#d4f5a0]"
                : "bg-[#ffcad8]/50 text-[#8b2942] dark:bg-[#ff6b9d]/20 dark:text-[#ffc4d6]"
            }`}
          >
            <span aria-hidden>{isAnniversary ? "🏆" : "🎂"}</span>
            Let&apos;s celebrate
          </div>

          <div className="relative mx-auto mb-5 h-[120px] w-[120px] sm:h-[132px] sm:w-[132px]">
            <div
              className={`celebration-avatar-ring absolute inset-0 rounded-full ${
                isAnniversary ? "bg-[#A7D344]/30" : "bg-[#ff9ec5]/40"
              }`}
              aria-hidden
            />
            <div className="absolute inset-2 overflow-hidden rounded-full border-4 border-white bg-white shadow-lg dark:border-white/20 dark:bg-slate-800">
              <img src={photo} alt="" className="h-full w-full object-cover object-center" />
            </div>
          </div>

          <h2
            id={titleId}
            className="celebration-headline font-[cursive] text-4xl leading-tight text-[#0B3EAF] dark:text-[#A7D344] sm:text-5xl"
          >
            {headline}
          </h2>

          <p className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{name}</p>

          {organization ? (
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-[#0B3EAF]/80 dark:text-[#A7D344]/90">
              {organization}
            </p>
          ) : null}

          {yearsLine ? (
            <p className="mt-3 inline-block rounded-full bg-[#0B3EAF]/10 px-4 py-1.5 text-sm font-bold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
              {yearsLine}
            </p>
          ) : null}

          <p className="mx-auto mt-5 max-w-md text-base font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
            {subline}
          </p>

          <button type="button" onClick={onClose} className="btn-primary mt-8 min-w-[10rem] px-8">
            Celebrate! 🎉
          </button>
        </div>
      </div>
    </div>
  );
}
