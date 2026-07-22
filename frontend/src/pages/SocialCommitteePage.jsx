import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

// ─── Video embed ──────────────────────────────────────────────────────────────

function getYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?\s/]+)/);
  return m ? m[1] : null;
}

function VideoEmbed({ url }) {
  const ytId = getYouTubeId(url);
  const isDirectVideo = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url || "");

  if (ytId) {
    return (
      <div className="overflow-hidden rounded-2xl shadow-md">
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Event video"
          />
        </div>
      </div>
    );
  }

  if (isDirectVideo) {
    return (
      <div className="overflow-hidden rounded-2xl shadow-md">
        <video src={url} controls className="w-full" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl shadow-md">
      <div className="aspect-video w-full">
        <iframe src={url} className="h-full w-full" allowFullScreen title="Event video" />
      </div>
    </div>
  );
}

// ─── Gallery slider ───────────────────────────────────────────────────────────

function GallerySlider({ items }) {
  const [idx, setIdx] = useState(0);
  const autoRef = useRef(null);
  const total = items.length;

  const go = (n) => setIdx((i) => (i + n + total) % total);

  useEffect(() => {
    if (total <= 1) return;
    autoRef.current = setInterval(() => go(1), 5000);
    return () => clearInterval(autoRef.current);
  }, [total]);

  const resetAuto = (n) => {
    clearInterval(autoRef.current);
    go(n);
    if (total > 1) autoRef.current = setInterval(() => go(1), 5000);
  };

  if (!total) return null;

  const img = resolvePublicMediaUrl(items[idx].image_url);

  return (
    <div className="overflow-hidden rounded-2xl shadow-md">
      <div className="relative w-full bg-slate-900" style={{ aspectRatio: "16/7" }}>
        {img && (
          <img
            key={img}
            src={img}
            alt="Gallery"
            className="h-full w-full object-cover transition-opacity duration-500"
          />
        )}

        {total > 1 && (
          <>
            <button
              onClick={() => resetAuto(-1)}
              aria-label="Previous"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              onClick={() => resetAuto(1)}
              aria-label="Next"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6" /></svg>
            </button>

            <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { clearInterval(autoRef.current); setIdx(i); }}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Winner card ──────────────────────────────────────────────────────────────

const TIER_ICON  = { Gold: "🥇", Silver: "🥈", Bronze: "🥉" };
const TIER_COLOR = {
  Gold:   "border-amber-300 bg-amber-50 dark:bg-amber-900/20",
  Silver: "border-slate-300 bg-slate-50 dark:bg-slate-800/40",
  Bronze: "border-orange-300 bg-orange-50 dark:bg-orange-900/20",
};

function WinnerCard({ winner }) {
  const img      = resolvePublicMediaUrl(winner.image_url);
  const tierIcon = TIER_ICON[winner.tier];
  const tierRing = winner.tier ? TIER_COLOR[winner.tier] : "border-amber-300/60 bg-slate-100 dark:bg-slate-700";

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
      {/* Badge chip */}
      {tierIcon && (
        <span className="mb-2 rounded-full border border-current/10 bg-slate-100 px-2.5 py-0.5 text-sm font-bold dark:bg-slate-800">
          {tierIcon} {winner.tier}
        </span>
      )}

      {/* Photo */}
      <div className="relative mb-3 h-24 w-24 shrink-0">
        <div className={`h-full w-full overflow-hidden rounded-full border-4 shadow-md ${tierRing}`}>
          {img ? (
            <img src={img} alt={winner.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">
              {String(winner.name)[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm shadow">
          {tierIcon || "🏆"}
        </span>
      </div>

      <p className="font-bold text-slate-900 dark:text-white">{winner.name}</p>
      {winner.award && (
        <p className="mt-0.5 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{winner.award}</p>
      )}
    </div>
  );
}

// ─── Event section ────────────────────────────────────────────────────────────

function EventSection({ event }) {
  const hasImages = event.images?.length > 0;
  const hasWinners = event.winners?.length > 0;
  const hasVideo = !!event.video_url;

  if (!hasImages && !hasWinners && !hasVideo) return null;

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
      {/* Event header */}
      <div>
        {event.event_date && (
          <p className="text-xs font-bold uppercase tracking-widest text-[#0B3EAF] dark:text-[#A7D344]">
            {new Date(event.event_date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        )}
        <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{event.title}</h2>
        {event.description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.description}</p>
        )}
      </div>

      {/* Winners — 3 per row */}
      {hasWinners && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            🏆 Winners
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {event.winners.map((w) => <WinnerCard key={w.id} winner={w} />)}
          </div>
        </div>
      )}

      {/* Full-width gallery slider */}
      {hasImages && <GallerySlider items={event.images} />}

      {/* Video */}
      {hasVideo && <VideoEmbed url={event.video_url} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialCommitteePage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/social/events")
      .then((r) => setEvents(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoading(false));
  }, []);

  const visibleEvents = events.filter(
    (e) => e.images?.length > 0 || e.winners?.length > 0 || e.video_url
  );

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Social Committee" />

      {loading && (
        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {!loading && visibleEvents.length === 0 && (
        <div className="card py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Nothing posted yet — check back soon!
        </div>
      )}

      {!loading && visibleEvents.length > 0 && (
        <div className="space-y-8">
          {visibleEvents.map((ev) => <EventSection key={ev.id} event={ev} />)}
        </div>
      )}
    </main>
  );
}
