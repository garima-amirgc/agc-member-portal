import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { EmployeeOfMonthCardShell } from "../components/EmployeeOfMonthCardDecor";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";

function dedupeById(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

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
      link: `/leadership-updates/${encodeURIComponent(String(entry.id))}`,
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
      link: `/community-involvement/${encodeURIComponent(String(entry.id))}`,
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
      link: `/customer-wins/${encodeURIComponent(String(entry.id))}`,
    });
  }

  items.sort((a, b) => {
    const at = a.dateValue ? new Date(a.dateValue).getTime() : 0;
    const bt = b.dateValue ? new Date(b.dateValue).getTime() : 0;
    return bt - at;
  });

  return items;
}

function NewsCard({ item }) {
  const img = item.image ? resolvePublicMediaUrl(item.image) : "";
  const dateLabel = formatSpotlightFeedDate(item.dateValue);

  return (
    <Link to={item.link} className="block h-full">
      <EmployeeOfMonthCardShell className="flex h-full flex-col gap-3 p-4">
        <div className="flex gap-4">
          {img ? (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white shadow-md ring-2 ring-[#A7D344]/50">
              <img src={img} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">{item.title}</h2>
              {item.facility ? (
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                  {item.facility}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {dateLabel ? `${dateLabel} · ` : ""}
              {item.category}
            </p>
          </div>
        </div>
        {item.excerpt ? (
          <p className="line-clamp-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.excerpt}</p>
        ) : null}
      </EmployeeOfMonthCardShell>
    </Link>
  );
}

export default function CompanyNewsArchivePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    Promise.allSettled([
      api.get("/employee-of-month/current"),
      api.get("/employee-of-month/history"),
      api.get("/leadership-updates/current"),
      api.get("/community-involvement/current"),
      api.get("/customer-wins/current"),
    ])
      .then(([eomCurrent, eomHistory, leadership, community, customerWins]) => {
        if (!alive) return;
        const employeeOfMonthEntries = dedupeById([
          eomCurrent.status === "fulfilled" ? eomCurrent.value.data : [],
          eomHistory.status === "fulfilled" ? eomHistory.value.data : [],
        ]);
        const leadershipEntries = leadership.status === "fulfilled" ? leadership.value.data : [];
        const communityEntries = community.status === "fulfilled" ? community.value.data : [];
        const customerWinEntries = customerWins.status === "fulfilled" ? customerWins.value.data : [];

        setItems(
          normalizeEntries({
            employeeOfMonthEntries,
            leadershipEntries,
            communityEntries,
            customerWinEntries,
          })
        );
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.response?.data?.message || "Could not load company news.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Company News" subtitle="Everything from across the company" />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        <Link to="/" className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green">
          Back to home
        </Link>
      </p>

      {loading ? (
        <div className="card">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      ) : error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">No company news has been published yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <NewsCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
