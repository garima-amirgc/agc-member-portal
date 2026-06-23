import { useMemo } from "react";
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
      title: "Employee of the Month",
      facility,
      excerpt: entry.citation ? `${emp.name} — ${entry.citation}` : emp.name,
      image: entry.image_url || emp.profile_image_url,
      dateValue: entry.created_at,
      link: `/employee-of-month/${encodeURIComponent(String(entry.id))}`,
    });
  }

  for (const entry of leadershipEntries || []) {
    if (!entry?.title) continue;
    items.push({
      key: `leadership-${entry.id}`,
      category: "Leadership Update",
      title: "Leadership Update",
      facility: entry.facility || "",
      excerpt: entry.description ? `${entry.title} — ${entry.description}` : entry.title,
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/leadership-updates/${encodeURIComponent(String(entry.id))}`,
    });
  }

  for (const entry of communityEntries || []) {
    if (!entry?.title) continue;
    items.push({
      key: `community-${entry.id}`,
      category: "Community Involvement",
      title: "Community Involvement",
      facility: entry.facility || "",
      excerpt: entry.description ? `${entry.title} — ${entry.description}` : entry.title,
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/community-involvement/${encodeURIComponent(String(entry.id))}`,
    });
  }

  for (const entry of customerWinEntries || []) {
    if (!entry?.title) continue;
    items.push({
      key: `win-${entry.id}`,
      category: "Customer Win",
      title: "Customer Win",
      facility: entry.facility || "",
      excerpt: entry.description ? `${entry.title} — ${entry.description}` : entry.title,
      image: entry.image_url,
      dateValue: entry.created_at,
      link: entry.link_url || `/customer-wins/${encodeURIComponent(String(entry.id))}`,
    });
  }

  items.sort((a, b) => {
    const at = a.dateValue ? new Date(a.dateValue).getTime() : 0;
    const bt = b.dateValue ? new Date(b.dateValue).getTime() : 0;
    return bt - at;
  });

  return items;
}

function NewsItem({ item }) {
  const img = item.image ? resolvePublicMediaUrl(item.image) : "";
  const dateLabel = formatSpotlightFeedDate(item.dateValue);
  const isInternalLink = item.link?.startsWith("/");

  const body = (
    <div className="flex gap-3 rounded-xl border border-slate-200 p-2.5 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:hover:border-[#A7D344]/30">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0B3EAF]/10 to-[#A7D344]/10 text-[9px] font-semibold text-slate-400">
            No image
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white">{item.title}</p>
          {item.facility ? (
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
              {item.facility}
            </span>
          ) : null}
        </div>
        {item.excerpt ? (
          <p
            className="mt-0.5 overflow-hidden text-xs leading-relaxed text-slate-600 dark:text-slate-300"
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
          >
            {item.excerpt}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {dateLabel ? `${dateLabel} · ` : ""}
          {item.category}
        </p>
      </div>
    </div>
  );

  if (isInternalLink) {
    return <Link to={item.link} className="block">{body}</Link>;
  }
  if (item.link) {
    return (
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="block">
        {body}
      </a>
    );
  }
  return body;
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
    () =>
      normalizeEntries({
        employeeOfMonthEntries,
        leadershipEntries,
        communityEntries,
        customerWinEntries,
      }),
    [employeeOfMonthEntries, leadershipEntries, communityEntries, customerWinEntries]
  );

  return (
    <div className="card relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
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

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading company news…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">No company news has been published yet.</p>
        ) : (
          items.map((item) => <NewsItem key={item.key} item={item} />)
        )}
      </div>
    </div>
  );
}
