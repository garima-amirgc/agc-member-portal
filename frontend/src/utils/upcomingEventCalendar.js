import { compareYmd, ymdInToronto } from "./torontoDate";
import { monthWindow, ymd } from "./calendarDate";

/**
 * Social / facility upcoming feed (`facility_upcoming`).
 * Highlights only the scheduled event day (`event_at`). `show_from_at` / `end_at` control
 * portal listing visibility and must not span calendar highlights.
 * @param {unknown[]} events
 */
export function buildUpcomingEventRanges(events) {
  const out = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const eventYmd = ymdInToronto(ev?.event_at ?? ev?.start_at);
    if (!eventYmd) continue;

    out.push({
      id: `upcoming-${ev?.id}`,
      title: String(ev?.title || "Untitled event").trim(),
      startYmd: eventYmd,
      endYmd: eventYmd,
      source: "upcoming",
      listedFromOnly: false,
      event_at: ev?.event_at ?? ev?.start_at ?? null,
      show_from_at: ev?.show_from_at ?? null,
      end_at: ev?.end_at ?? null,
      raw: ev,
    });
  }
  return out;
}

/**
 * Company calendar page events (`calendar_events` — holidays, activities).
 * @param {unknown[]} events
 */
export function buildCalendarEventRanges(events) {
  const out = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const startYmd = ymdInToronto(ev?.start_date);
    if (!startYmd) continue;
    let endYmd = ymdInToronto(ev?.end_date) || startYmd;
    if (compareYmd(endYmd, startYmd) < 0) endYmd = startYmd;
    out.push({
      id: `calendar-${ev?.id}`,
      title: String(ev?.title || "Untitled").trim(),
      startYmd,
      endYmd,
      source: "calendar",
      listedFromOnly: false,
      kind: ev?.kind || "holiday",
      raw: ev,
    });
  }
  return out;
}

export function mergeEventRanges(...groups) {
  const out = groups.flat();
  out.sort((a, b) => compareYmd(a.startYmd, b.startYmd) || String(a.title).localeCompare(b.title));
  return out;
}

function spansYmd(range, dayYmd) {
  return range.startYmd <= dayYmd && range.endYmd >= dayYmd;
}

/** @returns {'single' | 'start' | 'middle' | 'end'} */
export function rangeRoleForDay(range, dayYmd) {
  if (range.startYmd === range.endYmd) return "single";
  if (dayYmd === range.startYmd) return "start";
  if (dayYmd === range.endYmd) return "end";
  return "middle";
}

/**
 * @param {ReturnType<typeof buildUpcomingEventRanges>} ranges
 * @param {number} year
 * @param {number} month0
 */
export function buildMonthDayMap(ranges, year, month0) {
  const win = monthWindow(year, month0);
  /** @type {Map<string, ReturnType<typeof buildUpcomingEventRanges>>} */
  const map = new Map();

  for (let day = 1; day <= win.daysInMonth; day += 1) {
    const dayYmd = ymd(year, month0 + 1, day);
    const onDay = ranges.filter((r) => spansYmd(r, dayYmd));
    if (onDay.length) map.set(dayYmd, onDay);
  }
  return { win, dayMap: map };
}
