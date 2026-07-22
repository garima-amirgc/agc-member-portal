import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";

function normalizeEntries({ employeeOfMonthEntries, leadershipEntries, communityEntries, customerWinEntries }) {
  const items = [];

  for (const entry of employeeOfMonthEntries || []) {
    const emp = entry?.employee;
    if (!emp?.name) continue;
    const facility = entry.facility || emp.business_unit || emp.department || "";
    items.push({
      key: `eom-${entry.id}`,
      category: "Employee of the Month",
      title: emp.name,
      subtitle: entry.citation || "",
      facility,
      image: entry.image_url || emp.profile_image_url,
      dateValue: entry.created_at,
      link: `/employee-of-month/${encodeURIComponent(String(entry.id))}`,
      accent: "#0B3EAF",
    });
  }

  for (const entry of leadershipEntries || []) {
    if (!entry?.title) continue;
    const leadershipCategory =
      entry.post_type === "promotions_achievements" ? "Promotions & Achievements" : "Leadership Update";
    items.push({
      key: `leadership-${entry.id}`,
      category: leadershipCategory,
      title: entry.title,
      subtitle: entry.description || "",
      facility: entry.facility || "",
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/leadership-updates/${encodeURIComponent(String(entry.id))}`,
      accent: "#0B3EAF",
    });
  }

  for (const entry of communityEntries || []) {
    if (!entry?.title) continue;
    items.push({
      key: `community-${entry.id}`,
      category: "Community Involvement",
      title: entry.title,
      subtitle: entry.description || "",
      facility: entry.facility || "",
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/community-involvement/${encodeURIComponent(String(entry.id))}`,
      accent: "#A7D344",
    });
  }

  for (const entry of customerWinEntries || []) {
    if (!entry?.title) continue;
    items.push({
      key: `win-${entry.id}`,
      category: "Customer Win",
      title: entry.title,
      subtitle: entry.description || "",
      facility: entry.facility || "",
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/customer-wins/${encodeURIComponent(String(entry.id))}`,
      accent: "#A7D344",
    });
  }

  items.sort((a, b) => {
    const at = a.dateValue ? new Date(a.dateValue).getTime() : 0;
    const bt = b.dateValue ? new Date(b.dateValue).getTime() : 0;
    return bt - at;
  });

  return items;
}

function SlideCard({ item }) {
  const img = item.image ? resolvePublicMediaUrl(item.image) : "";
  const dateLabel = formatSpotlightFeedDate(item.dateValue);
  const isInternal = item.link?.startsWith("/");

  const inner = (
    <div className="flex h-52 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
      {/* Left: Image */}
      <div className="relative w-28 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
        {img ? (
          <img src={img} alt={item.title} className="h-full w-full object-cover object-[50%_20%]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0B3EAF]/10 to-[#A7D344]/10">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5" />
            </svg>
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="flex flex-1 flex-col justify-between p-4 min-w-0">
        {/* Top: badge + facility */}
        <div className="flex flex-wrap items-start gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal whitespace-nowrap text-white shadow-sm"
            style={{ background: item.accent }}
          >
            {item.category}
          </span>
          {item.facility ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {item.facility}
            </span>
          ) : null}
        </div>

        {/* Middle: title + subtitle */}
        <div className="mt-2 flex-1">
          <p className="font-bold leading-snug text-slate-900 dark:text-white line-clamp-2">{item.title}</p>
          {item.subtitle ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-3">
              {item.subtitle}
            </p>
          ) : null}
        </div>

        {/* Bottom: date */}
        {dateLabel ? (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{dateLabel}</p>
        ) : null}
      </div>
    </div>
  );

  if (isInternal) return <Link to={item.link} className="block">{inner}</Link>;
  if (item.link) return <a href={item.link} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>;
  return inner;
}

export default function CompanyNewsFeed({
  employeeOfMonthEntries,
  employeeOfMonthLoading,
  leadershipEntries,
  leadershipLoading,
  communityEntries,
  communityLoading,
  customerWinEntries,
  customerWinLoading,
  canManage,
}) {
  const loading = employeeOfMonthLoading || leadershipLoading || communityLoading || customerWinLoading;
  const items = useMemo(
    () => normalizeEntries({ employeeOfMonthEntries, leadershipEntries, communityEntries, customerWinEntries }),
    [employeeOfMonthEntries, leadershipEntries, communityEntries, customerWinEntries]
  );

  const [index, setIndex] = useState(0);

  // Reset index when items change
  useEffect(() => { setIndex(0); }, [items.length]);

  const prev = useCallback(() => setIndex((i) => (i === 0 ? items.length - 1 : i - 1)), [items.length]);
  const next = useCallback(() => setIndex((i) => (i === items.length - 1 ? 0 : i + 1)), [items.length]);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [items.length, next]);

  return (
    <div className="card relative flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/company-news"
          className="text-[11px] font-bold uppercase tracking-wide text-slate-700 hover:underline dark:text-slate-300"
        >
          Company News
        </Link>
        {canManage ? (
          <Link
            to="/admin/company-news"
            className="text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
          >
            Manage
          </Link>
        ) : null}
      </div>

      {/* Slider body */}
      <div className="mt-3">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0B3EAF] dark:border-slate-700 dark:border-t-[#A7D344]" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">No company news has been published yet.</p>
        ) : (
          <>
            {/* Slide */}
            <div>
              <SlideCard item={items[index]} />
            </div>

            {/* Controls */}
            {items.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                {/* Prev arrow */}
                <button
                  type="button"
                  onClick={prev}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                  aria-label="Previous"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Dots */}
                <div className="flex items-center gap-1.5">
                  {items.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`rounded-full transition-all ${
                        i === index
                          ? "h-2 w-5 bg-[#0B3EAF] dark:bg-[#A7D344]"
                          : "h-2 w-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                      }`}
                    />
                  ))}
                </div>

                {/* Next arrow */}
                <button
                  type="button"
                  onClick={next}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#A7D344] dark:hover:text-[#A7D344]"
                  aria-label="Next"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}

            {/* Counter */}
            {items.length > 1 && (
              <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                {index + 1} / {items.length}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
