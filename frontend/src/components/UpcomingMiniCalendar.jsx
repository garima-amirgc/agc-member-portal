import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import {
  buildCalendarEventRanges,
  buildMonthDayMap,
  buildUpcomingEventRanges,
  mergeEventRanges,
  rangeRoleForDay,
} from "../utils/upcomingEventCalendar";
import { formatTorontoWhen, torontoTodayYmd, torontoYearMonth } from "../utils/torontoDate";
import { monthWindow, ymd } from "../utils/calendarDate";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function monthLabel(year, month0) {
  return new Date(year, month0, 1).toLocaleString("en-CA", { month: "short", year: "numeric" });
}

function roleClasses(role) {
  const edge =
    "bg-brand-blue/20 text-brand-blue dark:bg-brand-green/25 dark:text-brand-green";
  const mid =
    "bg-brand-green/25 text-brand-blue dark:bg-brand-green/15 dark:text-brand-green";
  if (role === "single") return `${edge} rounded-full`;
  if (role === "start") return `${edge} rounded-l-full`;
  if (role === "end") return `${edge} rounded-r-full`;
  return mid;
}

function todayClasses(hasEvent, role) {
  const shape =
    role === "start"
      ? "rounded-l-full"
      : role === "end"
        ? "rounded-r-full"
        : role === "middle"
          ? ""
          : "rounded-full";
  const base = `${shape} bg-brand-blue font-bold text-white shadow-sm dark:bg-brand-blue dark:text-white`;
  if (hasEvent) {
    return `${base} font-extrabold ring-2 ring-brand-green ring-offset-2 ring-offset-white dark:ring-brand-green dark:ring-offset-[#141414]`;
  }
  return base;
}

function formatRangeDetail(range) {
  if (range.source === "calendar") {
    return range.startYmd === range.endYmd ? range.startYmd : `${range.startYmd} – ${range.endYmd}`;
  }
  return formatTorontoWhen(range.event_at);
}

export default function UpcomingMiniCalendar({ events, loading, onEventClick }) {
  const navigate = useNavigate();
  const initial = torontoYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month0, setMonth0] = useState(initial.month0);
  const [hoverYmd, setHoverYmd] = useState(null);
  const [selectedYmd, setSelectedYmd] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const win = useMemo(() => monthWindow(year, month0), [year, month0]);

  useEffect(() => {
    let alive = true;
    setCalendarLoading(true);
    api
      .get("/api/calendar/events", { params: { from: win.from, to: win.to } })
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res.data?.events) ? res.data.events : [];
        setCalendarEvents(list);
      })
      .catch(() => {
        if (alive) setCalendarEvents([]);
      })
      .finally(() => {
        if (alive) setCalendarLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [win.from, win.to]);

  const ranges = useMemo(
    () => mergeEventRanges(buildUpcomingEventRanges(events), buildCalendarEventRanges(calendarEvents)),
    [events, calendarEvents]
  );
  const { win: gridWin, dayMap } = useMemo(() => buildMonthDayMap(ranges, year, month0), [ranges, year, month0]);
  const todayYmd = torontoTodayYmd();
  const daysWithEvents = dayMap.size;
  const displayYmd = hoverYmd ?? selectedYmd;
  const displayEvents = displayYmd ? dayMap.get(displayYmd) || [] : [];
  const isLoading = loading || calendarLoading;

  const shiftMonth = (delta) => {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
    setHoverYmd(null);
    setSelectedYmd(null);
  };

  const openRange = (range) => {
    if (!range) return;
    if (range.source === "calendar") {
      navigate("/calendar");
      return;
    }
    if (typeof onEventClick === "function") {
      onEventClick(range.raw);
    }
  };

  let footer = null;
  if (displayEvents.length > 0) {
    footer = (
      <div className="mt-2 rounded-lg border border-[#0B3EAF]/15 bg-gradient-to-br from-brand-blue-soft/80 via-white to-brand-green-soft/50 px-3 py-2 dark:border-[#A7D344]/25 dark:from-[#0B3EAF]/15 dark:via-slate-900/40 dark:to-[#A7D344]/10">
        {displayEvents.map((ev) => (
          <button
            key={String(ev.id)}
            type="button"
            className="mb-2 block w-full rounded-md border border-transparent px-2 py-1.5 text-left transition last:mb-0 hover:border-[#0B3EAF]/20 hover:bg-white/90 dark:hover:border-[#A7D344]/30 dark:hover:bg-white/5"
            onClick={() => openRange(ev)}
          >
            <div className="text-[11px] font-semibold leading-snug text-brand-blue dark:text-brand-green">
              {ev.source === "calendar" ? `${ev.title} (Calendar)` : ev.title}
            </div>
            <div className="text-[10px] text-slate-600 dark:text-slate-300">{formatRangeDetail(ev)}</div>
          </button>
        ))}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Click an event above for details.</p>
      </div>
    );
  } else if (!isLoading && ranges.length === 0) {
    footer = (
      <p className="mt-3 text-center text-[10px] text-slate-500 dark:text-slate-400">
        Add dates in Upcoming admin or the Calendar page to see events here.
      </p>
    );
  } else if (!isLoading && daysWithEvents === 0) {
    footer = (
      <p className="mt-3 text-center text-[10px] text-slate-500 dark:text-slate-400">
        No events in {monthLabel(year, month0)}. Try another month.
      </p>
    );
  } else if (!isLoading) {
    footer = (
      <p className="mt-3 text-center text-[10px] text-slate-500 dark:text-slate-400">
        {daysWithEvents} day{daysWithEvents === 1 ? "" : "s"} with events this month. Hover a highlighted day.
      </p>
    );
  }

  return (
    <div className="card no-title-underline border-[#0B3EAF]/15 p-3 sm:p-4 dark:border-[#A7D344]/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0B3EAF]/25 text-brand-blue transition hover:bg-brand-blue-soft dark:border-[#A7D344]/30 dark:text-brand-green dark:hover:bg-white/5"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="text-sm font-semibold text-brand-blue dark:text-brand-green">{monthLabel(year, month0)}</h3>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0B3EAF]/25 text-brand-blue transition hover:bg-brand-blue-soft dark:border-[#A7D344]/30 dark:text-brand-green dark:hover:bg-white/5"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">Loading calendar…</p>
      ) : (
        <div onMouseLeave={() => setHoverYmd(null)}>
          <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold uppercase tracking-wide text-brand-blue/60 dark:text-brand-green/70">
            {DOW.map((d, i) => (
              <div key={`${d}-${i}`}>{d}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-y-1">
            {Array.from({ length: gridWin.firstDow }).map((_, i) => (
              <div key={`pad-${i}`} aria-hidden />
            ))}
            {Array.from({ length: gridWin.daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayYmd = ymd(year, month0 + 1, day);
              const onDay = dayMap.get(dayYmd) || [];
              const primary = onDay[0] || null;
              const role = primary ? rangeRoleForDay(primary, dayYmd) : null;
              const isToday = dayYmd === todayYmd;
              const isActive = displayYmd === dayYmd;

              return (
                <div key={dayYmd} className="relative px-0.5 py-0.5">
                  <button
                    type="button"
                    disabled={!primary}
                    className={[
                      "flex h-8 w-full items-center justify-center text-xs font-semibold transition",
                      primary && !isToday ? roleClasses(role) : !isToday ? "text-slate-700 dark:text-slate-300" : "",
                      primary ? "cursor-pointer hover:brightness-95" : "cursor-default",
                      isToday ? todayClasses(Boolean(primary), role) : "",
                      isActive && primary && !isToday
                        ? "brightness-95 ring-2 ring-brand-green/80 dark:ring-brand-green"
                        : "",
                      isActive && primary && isToday
                        ? "brightness-95"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={isToday ? "date" : undefined}
                    onMouseEnter={() => primary && setHoverYmd(dayYmd)}
                    onFocus={() => primary && setHoverYmd(dayYmd)}
                    onClick={() => {
                      if (!primary) return;
                      setSelectedYmd(dayYmd);
                    }}
                    aria-label={
                      primary ? `${day}: ${onDay.map((e) => e.title).join(", ")}` : `${day}`
                    }
                    aria-pressed={isActive}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {footer}
        </div>
      )}
    </div>
  );
}
