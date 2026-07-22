import { useNavigate } from "react-router-dom";
import { getEventTimeIso } from "../utils/eventDate";
import { IconCalendar } from "./layout/SidebarIcons";

const MAX_ITEMS = 6;

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

function buildSplitItems(events) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayItems = [];
  const ongoingItems = [];
  const upcomingItems = [];

  for (const ev of events || []) {
    const iso = getEventTimeIso(ev);
    if (!iso) continue;
    const eventDate = new Date(iso);
    if (Number.isNaN(eventDate.getTime())) continue;

    const hideAt = ev.end_at ? new Date(ev.end_at) : null;
    const hasValidHide = hideAt && !Number.isNaN(hideAt.getTime());

    const eventEnd = ev.event_end_at ? new Date(ev.event_end_at) : null;
    const hasValidEventEnd = eventEnd && !Number.isNaN(eventEnd.getTime());

    // Skip fully past events (use hide date if set, otherwise fall back to event start)
    const isStillVisible = eventDate >= today || (hasValidHide && hideAt > now) || (hasValidEventEnd && eventEnd > now);
    if (!isStillVisible) continue;

    const item = {
      key: `event-${ev.id}`,
      date: eventDate,
      title: ev.title,
      sub: formatTimeRange(iso, ev.end_at),
      detail: ev.detail || "",
      to: `/upcoming/${encodeURIComponent(String(ev.id))}`,
    };

    // Ongoing: event started in the past AND event_end_at is still in the future
    const isOngoing = eventDate < today && hasValidEventEnd && eventEnd > now;
    // Today: event_at date is today
    const isToday = eventDate >= today && eventDate < tomorrow;

    if (isToday && !isOngoing) {
      todayItems.push(item);
    } else if (isOngoing) {
      ongoingItems.push(item);
    } else {
      upcomingItems.push(item);
    }
  }

  const sort = (arr) => arr.sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    today: sort(todayItems),
    ongoing: sort(ongoingItems),
    upcoming: sort(upcomingItems).slice(0, MAX_ITEMS),
  };
}

function SectionLabel({ label, color = "blue" }) {
  const dot = color === "green" ? "bg-[#A7D344]" : "bg-[#0B3EAF]";
  const text = color === "green" ? "text-[#5a7d1a] dark:text-[#A7D344]" : "text-[#0B3EAF] dark:text-[#A7D344]";
  return (
    <div className="flex items-center gap-1.5 pb-0.5 pt-1">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${text}`}>{label}</span>
    </div>
  );
}

function EventRow({ item, navigate }) {
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
}

export default function UpcomingEventsList({ events, loading }) {
  const navigate = useNavigate();
  const { today, ongoing, upcoming } = buildSplitItems(events);
  const total = today.length + ongoing.length + upcoming.length;

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading upcoming events…</p>;
  }
  if (total === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">No upcoming events right now.</p>;
  }

  return (
    <div className="space-y-1">
      {today.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Today" color="green" />
          {today.map((item) => <EventRow key={item.key} item={item} navigate={navigate} />)}
        </div>
      )}
      {ongoing.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Ongoing" color="blue" />
          {ongoing.map((item) => <EventRow key={item.key} item={item} navigate={navigate} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          {(today.length > 0 || ongoing.length > 0) && <SectionLabel label="Upcoming" color="blue" />}
          {upcoming.map((item) => <EventRow key={item.key} item={item} navigate={navigate} />)}
        </div>
      )}
    </div>
  );
}
