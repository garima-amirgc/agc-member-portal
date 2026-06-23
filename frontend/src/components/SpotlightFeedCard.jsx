import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  EmployeeOfMonthBackgroundStar,
  EmployeeOfMonthCardShell,
} from "./EmployeeOfMonthCardDecor";
import {
  SpotlightFeedCardFooter,
  SpotlightFeedDescription,
  SpotlightFeedPastLink,
  SpotlightFeedReadMoreLink,
  SPOTLIGHT_FEED_CARD_MIN_H,
} from "./SpotlightFeedCardParts";
import { formatSpotlightFeedDate, spotlightFeedNeedsReadMore, SPOTLIGHT_FEED_HOME_DESC_MIN_H } from "../utils/spotlightFeedDisplay";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { useSpotlightCarousel } from "../hooks/useSpotlightCarousel";
import SpotlightCardSlider from "./SpotlightCardSlider";

function normalizeSpotlightEntries(entry, entries) {
  if (Array.isArray(entries) && entries.length) {
    return entries.filter((item) => item?.title);
  }
  if (entry?.title) return [entry];
  return [];
}

function CardFooter({ feed, description, stableLayout = false }) {
  const needsMore = spotlightFeedNeedsReadMore(description);
  if (stableLayout) {
    return (
      <SpotlightFeedCardFooter className="gap-4">
        <div className="min-h-[1.25rem] w-full text-right">
          {needsMore ? <SpotlightFeedReadMoreLink feed={feed} /> : null}
        </div>
        <SpotlightFeedPastLink feed={feed} />
      </SpotlightFeedCardFooter>
    );
  }

  return (
    <SpotlightFeedCardFooter className="gap-4">
      {needsMore ? <SpotlightFeedReadMoreLink feed={feed} /> : null}
      <SpotlightFeedPastLink feed={feed} />
    </SpotlightFeedCardFooter>
  );
}

function CompactCardShell({ feed, children, starClassName, ...pauseProps }) {
  const showStar = feed.showBackgroundStar !== false;
  return (
    <div
      {...pauseProps}
      className={`card group relative overflow-hidden rounded-2xl border-[#0B3EAF]/12 bg-gradient-to-br from-[#eef3ff] via-white to-[#f4fbe8] transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-[#A7D344]/20 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10 ${SPOTLIGHT_FEED_CARD_MIN_H} flex flex-col`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
      {showStar ? (
        <EmployeeOfMonthBackgroundStar
          className={
            starClassName ||
            "right-3 top-1/2 h-32 w-32 -translate-y-1/2 text-[#0B3EAF]/[0.14] dark:text-[#A7D344]/[0.16]"
          }
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/75 via-white/55 to-[#eef3ff]/40 dark:from-slate-900/70 dark:via-slate-900/45 dark:to-[#0B3EAF]/10" />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function EmptyState({ feed, compact = false, canManage = false }) {
  const inner = (
    <div className="flex flex-1 flex-col">
      <div className="mb-2 text-left">
        <h2 className="text-lg font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{feed.cardTitle}</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">{feed.emptyCardMessage}</p>
      {canManage ? (
        <Link
          to={feed.adminPath}
          className="mt-3 inline-flex text-sm font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
        >
          {feed.adminAddLinkLabel}
        </Link>
      ) : null}
      <SpotlightFeedCardFooter>
        <SpotlightFeedPastLink feed={feed} />
      </SpotlightFeedCardFooter>
    </div>
  );

  if (compact) {
    return <CompactCardShell feed={feed}>{inner}</CompactCardShell>;
  }

  return (
    <EmployeeOfMonthCardShell
      showBackgroundStar={feed.showBackgroundStar !== false}
      className={`flex flex-col p-4 sm:p-5 ${SPOTLIGHT_FEED_CARD_MIN_H}`}
    >
      {inner}
    </EmployeeOfMonthCardShell>
  );
}

function CompactSlideBody({ feed, entry, stableLayout = false }) {
  const title = String(entry.title || "").trim();
  const description = String(entry.description || "").trim();
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  if (stableLayout) {
    return (
      <>
        <p className="mb-3 min-h-[1rem] text-xs font-medium text-slate-600 dark:text-slate-300">
          {dateLabel || "\u00A0"}
        </p>
        <div className="mb-3 flex min-h-[6.25rem] items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#A7D344]/50 bg-white shadow-md">
            {img ? (
              <img src={img} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="line-clamp-2 min-h-[3rem] text-base font-bold text-slate-900 dark:text-white">{title}</p>
          </div>
        </div>
        <p
          className={`${SPOTLIGHT_FEED_HOME_DESC_MIN_H} overflow-hidden text-sm leading-relaxed text-slate-700 dark:text-slate-300`}
          style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
        >
          {description || "\u00A0"}
        </p>
      </>
    );
  }

  return (
    <>
      <div className={`mb-3 flex items-start gap-4 ${img ? "" : "flex-col"}`}>
        {img ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#A7D344]/50 bg-white shadow-md">
            <img src={img} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-base font-bold text-slate-900 dark:text-white">{title}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <SpotlightFeedDescription feed={feed} description={description} entryId={entry.id} showReadMore={false} />
      </div>
    </>
  );
}

function FullSlideBody({ feed, entry }) {
  const title = String(entry.title || "").trim();
  const description = String(entry.description || "").trim();
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  return (
    <>
      {dateLabel ? <p className="text-sm font-semibold text-slate-800 dark:text-white">{dateLabel}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
        {img ? (
          <div className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-[#A7D344]/60 bg-white shadow-md sm:mx-0">
            <img src={img} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex flex-1 flex-col text-center sm:text-left">
          <h2 className="line-clamp-2 text-xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">{title}</h2>
          <div className="mt-3 flex-1">
            <SpotlightFeedDescription feed={feed} description={description} entryId={entry.id} showReadMore={false} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function SpotlightFeedCard({ feed, entry, entries, loading, compact = false, canManage = false }) {
  const list = useMemo(() => normalizeSpotlightEntries(entry, entries), [entry, entries]);
  const resetKeys = useMemo(() => list.map((item) => item.id), [list]);
  const { safeIndex, setActiveIndex, pauseProps } = useSpotlightCarousel(list.length, resetKeys);
  const current = list[safeIndex];

  if (loading) {
    return (
      <div className={`card ${SPOTLIGHT_FEED_CARD_MIN_H} flex flex-col justify-center`}>
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading {feed.cardTitle.toLowerCase()}…</p>
      </div>
    );
  }

  if (!current) {
    return <EmptyState feed={feed} compact={compact} canManage={canManage} />;
  }

  const description = String(current.description || "").trim();
  const dateLabel = formatSpotlightFeedDate(current.created_at);
  const hasMultiple = list.length > 1;

  if (compact) {
    return (
      <CompactCardShell
        feed={feed}
        starClassName={
          hasMultiple
            ? "right-10 top-1/2 h-32 w-32 -translate-y-1/2 text-[#0B3EAF]/[0.14] dark:text-[#A7D344]/[0.16]"
            : undefined
        }
        {...pauseProps}
      >
        <div className="mb-4 text-left">
          <h2 className="text-lg font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{feed.cardTitle}</h2>
          {!hasMultiple && dateLabel ? (
            <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{dateLabel}</p>
          ) : null}
        </div>

        {hasMultiple ? (
          <>
            <SpotlightCardSlider
              itemCount={list.length}
              activeIndex={safeIndex}
              onChange={setActiveIndex}
              compact
              slideKey={current.id}
              paginationLabel={feed.cardTitle}
            >
              <CompactSlideBody feed={feed} entry={current} stableLayout />
            </SpotlightCardSlider>
            <CardFooter feed={feed} description={description} stableLayout />
          </>
        ) : (
          <>
            <CompactSlideBody feed={feed} entry={current} />
            <CardFooter feed={feed} description={description} />
          </>
        )}
      </CompactCardShell>
    );
  }

  if (hasMultiple) {
    return (
      <EmployeeOfMonthCardShell
        showBackgroundStar={feed.showBackgroundStar !== false}
        className={`flex flex-col p-4 sm:p-5 ${SPOTLIGHT_FEED_CARD_MIN_H}`}
        {...pauseProps}
      >
        <div className="mb-3 text-left">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B3EAF] dark:text-[#A7D344]">
            {feed.cardTitle}
          </h2>
        </div>
        <SpotlightCardSlider
          itemCount={list.length}
          activeIndex={safeIndex}
          onChange={setActiveIndex}
          slideKey={current.id}
          paginationLabel={feed.cardTitle}
        >
          <FullSlideBody feed={feed} entry={current} />
        </SpotlightCardSlider>
        <CardFooter feed={feed} description={description} />
      </EmployeeOfMonthCardShell>
    );
  }

  const title = String(current.title || "").trim();
  const img = current.image_url ? resolvePublicMediaUrl(current.image_url) : "";

  return (
    <EmployeeOfMonthCardShell
      showBackgroundStar={feed.showBackgroundStar !== false}
      className={`flex flex-col p-4 sm:p-5 ${SPOTLIGHT_FEED_CARD_MIN_H}`}
    >
      <div className="mb-3 text-left">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B3EAF] dark:text-[#A7D344]">
          {feed.cardTitle}
        </h2>
        {dateLabel ? <p className="text-sm font-semibold text-slate-800 dark:text-white">{dateLabel}</p> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
        {img ? (
          <div className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-[#A7D344]/60 bg-white shadow-md sm:mx-0">
            <img src={img} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex flex-1 flex-col text-center sm:text-left">
          <h2 className="line-clamp-2 text-xl font-bold text-[#0B3EAF] dark:text-[#A7D344]">{title}</h2>
          <div className="mt-3 flex-1">
            <SpotlightFeedDescription feed={feed} description={description} entryId={current.id} showReadMore={false} />
          </div>
        </div>
      </div>
      <CardFooter feed={feed} description={description} />
    </EmployeeOfMonthCardShell>
  );
}
