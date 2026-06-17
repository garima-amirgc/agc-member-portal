import { torontoTodayYmd, ymdInToronto } from "./torontoDate";

/**
 * Split merged upcoming feed into “today” vs “later” lists for home / facility sidebars.
 * Uses America/Toronto for “today”. Events dated today appear only in `todayEvents`.
 */
export function splitUpcomingForHome(upcoming) {
  const todayYmd = torontoTodayYmd();
  if (!Array.isArray(upcoming) || upcoming.length === 0) {
    return { todayEvents: [], upcomingFutureOnly: [] };
  }

  const todayEvents = [];
  for (const ev of upcoming) {
    const dayYmd = ymdInToronto(ev?.event_at ?? ev?.start_at);
    if (!dayYmd) continue;
    if (dayYmd === todayYmd) todayEvents.push(ev);
  }

  const todayIds = new Set(todayEvents.map((e) => e?.id).filter((x) => x != null));

  const upcomingFutureOnly = upcoming.filter((ev) => {
    if (todayIds.has(ev?.id)) return false;
    const dayYmd = ymdInToronto(ev?.event_at ?? ev?.start_at);
    const endYmd = ymdInToronto(ev?.end_at);

    if (!dayYmd) return true;
    if (dayYmd === todayYmd) return false;

    if (endYmd) {
      return endYmd >= todayYmd;
    }

    return dayYmd > todayYmd;
  });

  return { todayEvents, upcomingFutureOnly };
}
