import api from "./api";

const TTL_MS = 60_000;
let cache = null;
let inflight = null;

function cacheKey(days) {
  return String(days);
}

function normalizeFeed(data, days) {
  const d = data || {};
  return {
    today: Array.isArray(d.today) ? d.today : [],
    upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
    anniversaries_today: Array.isArray(d.anniversaries_today) ? d.anniversaries_today : [],
    anniversaries_upcoming: Array.isArray(d.anniversaries_upcoming) ? d.anniversaries_upcoming : [],
    range_days: Number(d.range_days) || days,
  };
}

export function invalidateBirthdaysFeedCache() {
  cache = null;
  inflight = null;
}

export async function fetchBirthdaysFeed(days = 14) {
  const key = cacheKey(days);
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  if (inflight && inflight.key === key) {
    return inflight.promise;
  }

  const promise = api
    .get("/birthdays/feed", { params: { days } })
    .then(({ data }) => {
      const normalized = normalizeFeed(data, days);
      cache = { key, data: normalized, at: Date.now() };
      inflight = null;
      return normalized;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  inflight = { key, promise };
  return promise;
}
