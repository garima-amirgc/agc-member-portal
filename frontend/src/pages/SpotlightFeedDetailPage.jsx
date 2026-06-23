import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { EmployeeOfMonthCardShell } from "../components/EmployeeOfMonthCardDecor";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

export default function SpotlightFeedDetailPage({ feed }) {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get(`${feed.apiBase}/${encodeURIComponent(String(id))}`)
      .then(({ data }) => {
        if (!alive) return;
        setEntry(data?.title ? data : null);
      })
      .catch((err) => {
        if (!alive) return;
        setEntry(null);
        setError(err.response?.data?.message || "Could not load this entry.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [feed.apiBase, id]);

  const title = String(entry?.title || "").trim();
  const description = String(entry?.description || "").trim();
  const linkUrl = String(entry?.link_url || "").trim();
  const img = entry?.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const dateLabel = formatSpotlightFeedDate(entry?.created_at);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title={feed.pageTitle} subtitle={title || feed.detailSubtitleFallback} />

      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
        <Link to="/" className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green">
          Back to home
        </Link>
        <Link
          to={feed.archivePath}
          className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green"
        >
          {feed.archivePastLabel}
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
      ) : !entry ? (
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">This entry could not be found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <EmployeeOfMonthCardShell showBackgroundStar={feed.showBackgroundStar !== false} className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {img ? (
                <div className="mx-auto h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-white shadow-md ring-2 ring-[#A7D344]/60 sm:mx-0">
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 text-left">
                {dateLabel ? (
                  <p className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                    {dateLabel}
                  </p>
                ) : null}
                <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                {description ? (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {description}
                  </p>
                ) : null}
                {linkUrl ? (
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex text-sm font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
                  >
                    Visit link
                  </a>
                ) : null}
              </div>
            </div>
          </EmployeeOfMonthCardShell>
        </div>
      )}
    </main>
  );
}
