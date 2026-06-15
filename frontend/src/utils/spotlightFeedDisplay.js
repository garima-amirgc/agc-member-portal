export const SPOTLIGHT_FEED_PREVIEW_CHARS = 100;

export const SPOTLIGHT_FEED_HOME_LINE_CLAMP = "line-clamp-2";
/** ~2 lines at text-sm leading-relaxed */
export const SPOTLIGHT_FEED_HOME_DESC_MIN_H = "min-h-[3.25rem]";

export const SPOTLIGHT_FEED_CARD_MIN_H = "min-h-[22rem]";
export const SPOTLIGHT_FEED_GRID_CARD_MIN_H = "min-h-[18rem]";

/** @deprecated use SPOTLIGHT_FEED_* */
export const LEADERSHIP_UPDATE_PREVIEW_CHARS = SPOTLIGHT_FEED_PREVIEW_CHARS;
export const LEADERSHIP_UPDATE_CARD_MIN_H = SPOTLIGHT_FEED_CARD_MIN_H;
export const LEADERSHIP_UPDATE_GRID_CARD_MIN_H = SPOTLIGHT_FEED_GRID_CARD_MIN_H;

export function formatSpotlightFeedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function formatLeadershipDate(iso) {
  return formatSpotlightFeedDate(iso);
}

export function spotlightFeedNeedsReadMore(text) {
  const s = String(text || "").trim();
  return s.length > SPOTLIGHT_FEED_PREVIEW_CHARS;
}

export function leadershipUpdateNeedsReadMore(text) {
  return spotlightFeedNeedsReadMore(text);
}

export function spotlightFeedDetailPath(feed, id) {
  return `${feed.archivePath}/${encodeURIComponent(String(id))}`;
}

export function leadershipUpdateDetailPath(id) {
  return `/leadership-updates/${encodeURIComponent(String(id))}`;
}
