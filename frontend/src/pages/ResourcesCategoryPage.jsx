import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { normalizeFacilityParam } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { useResourceProgress } from "../hooks/useResourceProgress";
import api from "../services/api";
import ResourceDocumentPreview from "../components/resources/ResourceDocumentPreview";
import { CATEGORIES, computeProgress, mergeLmsResourceItems, seedItems } from "../utils/resourcesContent";

function formatAddedDate(raw) {
  if (raw == null || raw === "") return null;
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

export default function ResourcesCategoryPage() {
  const { facility, category } = useParams();
  const facilityNorm = normalizeFacilityParam(facility);
  const key = (category || "").toLowerCase();
  const { user } = useAuth();
  const [contentTab, setContentTab] = useState("videos");
  const [videosLoading, setVideosLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [categoryCountsLoading, setCategoryCountsLoading] = useState(true);

  const current = useMemo(() => CATEGORIES.find((c) => c.key === key), [key]);
  const seedBlock = useMemo(() => seedItems(key), [key]);
  const [lmsVideos, setLmsVideos] = useState([]);
  const [lmsDocs, setLmsDocs] = useState([]);
  const [lmsReports, setLmsReports] = useState([]);
  const [lmsLoadError, setLmsLoadError] = useState(null);
  const items = useMemo(
    () => mergeLmsResourceItems(seedBlock, lmsVideos, lmsDocs),
    [seedBlock, lmsVideos, lmsDocs]
  );

  const { completed, toggleComplete } = useResourceProgress(
    facilityNorm,
    key,
    Boolean(current && facilityNorm && user)
  );

  const resourcesBase = facilityNorm ? `/facilities/${facilityNorm}/resources` : "";

  useEffect(() => {
    if (!facilityNorm) return;
    let cancelled = false;
    setCategoryCountsLoading(true);
    (async () => {
      const out = {};
      await Promise.all(
        CATEGORIES.map(async (c) => {
          const catKey = c.key;
          const [videosRes, docsRes, reportsRes] = await Promise.allSettled([
            api.get(`/resources/facility/${facilityNorm}/category/${catKey}`),
            api.get(`/resources/facility/${facilityNorm}/category/${catKey}/documents`),
            catKey === "it"
              ? api.get(`/resources/facility/${facilityNorm}/category/${catKey}/reports`)
              : Promise.resolve({ data: { reports: [] } }),
          ]);
          const videos =
            videosRes.status === "fulfilled" && Array.isArray(videosRes.value?.data?.videos)
              ? videosRes.value.data.videos
              : [];
          const docs =
            docsRes.status === "fulfilled" && Array.isArray(docsRes.value?.data?.documents)
              ? docsRes.value.data.documents
              : [];
          const reports =
            reportsRes.status === "fulfilled" && Array.isArray(reportsRes.value?.data?.reports)
              ? reportsRes.value.data.reports
              : [];
          out[catKey] = {
            videos: videos.length,
            docs: docs.length,
            reports: reports.length,
            total: videos.length + docs.length + reports.length,
          };
        })
      );
      if (cancelled) return;
      setCategoryCounts(out);
      setCategoryCountsLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setCategoryCounts({});
        setCategoryCountsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm]);

  useEffect(() => {
    if (!facilityNorm || !current) return undefined;
    let cancelled = false;
    setLmsLoadError(null);
    setVideosLoading(true);
    api
      .get(`/resources/facility/${facilityNorm}/category/${key}`)
      .then((videosRes) => {
        if (cancelled) return;
        setLmsVideos(Array.isArray(videosRes.data?.videos) ? videosRes.data.videos : []);
        setLmsLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLmsVideos([]);
        const st = err.response?.status;
        if (st === 403) {
          setLmsLoadError(
            "You don’t have access to facility training uploads for this page. Ask an admin to add this facility to your profile."
          );
        } else if (st === 401) {
          setLmsLoadError("Your session may have expired — try signing in again.");
        } else {
          setLmsLoadError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, key, current]);

  useEffect(() => {
    if (!facilityNorm || !current) return undefined;
    let cancelled = false;
    setDocsLoading(true);
    api
      .get(`/resources/facility/${facilityNorm}/category/${key}/documents`)
      .then((docsRes) => {
        if (cancelled) return;
        setLmsDocs(Array.isArray(docsRes.data?.documents) ? docsRes.data.documents : []);
      })
      .catch(() => {
        if (!cancelled) setLmsDocs([]);
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, key, current]);

  useEffect(() => {
    if (!facilityNorm || !current || key !== "it") {
      setLmsReports([]);
      setReportsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setReportsLoading(true);
    api
      .get(`/resources/facility/${facilityNorm}/category/${key}/reports`)
      .then((reportsRes) => {
        if (cancelled) return;
        setLmsReports(Array.isArray(reportsRes.data?.reports) ? reportsRes.data.reports : []);
      })
      .catch(() => {
        if (!cancelled) setLmsReports([]);
      })
      .finally(() => {
        if (!cancelled) setReportsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, key, current]);

  useEffect(() => {
    setContentTab("videos");
  }, [key, facilityNorm]);

  if (!facilityNorm) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  if (!current) {
    return <div className={PAGE_PADDING}>Unknown resources category.</div>;
  }

  const { totalCount, completedCount, progress } = computeProgress({ items, completedSet: completed });
  const hasVideos = (items?.videos || []).length > 0;
  const hasDocs = (items?.docs || []).length > 0;
  const hasReports = key === "it" && (lmsReports || []).length > 0;
  const showTabs = hasVideos || hasDocs || hasReports;
  const visibleCategories = useMemo(() => {
    if (categoryCountsLoading) return CATEGORIES;
    return CATEGORIES.filter((c) => (categoryCounts?.[c.key]?.total || 0) > 0);
  }, [categoryCounts, categoryCountsLoading]);

  useEffect(() => {
    if (videosLoading || docsLoading || reportsLoading) return;
    if (contentTab === "videos" && !hasVideos) {
      if (hasDocs) setContentTab("documentation");
      else if (hasReports) setContentTab("reports");
    }
    if (contentTab === "documentation" && !hasDocs) {
      if (hasVideos) setContentTab("videos");
      else if (hasReports) setContentTab("reports");
    }
    if (contentTab === "reports" && !hasReports) {
      if (hasVideos) setContentTab("videos");
      else if (hasDocs) setContentTab("documentation");
    }
  }, [contentTab, hasVideos, hasDocs, hasReports, videosLoading, docsLoading, reportsLoading]);

  return (
    <main className={PAGE_SHELL}>
      <nav className="text-xs text-slate-600 dark:text-slate-400">
        <Link
          to={`/facilities/${facilityNorm}`}
          className="font-semibold text-brand-blue hover:underline dark:text-brand-green"
        >
          {facilityNorm} facility
        </Link>
        <span className="mx-1.5 text-slate-400" aria-hidden>
          /
        </span>
        <span className="text-slate-500 dark:text-slate-400">Resources</span>
      </nav>

      <section className="card">
        <div className="text-sm font-bold text-brand-blue dark:text-brand-green">
          Resources · {facilityNorm}
        </div>
        <h1 className="mt-1 text-2xl font-bold">{current.label}</h1>
        {lmsLoadError ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            {lmsLoadError}
          </p>
        ) : null}
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <div className="font-semibold">Progress</div>
              <div className="text-slate-600 dark:text-slate-300">
                {completedCount}/{totalCount} ({progress}%)
              </div>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr,176px]">
        <section className="min-w-0">
          {showTabs ? (
            <div className="relative flex items-end gap-3">
              {hasVideos ? (
                <button
                  type="button"
                  onClick={() => setContentTab("videos")}
                  className={[
                    "relative -mb-px rounded-t-2xl border px-4 py-2.5 text-base font-semibold transition",
                    "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
                    "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
                    contentTab === "videos"
                      ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
                      : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
                  ].join(" ")}
                  role="tab"
                  aria-selected={contentTab === "videos"}
                >
                  Video
                </button>
              ) : null}
              {hasDocs ? (
                <button
                  type="button"
                  onClick={() => setContentTab("documentation")}
                  className={[
                    "relative -mb-px rounded-t-2xl border px-4 py-2.5 text-base font-semibold transition",
                    "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
                    "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
                    contentTab === "documentation"
                      ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
                      : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
                  ].join(" ")}
                  role="tab"
                  aria-selected={contentTab === "documentation"}
                >
                  Documentation
                </button>
              ) : null}
              {hasReports ? (
                <button
                  type="button"
                  onClick={() => setContentTab("reports")}
                  className={[
                    "relative -mb-px rounded-t-2xl border px-4 py-2.5 text-base font-semibold transition",
                    "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
                    "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
                    contentTab === "reports"
                      ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
                      : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
                  ].join(" ")}
                  role="tab"
                  aria-selected={contentTab === "reports"}
                >
                  Reports
                </button>
              ) : null}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          ) : null}

          <div
            className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            role="tabpanel"
          >
            {!showTabs ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No content yet.</div>
            ) : null}

            {contentTab === "videos" && hasVideos ? (
              <div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {items.videos.map((v) => {
                      const done = completed.has(v.id);
                      const courseTitle =
                        (v.course_title != null && String(v.course_title).trim()
                          ? String(v.course_title).trim()
                          : null) ||
                        (v.meta != null && String(v.meta).trim() ? String(v.meta).trim() : "");
                      const heading =
                        courseTitle || (v.title != null && String(v.title).trim() ? String(v.title).trim() : "Training");
                      const courseDesc =
                        v.description != null && String(v.description).trim()
                          ? String(v.description).trim()
                          : "";
                      const added = formatAddedDate(v.added_at);
                      const videoPath = `${resourcesBase}/${key}/video/${v.id}`;
                      return (
                        <div
                          key={v.id}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40"
                        >
                          <div className="min-w-0">
                            <Link
                              to={videoPath}
                              className="text-base font-bold leading-snug text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green"
                            >
                              {heading}
                            </Link>
                            {courseDesc ? (
                              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                {courseDesc}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-600/60">
                            <span className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                              {added ? <>Uploaded on {added}</> : <span className="text-slate-400">Upload date —</span>}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleComplete(v.id)}
                              className={
                                done
                                  ? "shrink-0 inline-flex items-center justify-center rounded-full border-2 border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.99] dark:border-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                                  : "shrink-0 inline-flex items-center justify-center rounded-full border-2 border-[rgba(11,62,175,0.28)] bg-white px-2.5 py-1 text-xs font-semibold text-[#000000] transition hover:border-[#0B3EAF] hover:bg-[#f7f9fe] hover:text-[#0B3EAF] active:scale-[0.99] dark:border-[rgba(167,211,68,0.4)] dark:bg-[#141414] dark:text-[#f5f5f5] dark:hover:border-[#A7D344] dark:hover:bg-[#1a1a1a] dark:hover:text-[#A7D344]"
                              }
                            >
                              {done ? "Completed" : "Mark done"}
                            </button>
                          </div>

                          <div className="overflow-hidden rounded-xl bg-black/5 dark:bg-black/30">
                            <Link to={videoPath} className="block" aria-label={`Open video: ${heading}`}>
                              <video preload="metadata" className="aspect-video w-full" src={v.url} />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}

            {contentTab === "documentation" && hasDocs ? (
              <div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {items.docs.map((d) => {
                      const done = completed.has(d.id);
                      const docPath =
                        d.docId != null && resourcesBase
                          ? `${resourcesBase}/${key}/document/${d.docId}`
                          : null;
                      const added = formatAddedDate(d.added_at ?? d.created_at);
                      return (
                        <div
                          key={d.id}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40"
                        >
                          <div className="min-w-0">
                            {docPath ? (
                              <Link
                                to={docPath}
                                className="text-base font-bold leading-snug text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green"
                              >
                                {d.title}
                              </Link>
                            ) : (
                              <div className="text-base font-bold leading-snug text-brand-blue dark:text-brand-green">
                                {d.title}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-600/60">
                            <span className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                              {added ? (
                                <>Uploaded on {added}</>
                              ) : (
                                <span className="text-slate-400">Upload date —</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleComplete(d.id)}
                              className={
                                done
                                  ? "shrink-0 inline-flex items-center justify-center rounded-full border-2 border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.99] dark:border-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                                  : "shrink-0 inline-flex items-center justify-center rounded-full border-2 border-[rgba(11,62,175,0.28)] bg-white px-2.5 py-1 text-xs font-semibold text-[#000000] transition hover:border-[#0B3EAF] hover:bg-[#f7f9fe] hover:text-[#0B3EAF] active:scale-[0.99] dark:border-[rgba(167,211,68,0.4)] dark:bg-[#141414] dark:text-[#f5f5f5] dark:hover:border-[#A7D344] dark:hover:bg-[#1a1a1a] dark:hover:text-[#A7D344]"
                              }
                            >
                              {done ? "Completed" : "Mark done"}
                            </button>
                          </div>

                          <div className="overflow-hidden rounded-xl bg-black/5 dark:bg-black/30">
                            {docPath ? (
                              <Link to={docPath} className="block" aria-label={`Open document: ${d.title}`}>
                                <ResourceDocumentPreview url={d.url} />
                              </Link>
                            ) : (
                              <ResourceDocumentPreview url={d.url} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}

            {contentTab === "reports" && hasReports ? (
              <div className="grid gap-3 md:grid-cols-2">
                {lmsReports.map((r) => {
                  const desc =
                    r.description != null && String(r.description).trim()
                      ? String(r.description).trim()
                      : "";
                  const added = formatAddedDate(r.created_at);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="min-w-0">
                        <h3 className="text-base font-bold leading-snug text-brand-blue dark:text-brand-green">
                          {r.title}
                        </h3>
                        {desc ? (
                          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{desc}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-600/60">
                        <span className="min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {added ? <>Added {added}</> : <span className="text-slate-400">Report dashboard</span>}
                        </span>
                        <a
                          href={r.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center justify-center rounded-full border-2 border-[rgba(11,62,175,0.28)] bg-white px-3 py-1 text-xs font-semibold text-[#0B3EAF] transition hover:border-[#0B3EAF] hover:bg-[#f7f9fe] dark:border-[rgba(167,211,68,0.4)] dark:bg-[#141414] dark:text-[#A7D344] dark:hover:border-[#A7D344]"
                        >
                          Open dashboard
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="card p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Categories</h2>
          <div className="flex flex-col gap-2">
            {categoryCountsLoading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : visibleCategories.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No categories yet.</div>
            ) : (
              visibleCategories.map((c) => (
                <Link
                  key={c.key}
                  to={`${resourcesBase}/${c.key}`}
                  className={`w-full no-underline ${c.key === current.key ? "btn-primary" : "btn-outline"}`}
                >
                  {c.label}
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
