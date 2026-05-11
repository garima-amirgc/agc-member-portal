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
  return kind === "activity"
    ? "bg-[#0B3EAF] text-white"
    : "bg-[#E02B20] text-white";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all"); // all | holiday | activity
  const [loading, setLoading] = useState(true);

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

  const shown = useMemo(() => {
    if (filter === "holiday") return events.filter((e) => e.kind === "holiday");
    if (filter === "activity") return events.filter((e) => e.kind === "activity");
    return events;
  }, [events, filter]);

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
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-[#141414] dark:text-slate-200"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter events"
            >
              <option value="all">All Events</option>
              <option value="holiday">Holidays</option>
              <option value="activity">Activities</option>
            </select>
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
                <div key={`pad-${i}`} className="min-h-[92px] bg-white/60 dark:bg-white/5 sm:min-h-[110px]" />
              ))}

              {Array.from({ length: win.daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = ymd(year, month0 + 1, day);
                const dayEvents = shown.filter((ev) => spansDay(ev, key));
                return (
                  <div
                    key={key}
                    className="min-h-[92px] bg-white px-2 py-2 align-top dark:bg-[#0f0f0f] sm:min-h-[110px]"
                  >
                    <div className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-200">{day}</div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 4).map((ev) => {
                        const cls = chipClass(ev.kind);
                        const style = ev.color ? { backgroundColor: ev.color } : undefined;
                        return (
                          <div
                            key={ev.id}
                            className={`truncate rounded-md px-2 py-1 text-[11px] font-bold shadow-sm ${cls}`}
                            style={style}
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 4 ? (
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          +{dayEvents.length - 4} more
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

