import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { normalizeFacilityParam } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { useResourceProgress } from "../hooks/useResourceProgress";
import api from "../services/api";
import ResourceDocumentGridCard from "../components/resources/ResourceDocumentGridCard";
import { CATEGORIES, computeProgress, mergeLmsResourceItems, seedItems } from "../utils/resourcesContent";

function documentMetaLine(d) {
  if (d.meta) return d.meta;
  if (d.created_at) {
    try {
      return `Uploaded ${new Date(d.created_at).toLocaleDateString()}`;
    } catch {
      return "Document";
    }
  }
  return "Document";
}

export default function ResourcesCategoryPage() {
  const { facility, category } = useParams();
  const facilityNorm = normalizeFacilityParam(facility);
  const key = (category || "").toLowerCase();
  const { user } = useAuth();

  const current = useMemo(() => CATEGORIES.find((c) => c.key === key), [key]);
  const seedBlock = useMemo(() => seedItems(key), [key]);
  const [lmsVideos, setLmsVideos] = useState([]);
  const [lmsDocs, setLmsDocs] = useState([]);
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
    if (!facilityNorm || !current) return undefined;
    let cancelled = false;
    setLmsLoadError(null);
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

  if (!facilityNorm) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  if (!current) {
    return <div className={PAGE_PADDING}>Unknown resources category.</div>;
  }

  const { totalCount, completedCount, progress } = computeProgress({ items, completedSet: completed });

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
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Videos and documents for {current.label} at {facilityNorm}. Training videos from{" "}
          <strong className="font-semibold text-slate-800 dark:text-slate-100">Learning admin</strong> appear here when
          the course facility is <strong className="font-semibold">{facilityNorm}</strong> and the course is set to{" "}
          <strong className="font-semibold">Resources → {current.label}</strong> (“Also list under Resources”). Upload
          documents from Learning admin as well.
        </p>
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

      <div className="grid gap-4 lg:grid-cols-[1fr,220px]">
        <section className="space-y-6">
          <section className="card">
            <h2 className="mb-1 text-lg font-semibold">Videos</h2>
            {lmsVideos.length > 0 ? (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                Includes {lmsVideos.length} training upload{lmsVideos.length === 1 ? "" : "s"} from Learning admin
                (tagged {current.label} · {facilityNorm}).
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                No admin-uploaded videos for <strong className="font-semibold text-slate-700 dark:text-slate-200">{current.label}</strong> at{" "}
                <strong className="font-semibold text-slate-700 dark:text-slate-200">{facilityNorm}</strong> yet. In Learning admin, the course facility and{" "}
                <strong className="font-semibold">Also list under Resources</strong> must match this page (e.g. Sales
                uploads only appear under the <strong className="font-semibold">Sales</strong> tile). Open{" "}
                <strong className="font-semibold">Member Portal → {facilityNorm} → Resources → {current.label}</strong> after
                saving the course.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.videos.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No videos yet.</div>
              ) : (
                items.videos.map((v) => {
                  const done = completed.has(v.id);
                  return (
                    <div key={v.id} className="rounded-xl border p-3 dark:border-slate-700">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link
                            to={`${resourcesBase}/${key}/video/${v.id}`}
                            className="font-bold text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green"
                          >
                            {v.title}
                          </Link>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {v.meta}
                            {String(v.id || "").startsWith("lesson-") ? (
                              <span className="ml-2 font-medium text-brand-blue dark:text-brand-green">
                                · Training upload
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleComplete(v.id)}
                          className={done ? "btn-success shrink-0" : "btn-outline shrink-0"}
                        >
                          {done ? "Completed" : "Mark done"}
                        </button>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-xl bg-black/5 dark:bg-black/30">
                        <Link to={`${resourcesBase}/${key}/video/${v.id}`} className="block">
                          <video preload="metadata" className="aspect-video w-full" src={v.url} />
                        </Link>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Click to open.</div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-1 text-lg font-semibold">Documents</h2>
            {lmsDocs.length > 0 ? (
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                Includes {lmsDocs.length} file{lmsDocs.length === 1 ? "" : "s"} from Learning admin ({current.label} ·{" "}
                {facilityNorm}).
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                No PDFs or files uploaded for <strong className="font-semibold text-slate-700 dark:text-slate-200">{current.label}</strong> at{" "}
                <strong className="font-semibold text-slate-700 dark:text-slate-200">{facilityNorm}</strong> yet. Upload
                them in Learning admin → <strong className="font-semibold">Documents</strong> with the same facility and
                category.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.docs.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No documents yet.</div>
              ) : (
                items.docs.map((d) => {
                  const done = completed.has(d.id);
                  const docPath =
                    d.docId != null && resourcesBase
                      ? `${resourcesBase}/${key}/document/${d.docId}`
                      : null;
                  const metaLine = documentMetaLine(d);
                  const hint = docPath
                    ? "Opens in this app (same as videos)."
                    : "Checklist item — use Mark done when finished.";
                  return (
                    <ResourceDocumentGridCard
                      key={d.id}
                      title={d.title}
                      url={d.url}
                      metaLine={metaLine}
                      linkTo={docPath || undefined}
                      tailHint={hint}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => void toggleComplete(d.id)}
                          className={done ? "btn-success" : "btn-outline"}
                        >
                          {done ? "Completed" : "Mark done"}
                        </button>
                      }
                    />
                  );
                })
              )}
            </div>
          </section>
        </section>

        <aside className="card p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Categories</h2>
          <div className="flex flex-col gap-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                to={`${resourcesBase}/${c.key}`}
                className={`w-full no-underline ${c.key === current.key ? "btn-primary" : "btn-outline"}`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
