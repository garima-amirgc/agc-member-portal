import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { normalizeFacilityParam } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { useResourceProgress } from "../hooks/useResourceProgress";
import api from "../services/api";
import { CATEGORIES, computeProgress, mergeLmsResourceItems, seedItems } from "../utils/resourcesContent";

export default function ResourceVideoPage() {
  const { facility, category, videoId } = useParams();
  const facilityNorm = normalizeFacilityParam(facility);
  const key = (category || "").toLowerCase();
  const { user } = useAuth();

  const current = useMemo(() => CATEGORIES.find((c) => c.key === key), [key]);
  const seedBlock = useMemo(() => seedItems(key), [key]);
  const [lmsVideos, setLmsVideos] = useState([]);
  const [lmsDocs, setLmsDocs] = useState([]);
  const items = useMemo(
    () => mergeLmsResourceItems(seedBlock, lmsVideos, lmsDocs),
    [seedBlock, lmsVideos, lmsDocs]
  );

  const lessonNumeric = useMemo(() => {
    const m = /^lesson-(\d+)$/.exec(videoId || "");
    return m ? Number(m[1]) : null;
  }, [videoId]);

  const [lmsDetail, setLmsDetail] = useState(null);
  const [lmsDetailLoading, setLmsDetailLoading] = useState(false);

  const resourcesBase = facilityNorm ? `/facilities/${facilityNorm}/resources` : "";

  const { completed, setItemCompleted } = useResourceProgress(
    facilityNorm,
    key,
    Boolean(current && facilityNorm && user)
  );

  useEffect(() => {
    if (!facilityNorm || !current) return undefined;
    let cancelled = false;
    api
      .get(`/resources/facility/${facilityNorm}/category/${key}`)
      .then((videosRes) => {
        if (cancelled) return;
        setLmsVideos(Array.isArray(videosRes.data?.videos) ? videosRes.data.videos : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLmsVideos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, key, current]);

  useEffect(() => {
    if (!facilityNorm || !current) return undefined;
    let cancelled = false;
    api
      .get(`/resources/facility/${facilityNorm}/category/${key}/documents`)
      .then((docsRes) => {
        if (cancelled) return;
        setLmsDocs(Array.isArray(docsRes.data?.documents) ? docsRes.data.documents : []);
      })
      .catch(() => {
        if (!cancelled) setLmsDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, key, current]);

  useEffect(() => {
    if (lessonNumeric == null) {
      setLmsDetail(null);
      return undefined;
    }
    let cancelled = false;
    setLmsDetailLoading(true);
    api
      .get(`/resources/lessons/${lessonNumeric}`)
      .then((r) => {
        if (!cancelled) setLmsDetail(r.data);
      })
      .catch(() => {
        if (!cancelled) setLmsDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLmsDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonNumeric]);

  const video = useMemo(() => {
    if (lessonNumeric != null) return lmsDetail;
    return items.videos.find((v) => v.id === videoId);
  }, [lessonNumeric, lmsDetail, items.videos, videoId]);

  if (!facilityNorm) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  if (!current) {
    return <div className={PAGE_PADDING}>Unknown resources category.</div>;
  }

  if (lessonNumeric != null && lmsDetailLoading) {
    return (
      <main className={PAGE_SHELL}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading video…</p>
      </main>
    );
  }

  if (!video) {
    return <div className={PAGE_PADDING}>Video not found.</div>;
  }

  const done = completed.has(video.id);
  const { totalCount, completedCount, progress } = computeProgress({ items, completedSet: completed });

  const markDone = () => {
    void setItemCompleted(video.id, true);
  };

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
        <Link
          to={`${resourcesBase}/${key}`}
          className="font-semibold text-brand-blue hover:underline dark:text-brand-green"
        >
          Resources
        </Link>
        <span className="mx-1.5 text-slate-400" aria-hidden>
          /
        </span>
        <span className="text-slate-500 dark:text-slate-400">{current.label}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-brand-blue dark:text-brand-green">
            Resources · {facilityNorm}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{video.title}</h1>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {current.label} · {video.meta}
            {lessonNumeric != null ? (
              <span className="ml-2 font-medium text-brand-blue dark:text-brand-green">· Training upload</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`${resourcesBase}/${key}`} className="btn-outline no-underline">
            Back
          </Link>
          <button type="button" onClick={markDone} disabled={done} className="btn-primary">
            {done ? "Completed" : "Mark complete"}
          </button>
        </div>
      </div>

      <section className="card p-4">
        <div className="overflow-hidden rounded-2xl bg-black/5 shadow-inner dark:bg-black/30">
          <video controls preload="metadata" className="aspect-video w-full" src={video.url} />
        </div>
      </section>

      {totalCount > 0 && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div className="font-semibold">Overall progress</div>
            <div className="text-slate-600 dark:text-slate-300">
              {completedCount}/{totalCount} ({progress}%)
            </div>
          </div>
          <ProgressBar value={progress} />
        </section>
      )}
    </main>
  );
}
