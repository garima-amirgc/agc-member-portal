import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function TrophyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export default function SocialWinnersSidebarWidget() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/social/winners").then(({ data }) => {
      setWinners(Array.isArray(data) ? data.slice(0, 5) : []);
    }).catch(() => setWinners([])).finally(() => setLoading(false));
  }, []);

  if (!loading && winners.length === 0) return null;

  return (
    <div className="card no-title-underline rounded-2xl p-3 sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrophyIcon />
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Social Winners
          </h3>
        </div>
        <Link
          to="/social-committee"
          className="text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {winners.map((w) => {
            const img = resolvePublicMediaUrl(w.image_url);
            return (
              <div key={w.id} className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-amber-200 bg-slate-100 dark:bg-slate-800">
                  {img ? (
                    <img src={img} alt={w.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                      {String(w.name)[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{w.name}</p>
                  {w.award && <p className="truncate text-[10px] text-[#0B3EAF] dark:text-[#A7D344]">{w.award}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
