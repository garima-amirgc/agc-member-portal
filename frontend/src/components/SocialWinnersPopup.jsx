import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const SESSION_KEY = "agc_social_winners_seen";

function getSeenIds() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markSeen(ids) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ids));
  } catch {}
}

function TrophyIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export default function SocialWinnersPopup() {
  const [winners, setWinners] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/social/winners").then(({ data }) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const seen = getSeenIds();
      const unseen = data.filter((w) => !seen.includes(w.id));
      if (unseen.length === 0) return;
      setWinners(unseen);
      setOpen(true);
    }).catch(() => {});
  }, []);

  function close() {
    markSeen([...getSeenIds(), ...winners.map((w) => w.id)]);
    setOpen(false);
  }

  if (!open || winners.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-end justify-center p-4 sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/50" onClick={close} />
      {/* Card */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-[#0B3EAF] to-[#1a50c8] p-4 text-white dark:from-[#0B3EAF] dark:to-[#153092]">
          <TrophyIcon />
          <h2 className="text-base font-bold">🏆 Social Committee Winners</h2>
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Winners list */}
        <div className="max-h-80 overflow-y-auto p-4 space-y-3">
          {winners.map((w) => {
            const img = resolvePublicMediaUrl(w.image_url);
            return (
              <div key={w.id} className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-amber-300 bg-slate-100 dark:bg-slate-800">
                  {img ? (
                    <img src={img} alt={w.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                      {String(w.name)[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900 dark:text-white text-sm">{w.name}</p>
                  {w.award && <p className="truncate text-xs font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{w.award}</p>}
                  {w.event_name && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{w.event_name}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 p-3 dark:border-slate-800">
          <Link
            to="/social-committee"
            onClick={close}
            className="text-xs font-semibold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
          >
            View Social Committee →
          </Link>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
