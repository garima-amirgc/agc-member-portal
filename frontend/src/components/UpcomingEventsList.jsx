import { useNavigate } from "react-router-dom";
import { getEventTimeIso } from "../utils/eventDate";
import { IconCalendar } from "./layout/SidebarIcons";

const MAX_ITEMS = 5;

function dateBadgeParts(d) {
  if (!d || Number.isNaN(d.getTime())) return { month: "", day: "" };
  return {
    month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function formatTimeRange(startIso, endIso) {
  if (!startIso) return "Date TBA";
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "Date TBA";
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!endIso) return startLabel;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return startLabel;
  const sameDay = start.toDateString() === end.toDateString();
  if (!sameDay) return startLabel;
  return `${startLabel} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function buildItems(events) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return (events || [])
    .map((ev) => {
      const iso = getEventTimeIso(ev);
      if (!iso) return null;
      const date = new Date(iso);
      // Keep event visible if end_at is set and still in the future,
      // even if the event itself has already passed.
      const endAt = ev.end_at ? new Date(ev.end_at) : null;
      const visibleUntil = endAt && !Number.isNaN(endAt.getTime()) ? endAt : null;
      const isStillVisible = date >= today || (visibleUntil && visibleUntil > now);
      if (!isStillVisible) return null;
      return {
        key: `event-${ev.id}`,
        date,
        title: ev.title,
        sub: formatTimeRange(iso, ev.end_at),
        detail: ev.detail || "",
        to: `/upcoming/${encodeURIComponent(String(ev.id))}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_ITEMS);
}

export default function UpcomingEventsList({ events, loading }) {
  const navigate = useNavigate();
  const items = buildItems(events);

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading upcoming events…</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">No upcoming events right now.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const { month, day } = dateBadgeParts(item.date);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700"
          >
            <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-slate-200 py-1 dark:border-slate-700">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                {month}
              </span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">{day}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">{item.sub}</p>
              {item.detail ? (
                <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{item.detail}</p>
              ) : null}
            </div>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]"
              aria-hidden
            >
              <IconCalendar className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
