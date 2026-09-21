import { useMemo, useState } from "react";
import { addDays, badgeClassFor, dotClassFor, fmtDateRange, todayIso } from "./timeOffShared";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}
function startOfMonth(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function endOfMonth(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function monthLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
}
function dayNum(iso) {
  return Number(iso.split("-")[2]);
}
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}
function isSameMonth(iso, monthIso) {
  return iso.slice(0, 7) === monthIso.slice(0, 7);
}
function rangeDays(fromIso, toIso) {
  const days = [];
  let cur = fromIso;
  let guard = 0;
  while (cur <= toIso && guard < 60) {
    days.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return days;
}

/** Every (employee, time-off entry) pair that overlaps this specific day. */
function entriesOnDay(employees, iso) {
  const out = [];
  for (const e of employees) {
    for (const t of e.time_off || []) {
      if (t.start_date && t.start_date <= iso && (t.end_date || t.start_date) >= iso) {
        out.push({ employee: e, entry: t });
      }
    }
  }
  return out;
}

/** How many distinct people have time off on this day — 2+ means an overlap. */
function overlapCountOnDay(employees, iso) {
  const ids = new Set();
  for (const e of employees) {
    for (const t of e.time_off || []) {
      if (t.start_date && t.start_date <= iso && (t.end_date || t.start_date) >= iso) {
        ids.add(e.id);
        break;
      }
    }
  }
  return ids.size;
}

export default function TeamCalendar({ employees, syncWindow, initialCursor }) {
  const [mode, setMode] = useState("month");
  const [cursor, setCursor] = useState(initialCursor || todayIso());

  // Everything the board loaded is already in `employees[].time_off` — no
  // extra fetch on navigation, this is just picking which slice to render.
  const outOfSyncRange =
    syncWindow && (cursor < syncWindow.from || cursor > syncWindow.to);

  const monthDays = useMemo(() => {
    if (mode !== "month") return [];
    return rangeDays(startOfWeek(startOfMonth(cursor)), addDays(startOfWeek(endOfMonth(cursor)), 6));
  }, [mode, cursor]);

  const weekDays = useMemo(() => {
    if (mode !== "week") return [];
    return rangeDays(startOfWeek(cursor), addDays(startOfWeek(cursor), 6));
  }, [mode, cursor]);

  const listEntries = useMemo(() => {
    const out = [];
    for (const e of employees) {
      for (const t of e.time_off || []) out.push({ employee: e, entry: t });
    }
    return out.sort((a, b) => String(a.entry.start_date).localeCompare(String(b.entry.start_date)));
  }, [employees]);

  const today = todayIso();

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          {mode !== "list" ? (
            <>
              <button
                type="button"
                className="btn-outline px-2 py-1"
                onClick={() => setCursor(mode === "month" ? addMonths(cursor, -1) : addDays(cursor, -7))}
              >
                ‹
              </button>
              <span className="min-w-[10rem] text-center font-semibold text-slate-900 dark:text-white">
                {mode === "month" ? monthLabel(cursor) : `Week of ${dayLabel(startOfWeek(cursor))}`}
              </span>
              <button
                type="button"
                className="btn-outline px-2 py-1"
                onClick={() => setCursor(mode === "month" ? addMonths(cursor, 1) : addDays(cursor, 7))}
              >
                ›
              </button>
              <button type="button" className="btn-outline px-2 py-1 text-xs" onClick={() => setCursor(todayIso())}>
                Today
              </button>
            </>
          ) : (
            <span className="font-semibold text-slate-900 dark:text-white">Upcoming &amp; recent time off</span>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm dark:border-slate-600">
          {["month", "week", "list"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 capitalize ${
                mode === m
                  ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0B3EAF]"
                  : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {outOfSyncRange && mode !== "list" ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          This period is outside the range we currently sync from ADP ({syncWindow.from} to {syncWindow.to}), so it
          may look empty even if time off exists.
        </div>
      ) : null}

      {mode !== "list" ? (
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
            !
          </span>
          Highlighted = 2 or more team members overlapping that day
        </div>
      ) : null}

      {mode === "month" ? (
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((iso) => {
              const items = entriesOnDay(employees, iso);
              const inMonth = isSameMonth(iso, cursor);
              const overlapCount = overlapCountOnDay(employees, iso);
              const hasOverlap = overlapCount >= 2;
              return (
                <div
                  key={iso}
                  className={`min-h-[5.5rem] rounded-lg border p-1.5 text-left align-top ${
                    hasOverlap
                      ? "border-amber-400 bg-amber-50/60 dark:border-amber-500/50 dark:bg-amber-950/20"
                      : inMonth
                      ? "border-slate-200 dark:border-slate-700"
                      : "border-transparent opacity-40"
                  } ${iso === today ? "ring-2 ring-[#0B3EAF] dark:ring-[#A7D344]" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{dayNum(iso)}</span>
                    {hasOverlap ? (
                      <span
                        title={`${overlapCount} people overlap this day`}
                        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white"
                      >
                        !
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map(({ employee, entry }, i) => (
                      <div
                        key={`${employee.id}-${entry.id}-${i}`}
                        className={`truncate rounded px-1 py-0.5 text-[11px] font-medium ${badgeClassFor(entry.policy_name || entry.policy_code)}`}
                        title={`${employee.name} — ${entry.policy_name || entry.policy_code}`}
                      >
                        {employee.name.split(" ")[0]}
                      </div>
                    ))}
                    {items.length > 3 ? (
                      <div className="text-[11px] text-slate-400">+{items.length - 3} more</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "week" ? (
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Employee</th>
                {weekDays.map((iso) => {
                  const overlapCount = overlapCountOnDay(employees, iso);
                  const hasOverlap = overlapCount >= 2;
                  return (
                    <th
                      key={iso}
                      className={`p-2 text-center text-xs font-medium uppercase text-slate-500 dark:text-slate-400 ${
                        iso === today ? "text-[#0B3EAF] dark:text-[#A7D344]" : ""
                      } ${hasOverlap ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {dayLabel(iso)}
                        {hasOverlap ? (
                          <span
                            title={`${overlapCount} people overlap this day`}
                            className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-white"
                          >
                            !
                          </span>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-medium text-slate-800 dark:text-slate-100">{e.name}</td>
                  {weekDays.map((iso) => {
                    const hit = (e.time_off || []).find(
                      (t) => t.start_date && t.start_date <= iso && (t.end_date || t.start_date) >= iso
                    );
                    return (
                      <td key={iso} className="p-2 text-center">
                        {hit ? (
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeClassFor(hit.policy_name || hit.policy_code)}`}
                          >
                            {hit.policy_code || hit.policy_name}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-sm text-slate-500 dark:text-slate-400">
                    No employees match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {mode === "list" ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {listEntries.length === 0 ? (
            <li className="p-4 text-sm text-slate-500 dark:text-slate-400">No time off on record in this window.</li>
          ) : (
            listEntries.map(({ employee, entry }, i) => (
              <li key={`${employee.id}-${entry.id}-${i}`} className="flex flex-wrap items-center gap-2 p-3">
                <span className={`h-2 w-2 rounded-full ${dotClassFor(entry.policy_name || entry.policy_code)}`} />
                <span className="font-medium text-slate-800 dark:text-slate-100">{employee.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClassFor(entry.policy_name || entry.policy_code)}`}>
                  {entry.policy_name || entry.policy_code || "Time off"}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{fmtDateRange(entry.start_date, entry.end_date)}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
