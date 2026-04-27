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

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

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

  const name = String(person?.name || "—");
  const designation = String(person?.department || "").trim() || "Team member";
  const photo = resolvePublicMediaUrl(person?.profile_image_url) || FALLBACK_AVATAR_SVG;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-[#101010] dark:ring-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Birthday</div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[150px,1fr]">
            {/* Left: single photo block */}
            <div className="relative overflow-hidden rounded-2xl border border-[#e8b6c6]/50 bg-gradient-to-br from-[#fff7fb] via-[#fff2ea] to-[#eef8ff] ring-1 ring-white/60 dark:border-white/10 dark:from-white/5 dark:via-white/5 dark:to-white/5 dark:ring-white/5">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.65]">
                <div className="absolute -left-10 -top-14 h-32 w-32 rounded-full bg-[#ffcad8]/70 blur-2xl" />
                <div className="absolute -right-12 -top-10 h-36 w-36 rounded-full bg-[#d7f3ff]/70 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-[#fff0b8]/70 blur-2xl" />
              </div>
              <div className="p-2.5">
                <div className="aspect-[3/4] w-full overflow-hidden rounded-xl bg-white/60 ring-1 ring-white/60 dark:bg-white/5 dark:ring-white/10">
                  <div className="flex h-full w-full items-center justify-center">
                    <img src={photo} alt={name} className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: text */}
            <div className="relative overflow-hidden rounded-2xl border border-[#e8b6c6]/50 bg-gradient-to-br from-[#fff7fb] via-[#fff1ea] to-[#eef8ff] p-4 sm:p-5 ring-1 ring-white/60 dark:border-white/10 dark:from-white/5 dark:via-white/5 dark:to-white/5 dark:ring-white/5">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.55]">
                <div className="absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#d7f3ff]/70 blur-2xl" />
                <div className="absolute -left-12 -bottom-14 h-44 w-44 rounded-full bg-[#ffcad8]/70 blur-2xl" />
              </div>

              <div className="font-[cursive] text-5xl sm:text-6xl leading-none text-[#5a3340] dark:text-white">
                Happy Birthday
              </div>

              <div className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-white/60 dark:bg-white/5 dark:ring-white/10">
                <div className="text-sm font-extrabold uppercase tracking-wide text-[#4b2a35] dark:text-white">
                  {name}
                </div>
                <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[#6b4a55] dark:text-white/80">
                  {designation}
                </div>
              </div>

              <div className="mt-3 text-sm font-semibold text-[#6b4a55] dark:text-slate-200">
                Wishing you a beautiful day with good health and happiness forever.
              </div>

              <div className={cn("mt-3 text-xs font-semibold text-[#6b4a55] dark:text-slate-300")}>
                {person?.facility_name ? (
                  <div>
                    <span className="font-semibold">Facility:</span> {person.facility_name}
                  </div>
                ) : null}
                {person?.label ? (
                  <div className="mt-1">
                    <span className="font-semibold">Date:</span> {person.label}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

