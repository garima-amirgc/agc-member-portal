import { getEventTimeIso } from "./eventDate";

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Split merged upcoming feed into “today” vs “later” lists for home / facility sidebars.
 * Events dated today appear only in `todayEvents`. Undated announcements stay in upcoming until expired.
 */
export function splitUpcomingForHome(upcoming) {
  const now = new Date();
  if (!Array.isArray(upcoming) || upcoming.length === 0) {
    return { todayEvents: [], upcomingFutureOnly: [] };
  }

  const todayEvents = [];
  for (const ev of upcoming) {
    const iso = getEventTimeIso(ev);
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    if (isSameLocalDay(d, now)) todayEvents.push(ev);
  }

  const todayIds = new Set(todayEvents.map((e) => e?.id).filter((x) => x != null));

  const upcomingFutureOnly = upcoming.filter((ev) => {
    if (todayIds.has(ev?.id)) return false;
    const eventIso = getEventTimeIso(ev);
    const endIso = ev?.end_at ?? ev?.endAt ?? null;

    if (!eventIso) return true;

    const eventDate = new Date(eventIso);
    if (Number.isNaN(eventDate.getTime())) return true;

    if (isSameLocalDay(eventDate, now)) return false;

    if (endIso) {
      const endDate = new Date(endIso);
      if (!Number.isNaN(endDate.getTime())) {
        return endDate.getTime() > now.getTime();
      }
    }

    return true;
  });

  return { todayEvents, upcomingFutureOnly };
}
