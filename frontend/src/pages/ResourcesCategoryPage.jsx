import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { normalizeFacilityParam } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { useResourceProgress } from "../hooks/useResourceProgress";
import api from "../services/api";
import ResourceDocumentPreview from "../components/resources/ResourceDocumentPreview";
import { CATEGORIES, computeProgress, mergeLmsResourceItems, seedItems } from "../utils/resourcesContent";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { hasAdminGrant } from "../utils/adminAccess";

const GENERAL_TOPIC = "__general__";

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

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative -mb-px rounded-t-2xl border px-3 py-2 text-sm font-semibold transition sm:px-4 sm:py-2.5 sm:text-base",
        "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
        "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
        active
          ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
          : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
      ].join(" ")}
      role="tab"
      aria-selected={active}
    >
      {label}
    </button>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ v, resourcesBase, category: key, completed, toggleComplete }) {
  const done = completed.has(v.id);
  const courseTitle =
    (v.course_title != null && String(v.course_title).trim() ? String(v.course_title).trim() : null) ||
    (v.meta != null && String(v.meta).trim() ? String(v.meta).trim() : "");
  const heading =
    courseTitle || (v.title != null && String(v.title).trim() ? String(v.title).trim() : "Training");
  const courseDesc =
    v.description != null && String(v.description).trim() ? String(v.description).trim() : "";
  const added = formatAddedDate(v.added_at);
  const videoPath = `${resourcesBase}/${key}/video/${v.id}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
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
}

// ─── Document card ────────────────────────────────────────────────────────────
function DocCard({ d, resourcesBase, category: key, completed, toggleComplete }) {
  const done = completed.has(d.id);
  const docPath =
    d.docId != null && resourcesBase ? `${resourcesBase}/${key}/document/${d.docId}` : null;
  const added = formatAddedDate(d.added_at ?? d.created_at);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
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
          {added ? <>Uploaded on {added}</> : <span className="text-slate-400">Upload date —</span>}
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
}

export default function ResourcesCategoryPage() {
  const { facility, category } = useParams();
  const facilityNorm = normalizeFacilityParam(facility);
  const key = (category || "").toLowerCase();
  const { user } = useAuth();
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

  // Items for progress tracking (merges seed + LMS)
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
  const isLearningAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.LEARNING_ADMIN);

  // ── Tab sort order ────────────────────────────────────────────────────────────
  const [savedTabOrder, setSavedTabOrder] = useState([]); // persisted order from backend
  const [showArrange, setShowArrange] = useState(false);
  const [arrangeOrder, setArrangeOrder] = useState([]); // draft order inside modal
  const [savingOrder, setSavingOrder] = useState(false);
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  // Load saved order when facility/category changes
  useEffect(() => {
    if (!facilityNorm || !key) return;
    api.get(`/resources/topic-order/${facilityNorm}/${key}`)
      .then((r) => setSavedTabOrder(Array.isArray(r.data?.order) ? r.data.order : []))
      .catch(() => setSavedTabOrder([]));
  }, [facilityNorm, key]);

  const saveTabOrder = async (order) => {
    setSavingOrder(true);
    try {
      await api.put(`/resources/topic-order/${facilityNorm}/${key}`, { order });
      setSavedTabOrder(order);
      setShowArrange(false);
    } catch (e) {
      window.alert(e.response?.data?.message || "Could not save order.");
    } finally {
      setSavingOrder(false);
    }
  };

  // ── Topic tabs ───────────────────────────────────────────────────────────────

  /**
   * Build a list of unique topic tabs from videos and docs.
   * Items with no topic (or topic = null/"") are bucketed under GENERAL_TOPIC.
   * Returns: [{ id, label, videos, docs }]  sorted so "General" is always last.
   */
  const topicGroups = useMemo(() => {
    const map = new Map(); // topic-key → { label, videos: [], docs: [] }

    const getOrCreate = (topicKey, label) => {
      if (!map.has(topicKey)) map.set(topicKey, { label, videos: [], docs: [] });
      return map.get(topicKey);
    };

    for (const v of lmsVideos) {
      const t = v.topic ? String(v.topic).trim() : "";
      const key_ = t || GENERAL_TOPIC;
      const label = t || "General";
      getOrCreate(key_, label).videos.push(v);
    }
    for (const d of lmsDocs) {
      const t = d.topic ? String(d.topic).trim() : "";
      const key_ = t || GENERAL_TOPIC;
      const label = t || "General";
      getOrCreate(key_, label).docs.push(d);
    }

    // Also include seed items (they have no topic → General)
    const seedVideos = items?.videos || [];
    const seedDocs = items?.docs || [];
    const lmsVideoIds = new Set(lmsVideos.map((v) => v.id));
    const lmsDocIds = new Set(lmsDocs.map((d) => d.id));

    // Seed items not already covered by LMS items
    for (const v of seedVideos) {
      if (!lmsVideoIds.has(v.id)) {
        getOrCreate(GENERAL_TOPIC, "General").videos.push(v);
      }
    }
    for (const d of seedDocs) {
      if (!lmsDocIds.has(d.id)) {
        getOrCreate(GENERAL_TOPIC, "General").docs.push(d);
      }
    }

    // Sort: named topics alphabetically, General always last
    const entries = [...map.entries()].map(([id, val]) => ({ id, ...val }));
    entries.sort((a, b) => {
      if (a.id === GENERAL_TOPIC) return 1;
      if (b.id === GENERAL_TOPIC) return -1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });

    return entries.filter((g) => g.videos.length > 0 || g.docs.length > 0);
  }, [lmsVideos, lmsDocs, items]);

  // Apply saved order (unknown tabs go to end, General always last within unknowns)
  const orderedTopicGroups = useMemo(() => {
    if (savedTabOrder.length === 0) return topicGroups;
    const orderMap = new Map(savedTabOrder.map((id, i) => [id, i]));
    return [...topicGroups].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
      if (ai !== bi) return ai - bi;
      // fallback: General last, then alphabetical
      if (a.id === GENERAL_TOPIC) return 1;
      if (b.id === GENERAL_TOPIC) return -1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }, [topicGroups, savedTabOrder]);

  const hasReports = key === "it" && lmsReports.length > 0;

  // All tab ids: one per topic group + optional "reports" tab
  const allTabs = useMemo(() => {
    const tabs = orderedTopicGroups.map((g) => g.id);
    if (hasReports) tabs.push("__reports__");
    return tabs;
  }, [orderedTopicGroups, hasReports]);

  const [activeTab, setActiveTab] = useState(null);

  // When tabs change, reset to first tab
  useEffect(() => {
    if (allTabs.length > 0) {
      setActiveTab((prev) => (allTabs.includes(prev) ? prev : allTabs[0]));
    } else {
      setActiveTab(null);
    }
  }, [allTabs]);

  // Reset when navigating to a different category
  useEffect(() => {
    setActiveTab(null);
  }, [key, facilityNorm]);

  // ── Data fetching ────────────────────────────────────────────────────────────

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
            "You don't have access to facility training uploads for this page. Ask an admin to add this facility to your profile."
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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const visibleCategories = useMemo(() => {
    if (categoryCountsLoading) return CATEGORIES;
    return CATEGORIES.filter((c) => (categoryCounts?.[c.key]?.total || 0) > 0);
  }, [categoryCounts, categoryCountsLoading]);

  if (!facilityNorm) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  if (!current) {
    return <div className={PAGE_PADDING}>Unknown resources category.</div>;
  }

  const { totalCount, completedCount, progress } = computeProgress({ items, completedSet: completed });

  const isLoading = videosLoading || docsLoading || reportsLoading;
  const hasContent = orderedTopicGroups.length > 0 || hasReports;
  const activeGroup = orderedTopicGroups.find((g) => g.id === activeTab);

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

      <div className="grid gap-4 md:grid-cols-[1fr,176px]">
        <section className="min-w-0">
          {/* Topic tabs */}
          {hasContent && allTabs.length > 0 ? (
            <div className="relative flex flex-wrap items-end gap-2 sm:gap-3">
              {orderedTopicGroups.map((g) => (
                <TabBtn
                  key={g.id}
                  label={g.label}
                  active={activeTab === g.id}
                  onClick={() => setActiveTab(g.id)}
                />
              ))}
              {hasReports ? (
                <TabBtn
                  label="Reports"
                  active={activeTab === "__reports__"}
                  onClick={() => setActiveTab("__reports__")}
                />
              ) : null}
              {isLearningAdmin && orderedTopicGroups.length > 1 ? (
                <button
                  type="button"
                  className="ml-auto mb-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  onClick={() => {
                    setArrangeOrder(orderedTopicGroups.map((g) => g.id));
                    setShowArrange(true);
                  }}
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
                  </svg>
                  Arrange tabs
                </button>
              ) : null}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          ) : null}

          {/* Arrange tabs modal */}
          {showArrange ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowArrange(false)}>
              <div
                className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Arrange tabs</h3>
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Drag to reorder, or use the arrows.</p>
                <div className="space-y-2">
                  {arrangeOrder.map((id, idx) => {
                    const label = orderedTopicGroups.find((g) => g.id === id)?.label ?? (id === GENERAL_TOPIC ? "General" : id);
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={() => { dragItem.current = idx; }}
                        onDragEnter={() => { dragOver.current = idx; }}
                        onDragEnd={() => {
                          const next = [...arrangeOrder];
                          const [moved] = next.splice(dragItem.current, 1);
                          next.splice(dragOver.current, 0, moved);
                          setArrangeOrder(next);
                          dragItem.current = null;
                          dragOver.current = null;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex cursor-grab items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 select-none active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-slate-400" fill="currentColor">
                          <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
                          <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
                          <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
                        </svg>
                        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              const next = [...arrangeOrder];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setArrangeOrder(next);
                            }}
                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
                          >
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <button
                            type="button"
                            disabled={idx === arrangeOrder.length - 1}
                            onClick={() => {
                              const next = [...arrangeOrder];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              setArrangeOrder(next);
                            }}
                            className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
                          >
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    disabled={savingOrder}
                    onClick={() => saveTabOrder(arrangeOrder)}
                  >
                    {savingOrder ? "Saving…" : "Save order"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowArrange(false)}
                    disabled={savingOrder}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            role="tabpanel"
          >
            {isLoading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
            ) : !hasContent ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No content yet.</div>
            ) : activeTab === "__reports__" ? (
              /* Reports tab (IT only) */
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
            ) : activeGroup ? (
              /* Topic group tab — shows both videos and docs */
              <div className="space-y-6">
                {activeGroup.videos.length > 0 && (
                  <div>
                    {(activeGroup.videos.length > 0 && activeGroup.docs.length > 0) && (
                      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Videos
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {activeGroup.videos.map((v) => (
                        <VideoCard
                          key={v.id}
                          v={v}
                          resourcesBase={resourcesBase}
                          category={key}
                          completed={completed}
                          toggleComplete={toggleComplete}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {activeGroup.docs.length > 0 && (
                  <div>
                    {(activeGroup.videos.length > 0 && activeGroup.docs.length > 0) && (
                      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Documents
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {activeGroup.docs.map((d) => (
                        <DocCard
                          key={d.id}
                          d={d}
                          resourcesBase={resourcesBase}
                          category={key}
                          completed={completed}
                          toggleComplete={toggleComplete}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="card order-first p-3 md:order-last">
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
