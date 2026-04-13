import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { normalizeFacilityParam } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import { useResourceProgress } from "../hooks/useResourceProgress";
import api, { getApiBaseURL } from "../services/api";
import { CATEGORIES, computeProgress, mergeLmsResourceItems, seedItems } from "../utils/resourcesContent";

/** PDF / images / plain text: load through authenticated API stream (same bucket as videos). */
function shouldUseAuthStream(fileUrl) {
  const p = String(fileUrl || "").split("?")[0].toLowerCase();
  if (p.endsWith(".pdf")) return true;
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(p)) return true;
  if (p.endsWith(".txt")) return true;
  return false;
}

function gviewUrl(fileUrl) {
  return `https://docs.google.com/gview?url=${encodeURIComponent(String(fileUrl || "").trim())}&embedded=true`;
}

export default function ResourceDocumentPage() {
  const { facility, category, docId } = useParams();
  const navigate = useNavigate();
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

  const numericId = useMemo(() => {
    const n = Number(docId);
    return Number.isFinite(n) ? n : null;
  }, [docId]);

  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [viewSrc, setViewSrc] = useState(null);
  const [viewMode, setViewMode] = useState("idle"); // idle | loading | iframe | img | text | empty
  const [textContent, setTextContent] = useState(null);

  const progressId = doc ? `doc-${doc.id}` : null;

  const displayFac = doc ? String(doc.business_unit).toUpperCase() : facilityNorm;
  const displayCatKey = doc ? String(doc.category || "").toLowerCase().trim() : key;
  const displayCatLabel = CATEGORIES.find((c) => c.key === displayCatKey)?.label || displayCatKey;
  const displayResourcesBase = `/facilities/${displayFac}/resources`;

  const { completed, setItemCompleted } = useResourceProgress(
    facilityNorm,
    key,
    Boolean(current && facilityNorm && user && doc)
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
    if (numericId == null || !facilityNorm || !current) {
      setDoc(null);
      setLoadError(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let didRedirect = false;
    setLoading(true);
    setLoadError(null);
    setDoc(null);
    api
      .get(`/resources/documents/${numericId}`)
      .then((r) => {
        if (cancelled) return;
        const row = r.data;
        if (!row) {
          setDoc(null);
          setLoadError("notfound");
          return;
        }
        const rowFac = String(row.business_unit).toUpperCase();
        const rowCat = String(row.category || "").toLowerCase().trim();
        if (rowFac !== facilityNorm || rowCat !== key) {
          didRedirect = true;
          navigate(`/facilities/${rowFac}/resources/${rowCat}/document/${row.id}`, { replace: true });
          return;
        }
        setDoc(row);
      })
      .catch((err) => {
        if (cancelled) return;
        setDoc(null);
        const st = err.response?.status;
        if (st === 403) setLoadError("forbidden");
        else if (st === 404) setLoadError("notfound");
        else setLoadError("error");
      })
      .finally(() => {
        if (!cancelled && !didRedirect) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [numericId, facilityNorm, key, current, navigate]);

  useEffect(() => {
    if (!doc?.id || !doc?.file_url) {
      setViewSrc(null);
      setViewMode("empty");
      setTextContent(null);
      return undefined;
    }

    let blobUrl = null;
    let cancelled = false;

    const path = String(doc.file_url).split("?")[0].toLowerCase();

    const applyBlob = (blob) => {
      if (path.endsWith(".txt")) {
        setViewSrc(null);
        setViewMode("text");
        setTextContent(null);
        blob
          .text()
          .then((t) => {
            if (!cancelled) setTextContent(t);
          })
          .catch(() => {
            if (!cancelled) {
              setTextContent(null);
              setViewMode("iframe");
              setViewSrc(gviewUrl(doc.file_url));
            }
          });
        return;
      }
      blobUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      setViewSrc(blobUrl);
      if (path.endsWith(".pdf")) setViewMode("iframe");
      else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) setViewMode("img");
      else setViewMode("iframe");
    };

    if (shouldUseAuthStream(doc.file_url)) {
      setViewMode("loading");
      setTextContent(null);
      const token = localStorage.getItem("token");
      fetch(`${getApiBaseURL()}/resources/documents/${doc.id}/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => {
          if (!r.ok) throw new Error("stream");
          return r.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          applyBlob(blob);
        })
        .catch(() => {
          if (cancelled) return;
          setViewSrc(gviewUrl(doc.file_url));
          setViewMode("iframe");
        });
    } else {
      setViewMode("iframe");
      setViewSrc(gviewUrl(doc.file_url));
      setTextContent(null);
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [doc?.id, doc?.file_url]);

  if (!facilityNorm) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  if (!current) {
    return <div className={PAGE_PADDING}>Unknown resources category.</div>;
  }

  if (numericId == null) {
    return <div className={PAGE_PADDING}>Invalid document.</div>;
  }

  if (loading) {
    return (
      <main className={PAGE_SHELL}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading document…</p>
      </main>
    );
  }

  if (!doc) {
    const msg =
      loadError === "forbidden"
        ? "You don’t have access to this document’s facility."
        : loadError === "notfound"
          ? "Document not found. It may have been deleted, or the link may be wrong — open it from Facilities → Resources → Documents for the correct facility and category."
          : "Could not load this document. Check that the backend is running and you are signed in.";
    return <div className={PAGE_PADDING}>{msg}</div>;
  }

  const done = progressId ? completed.has(progressId) : false;
  const { totalCount, completedCount, progress } = computeProgress({ items, completedSet: completed });

  const markDone = () => {
    if (!progressId) return;
    void setItemCompleted(progressId, true);
  };

  return (
    <main className={PAGE_SHELL}>
      <nav className="text-xs text-slate-600 dark:text-slate-400">
        <Link
          to={`/facilities/${displayFac}`}
          className="font-semibold text-brand-blue hover:underline dark:text-brand-green"
        >
          {displayFac} facility
        </Link>
        <span className="mx-1.5 text-slate-400" aria-hidden>
          /
        </span>
        <Link
          to={`${displayResourcesBase}/${displayCatKey}`}
          className="font-semibold text-brand-blue hover:underline dark:text-brand-green"
        >
          Resources
        </Link>
        <span className="mx-1.5 text-slate-400" aria-hidden>
          /
        </span>
        <span className="text-slate-500 dark:text-slate-400">{displayCatLabel}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-brand-blue dark:text-brand-green">
            Resources · {displayFac}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{doc.title}</h1>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {displayCatLabel} · Document · Stored on DigitalOcean (same bucket as videos)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`${displayResourcesBase}/${displayCatKey}`} className="btn-outline no-underline">
            Back
          </Link>
          <button type="button" onClick={markDone} disabled={done || !progressId} className="btn-primary">
            {done ? "Completed" : "Mark complete"}
          </button>
        </div>
      </div>

      <section className="card overflow-hidden p-0">
        {!doc.file_url?.trim() ? (
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">No file URL.</p>
        ) : viewMode === "loading" ? (
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading file…</p>
        ) : viewMode === "img" && viewSrc ? (
          <div className="flex max-h-[85vh] justify-center overflow-auto bg-black/5 p-4 dark:bg-black/30">
            <img src={viewSrc} alt="" className="max-h-[85vh] max-w-full object-contain" />
          </div>
        ) : viewMode === "text" ? (
          <div className="max-h-[85vh] overflow-auto p-4">
            {textContent == null ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Loading text…</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-sm text-slate-800 dark:text-slate-100">
                {textContent ?? ""}
              </pre>
            )}
          </div>
        ) : viewMode === "iframe" && viewSrc ? (
          <iframe
            title={doc.title}
            src={viewSrc}
            className="h-[85vh] w-full border-0 bg-white dark:bg-slate-900"
          />
        ) : (
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">Unable to display this file type.</p>
        )}
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
