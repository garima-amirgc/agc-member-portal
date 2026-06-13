import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { EmployeeOfMonthCardShell } from "../components/EmployeeOfMonthCardDecor";
import {
  SpotlightFeedCardFooter,
  SpotlightFeedDescription,
  SpotlightFeedReadMoreLink,
  SPOTLIGHT_FEED_GRID_CARD_MIN_H,
} from "../components/SpotlightFeedCardParts";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { formatSpotlightFeedDate, spotlightFeedNeedsReadMore } from "../utils/spotlightFeedDisplay";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function HistoryRow({ feed, entry }) {
  const title = String(entry.title || "").trim();
  const description = String(entry.description || "").trim();
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  return (
    <EmployeeOfMonthCardShell
      showBackgroundStar={feed.showBackgroundStar !== false}
      className={`flex h-full flex-col p-4 ${SPOTLIGHT_FEED_GRID_CARD_MIN_H}`}
    >
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex gap-4">
          {img ? (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white shadow-md ring-2 ring-[#A7D344]/50">
              <img src={img} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 text-left">
            {dateLabel ? (
              <p className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
                {dateLabel}
              </p>
            ) : null}
            <h2 className="mt-0.5 line-clamp-2 text-lg font-semibold text-slate-900 dark:text-white">
              {title || "—"}
            </h2>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <SpotlightFeedDescription
            feed={feed}
            description={description}
            entryId={entry.id}
            lineClampClass="line-clamp-4"
            showReadMore={false}
          />
        </div>
      </div>
      {spotlightFeedNeedsReadMore(description) ? (
        <SpotlightFeedCardFooter>
          <SpotlightFeedReadMoreLink feed={feed} entryId={entry.id} />
        </SpotlightFeedCardFooter>
      ) : null}
    </EmployeeOfMonthCardShell>
  );
}

export default function SpotlightFeedArchivePage({ feed }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get(`${feed.apiBase}/history`)
      .then(({ data }) => {
        if (!alive) return;
        setEntries(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!alive) return;
        setEntries([]);
        const status = err.response?.status;
        if (status === 404) {
          setError(`${feed.archivePastLabel} could not be loaded. The API may need a restart — try again in a moment.`);
        } else {
          setError(err.response?.data?.message || "Could not load entries.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [feed.apiBase, feed.archivePastLabel]);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title={feed.pageTitle} subtitle={feed.archiveSubtitle} />

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
      ) : entries.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">{feed.emptyArchiveMessage}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <HistoryRow key={entry.id} feed={feed} entry={entry} />
          ))}
        </div>
      )}
    </main>
  );
}
