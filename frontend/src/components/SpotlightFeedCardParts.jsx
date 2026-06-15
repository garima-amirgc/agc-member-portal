import { Link } from "react-router-dom";
import {
  SPOTLIGHT_FEED_CARD_MIN_H,
  SPOTLIGHT_FEED_GRID_CARD_MIN_H,
  SPOTLIGHT_FEED_HOME_DESC_MIN_H,
  SPOTLIGHT_FEED_HOME_LINE_CLAMP,
  spotlightFeedDetailPath,
  spotlightFeedNeedsReadMore,
} from "../utils/spotlightFeedDisplay";

const linkClass =
  "text-[11px] font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]";

export function SpotlightFeedPastLink({ feed }) {
  return (
    <Link to={feed.archivePath} className={linkClass}>
      {feed.archivePastLabel}
    </Link>
  );
}

export function SpotlightFeedReadMoreLink({ feed, entryId, className = linkClass, toDetail = false }) {
  const to =
    toDetail && entryId != null ? spotlightFeedDetailPath(feed, entryId) : feed.archivePath;
  return (
    <Link to={to} className={className}>
      Read more
    </Link>
  );
}

export function SpotlightFeedDescription({
  description,
  feed,
  entryId,
  lineClampClass = SPOTLIGHT_FEED_HOME_LINE_CLAMP,
  showReadMore = true,
}) {
  const text = String(description || "").trim();
  if (!text) return null;

  const needsMore = spotlightFeedNeedsReadMore(text);

  return (
    <div>
      <p className={`text-sm leading-relaxed text-slate-700 dark:text-slate-300 ${lineClampClass}`}>{text}</p>
      {showReadMore && needsMore ? (
        <div className="mt-2">
          <SpotlightFeedReadMoreLink feed={feed} />
        </div>
      ) : null}
    </div>
  );
}

export function SpotlightFeedCardFooter({ children, className = "" }) {
  return (
    <div className={`mt-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 pt-3 ${className}`}>
      {children}
    </div>
  );
}

export { SPOTLIGHT_FEED_CARD_MIN_H, SPOTLIGHT_FEED_GRID_CARD_MIN_H };
