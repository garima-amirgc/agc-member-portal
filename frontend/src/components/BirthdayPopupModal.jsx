import { useEffect } from "react";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

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
  <circle cx="320" cy="250" r="78" fill="#0B3EAF" opacity="0.25"/>
  <path d="M192 520c34-110 110-168 128-168s94 58 128 168" fill="#0B3EAF" opacity="0.25"/>
</svg>`);

export default function BirthdayPopupModal({ open, onClose, person }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const name = String(person?.name || "—").trim() || "—";
  const organization = String(person?.facility_name || person?.company_name || "").trim();
  const photo = resolvePublicMediaUrl(person?.profile_image_url) || FALLBACK_AVATAR_SVG;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="birthday-popup-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#e8b6c6]/50 bg-gradient-to-br from-[#fff7fb] via-[#fff2ea] to-[#eef8ff] p-4 shadow-2xl ring-1 ring-white/60 dark:border-white/10 dark:from-white/5 dark:via-white/5 dark:to-white/5 dark:ring-white/5 sm:p-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full text-[#6b4a55]/80 transition hover:bg-white/50 hover:text-[#4b2a35] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF] dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white"
          aria-label="Close"
        >
          <span className="text-3xl leading-none font-black tracking-tight" aria-hidden>
            ×
          </span>
        </button>

        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.65]">
          <div className="absolute -left-10 -top-14 h-32 w-32 rounded-full bg-[#ffcad8]/70 blur-2xl" />
          <div className="absolute -right-12 -top-10 h-36 w-36 rounded-full bg-[#d7f3ff]/70 blur-2xl" />
          <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-[#fff0b8]/70 blur-2xl" />
          <div className="absolute -right-14 top-1/3 h-44 w-44 rounded-full bg-[#d7f3ff]/60 blur-2xl dark:opacity-40" />
          <div className="absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-[#ffcad8]/60 blur-2xl dark:opacity-40" />
        </div>

        <div className="relative z-10 grid gap-6 sm:grid-cols-[auto,1fr] sm:items-center">
          <div className="flex justify-center sm:justify-start">
            <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border-2 border-white/90 bg-white/80 shadow-sm ring-2 ring-[#e8b6c6]/45 dark:border-white/15 dark:bg-white/10 dark:ring-white/10 sm:h-[100px] sm:w-[100px]">
              <img src={photo} alt="" className="h-full w-full object-cover object-center" />
            </div>
          </div>

          <div className="min-w-0 space-y-3 pr-10 text-center sm:text-left">
            <div id="birthday-popup-title" className="font-[cursive] text-3xl leading-tight text-[#0B3EAF] dark:text-[#A7D344] sm:text-4xl">
              Happy Birthday
            </div>
            <div className="text-base font-bold text-[#0B3EAF] sm:text-lg dark:text-[#A7D344]">{name}</div>
            {organization ? (
              <div className="text-sm font-semibold uppercase tracking-wide text-[#6b4a55] dark:text-slate-300">
                {organization}
              </div>
            ) : null}
            <p className="pt-1 text-base font-semibold leading-relaxed text-[#6b4a55] dark:text-slate-200">
              The AGC Group wishes you a very Happy Birthday!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
