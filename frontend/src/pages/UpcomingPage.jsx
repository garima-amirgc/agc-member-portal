import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { getEventTimeIso } from "../utils/eventDate";

function formatEventWhen(ev) {
  const iso = getEventTimeIso(ev);
  return iso ? new Date(iso).toLocaleString() : "Schedule TBD";
}

function eventSortValue(ev) {
  const iso = getEventTimeIso(ev);
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

function eventIdentity(ev) {
  if (ev?.id != null) return `id:${ev.id}`;
  return [
    ev?.title || "",
    getEventTimeIso(ev) || "",
    ev?.business_unit || "",
    ev?.detail || "",
  ].join("|");
}

function uniqueSortedEvents(events) {
  const byKey = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const key = eventIdentity(event);
    if (!byKey.has(key)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

function useUpcomingEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get("/upcoming/feed")
      .then((r) => {
        if (!alive) return;
        setEvents(Array.isArray(r.data) ? r.data : []);
      })
      .catch((err) => {
        if (!alive) return;
        console.warn("Upcoming feed failed:", err.response?.status, err.response?.data ?? err.message);
        setEvents([]);
        setError("Could not load upcoming events.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sortedEvents = useMemo(() => uniqueSortedEvents(events), [events]);
  return { events: sortedEvents, loading, error };
}

function UpcomingCard({ event, onClick }) {
  const img = resolvePublicMediaUrl(event?.image_url);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF] dark:border-white/10 dark:bg-[#101010]"
    >
      {img ? (
        <div className="flex h-44 w-full items-center justify-center border-b border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <img src={img} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start gap-2">
          {event?.business_unit ? (
            <span className="rounded-md bg-[#0B3EAF]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
              {event.business_unit}
            </span>
          ) : null}
          <h2 className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 dark:text-white">
            {event?.title || "Untitled event"}
          </h2>
        </div>
        <p className="text-xs font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{formatEventWhen(event)}</p>
        {event?.detail ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{event.detail}</p>
        ) : null}
      </div>
    </button>
  );
}

function EventDetail({ event }) {
  const img = resolvePublicMediaUrl(event.image_url);
  return (
    <section className="card overflow-hidden p-0">
      {img ? (
        <div className="flex max-h-80 w-full items-center justify-center border-b border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
          <img src={img} alt="" className="max-h-72 max-w-full object-contain" />
        </div>
      ) : null}
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B3EAF] dark:text-[#A7D344]">
            Upcoming
          </p>
          <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900 dark:text-white">
            {event.title || "Untitled event"}
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{formatEventWhen(event)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {event.business_unit ? (
            <span className="rounded-md bg-[#0B3EAF]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
              {event.business_unit}
            </span>
          ) : null}
        </div>

        {event.detail ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{event.detail}</p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No additional details were added for this event.</p>
        )}
      </div>
    </section>
  );
}

export default function UpcomingPage() {
  const navigate = useNavigate();
  const { events, loading, error } = useUpcomingEvents();

  const openEvent = (event) => {
    if (event?.id == null) return;
    navigate(`/upcoming/${encodeURIComponent(String(event.id))}`);
  };

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Upcoming" />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <section className="card text-sm text-slate-600 dark:text-slate-300">Loading upcoming events…</section>
      ) : events.length === 0 ? (
        <section className="card text-sm text-slate-600 dark:text-slate-300">No upcoming events right now.</section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <UpcomingCard key={eventIdentity(event)} event={event} onClick={() => openEvent(event)} />
          ))}
        </section>
      )}
    </main>
  );
}

export function UpcomingEventDetailPage() {
  const { eventId } = useParams();
  const { events, loading, error } = useUpcomingEvents();
  const event = useMemo(
    () => events.find((item) => String(item.id) === String(eventId)),
    [eventId, events]
  );

  return (
    <main className={PAGE_SHELL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Upcoming" />
        <Link
          to="/upcoming"
          className="text-sm font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
        >
          Back to all upcoming events
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <section className="card text-sm text-slate-600 dark:text-slate-300">Loading event details…</section>
      ) : event ? (
        <EventDetail event={event} />
      ) : (
        <section className="card text-sm text-slate-600 dark:text-slate-300">
          This upcoming event could not be found.
        </section>
      )}
    </main>
  );
}
