import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m1, d) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

function monthWindow(year, month0) {
  const start = new Date(year, month0, 1);
  const end = new Date(year, month0 + 1, 0);
  return {
    from: ymd(year, month0 + 1, 1),
    to: ymd(year, month0 + 1, end.getDate()),
    daysInMonth: end.getDate(),
    firstDow: start.getDay(), // 0..6
  };
}

function spansDay(ev, dayYmd) {
  const s = String(ev?.start_date || "").trim();
  const e = String(ev?.end_date || "").trim();
  if (!s) return false;
  const end = e || s;
  return s <= dayYmd && end >= dayYmd;
}

function chipClass(kind) {
  if (kind === "activity") return "bg-[#0B3EAF] text-white";
  if (kind === "other") return "bg-[#6B7280] text-white";
  return "bg-[#E02B20] text-white";
}

function eventDescription(ev) {
  return String(ev?.description || ev?.notes || "").trim();
}

function eventTooltip(ev) {
  const desc = eventDescription(ev);
  return desc ? `${ev.title}\n${desc}` : ev.title;
}

function CalendarEventChip({ ev }) {
  const desc = eventDescription(ev);
  const cls = chipClass(ev.kind);
  const style = ev.color ? { backgroundColor: ev.color } : undefined;
  return (
    <div className={`rounded-md px-2 py-1 shadow-sm ${cls}`} style={style} title={eventTooltip(ev)}>
      <div className="text-[11px] font-bold leading-tight">{ev.title}</div>
      {desc ? (
        <p className="mt-0.5 text-[9px] font-normal leading-snug opacity-95 line-clamp-3">{desc}</p>
      ) : null}
    </div>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_EVENTS_PER_DAY = 3;

function formatDayLabel(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  /** { dateKey, dayEvents } when user opens a day with more events than fit in the cell */
  const [dayDetail, setDayDetail] = useState(null);

  const win = useMemo(() => monthWindow(year, month0), [year, month0]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get("/api/calendar/events", { params: { from: win.from, to: win.to } })
      .then(({ data }) => {
        if (!alive) return;
        const list = Array.isArray(data?.events) ? data.events : [];
        setEvents(list);
      })
      .catch(() => {
        if (alive) setEvents([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [win.from, win.to]);

  const monthList = useMemo(() => {
    return [...events].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  }, [events]);

  const title = useMemo(() => {
    const d = new Date(year, month0, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [year, month0]);

  const prev = () => {
    setMonth0((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };
  const next = () => {
    setMonth0((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const openDayDetail = (dateKey, dayEvents) => {
    if (!dayEvents?.length) return;
    setDayDetail({ dateKey, dayEvents });
  };

  useEffect(() => {
    if (!dayDetail) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDayDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayDetail]);

  useEffect(() => {
    setDayDetail(null);
  }, [year, month0]);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        title="Calendar"
      />

      <section className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#101010] sm:px-5">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-slate-900 dark:text-white">{title}</div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline px-3 py-2" onClick={prev} aria-label="Previous month">
              ‹
            </button>
            <button type="button" className="btn-outline px-3 py-2" onClick={next} aria-label="Next month">
              ›
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-slate-600 dark:text-slate-300">Loading calendar…</div>
        ) : (
          <div className="bg-slate-50 p-3 dark:bg-white/5 sm:p-4">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10">
              {DOW.map((d) => (
                <div
                  key={d}
                  className="bg-white px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-[#0f0f0f] dark:text-slate-400"
                >
                  {d}
                </div>
              ))}

              {Array.from({ length: win.firstDow }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[108px] bg-white/60 dark:bg-white/5 sm:min-h-[128px]" />
              ))}

              {Array.from({ length: win.daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = ymd(year, month0 + 1, day);
                const dayEvents = events.filter((ev) => spansDay(ev, key));
                return (
                  <div
                    key={key}
                    className="min-h-[108px] bg-white px-2 py-2 align-top dark:bg-[#0f0f0f] sm:min-h-[128px]"
                  >
                    <button
                      type="button"
                      className="mb-1 text-xs font-bold text-slate-700 hover:text-[#0B3EAF] dark:text-slate-200 dark:hover:text-[#A7D344]"
                      onClick={() => dayEvents.length > 0 && openDayDetail(key, dayEvents)}
                      disabled={dayEvents.length === 0}
                      aria-label={dayEvents.length ? `View ${dayEvents.length} event(s) on ${formatDayLabel(key)}` : undefined}
                    >
                      {day}
                    </button>
                    <div className="space-y-1">
                      {dayEvents.slice(0, VISIBLE_EVENTS_PER_DAY).map((ev) => (
                        <CalendarEventChip key={ev.id} ev={ev} />
                      ))}
                      {dayEvents.length > VISIBLE_EVENTS_PER_DAY ? (
                        <button
                          type="button"
                          className="w-full rounded-md px-1 py-0.5 text-left text-[10px] font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-1 underline-offset-2 hover:bg-slate-100 dark:text-[#A7D344] dark:hover:bg-white/10"
                          onClick={() => openDayDetail(key, dayEvents)}
                        >
                          +{dayEvents.length - VISIBLE_EVENTS_PER_DAY} more — view all
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && monthList.length > 0 ? (
          <div className="border-t border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#101010] sm:px-5">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Events in {title}</h2>
            <ul className="mt-3 space-y-3">
              {monthList.map((ev) => {
                const desc = eventDescription(ev);
                const kindLabel = ev.kind === "other" ? "Others" : ev.kind === "activity" ? "Activity" : "Holiday";
                return (
                  <li
                    key={ev.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-bold text-slate-900 dark:text-white">{ev.title}</div>
                        {desc ? (
                          <p className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-400">{desc}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {kindLabel}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-500">
                      {ev.start_date}
                      {ev.end_date && ev.end_date !== ev.start_date ? ` – ${ev.end_date}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {dayDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-day-detail-title"
          onClick={() => setDayDetail(null)}
        >
          <div
            className="max-h-[min(85vh,640px)] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101010]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <h2 id="calendar-day-detail-title" className="text-base font-bold text-slate-900 dark:text-white">
                  {formatDayLabel(dayDetail.dateKey)}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {dayDetail.dayEvents.length} event{dayDetail.dayEvents.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                className="btn-outline shrink-0 px-3 py-1.5 text-sm"
                onClick={() => setDayDetail(null)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <ul className="max-h-[min(70vh,520px)] space-y-3 overflow-y-auto p-4">
              {dayDetail.dayEvents.map((ev) => {
                const kindLabel =
                  ev.kind === "other" ? "Others" : ev.kind === "activity" ? "Activity" : "Holiday";
                return (
                  <li key={ev.id}>
                    <CalendarEventChip ev={ev} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {kindLabel}
                      </span>
                      {ev.start_date !== dayDetail.dateKey || (ev.end_date && ev.end_date !== ev.start_date) ? (
                        <span className="text-[10px] text-slate-500 dark:text-slate-500">
                          {ev.start_date}
                          {ev.end_date && ev.end_date !== ev.start_date ? ` – ${ev.end_date}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}

