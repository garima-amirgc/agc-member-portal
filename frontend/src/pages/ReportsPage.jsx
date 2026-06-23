import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
const REPORT_SIZE_OPTIONS = [
  { label: "Normal", value: 1 },
  { label: "Fit", value: 1.35 },
  { label: "Smaller", value: 1.7 },
  { label: "Smallest", value: 2.1 },
];

function safeTitle(s) {
  return String(s || "").trim() || "Untitled report";
}

function reportEmbedSrc(src) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (/powerbi\.com$/i.test(url.hostname) || /\.powerbi\.com$/i.test(url.hostname)) {
      url.searchParams.set("pageView", "fitToWidth");
      url.searchParams.set("filterPaneEnabled", "false");
      url.searchParams.set("navContentPaneEnabled", "true");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeFacilities(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const cleaned = list.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean);
  const uniq = [...new Set(cleaned)].filter((x) => FACILITIES.includes(x));
  return uniq;
}

function reportFacilities(r) {
  const bu = normalizeFacilities(r?.business_units);
  return bu.length ? bu : FACILITIES;
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeFacility, setActiveFacility] = useState(null);
  const [reportScale, setReportScale] = useState(1.7);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    api
      .get("/reports")
      .then((r) => {
        if (stale) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setReports(list);
        const fromQuery = searchParams.get("id");
        setActiveId((prev) => {
          const nextCandidate = fromQuery || prev;
          if (nextCandidate && list.some((x) => String(x.id) === String(nextCandidate))) return nextCandidate;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (stale) return;
        setReports([]);
        setActiveId(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [searchParams]);

  const active = useMemo(
    () => reports.find((x) => String(x.id) === String(activeId)) || null,
    [reports, activeId]
  );

  const facilityTabs = useMemo(() => {
    const seen = new Set();
    for (const r of reports) for (const f of reportFacilities(r)) seen.add(f);
    return FACILITIES.filter((f) => seen.has(f));
  }, [reports]);

  useEffect(() => {
    if (facilityTabs.length === 0) {
      if (activeFacility !== null) setActiveFacility(null);
      return;
    }
    if (activeFacility && facilityTabs.includes(activeFacility)) return;

    const inferred = active ? reportFacilities(active)[0] : null;
    setActiveFacility(inferred && facilityTabs.includes(inferred) ? inferred : facilityTabs[0]);
  }, [active, activeFacility, facilityTabs]);

  const reportsForFacility = useMemo(() => {
    if (!activeFacility) return [];
    const list = reports.filter((r) => reportFacilities(r).includes(activeFacility));
    return list;
  }, [reports, activeFacility]);

  useEffect(() => {
    if (!activeFacility) return;
    if (!activeId) {
      const first = reportsForFacility[0]?.id ?? null;
      if (first != null) setActiveId(first);
      return;
    }
    const stillValid = reportsForFacility.some((r) => String(r.id) === String(activeId));
    if (!stillValid) {
      const first = reportsForFacility[0]?.id ?? null;
      setActiveId(first);
    }
  }, [activeFacility, activeId, reportsForFacility]);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Reports" />
        {loading ? (
          <div className="card">
            <div className="text-sm text-slate-600 dark:text-slate-300">Loading reports…</div>
          </div>
        ) : reports.length === 0 ? (
          <div className="card">
            <div className="text-sm font-semibold">No reports yet</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Ask an admin to add Power BI embed links under <strong className="font-semibold">Administration → Manage reports</strong>.
            </div>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Facility
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {activeFacility ? `Selected: ${activeFacility}` : ""}
                  </div>
                </div>

                <div className="inline-flex w-full overflow-x-auto rounded-portal border border-slate-200 bg-white/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/25 sm:w-auto">
                  {facilityTabs.map((f) => {
                    const selected = f === activeFacility;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setActiveFacility(f)}
                        className={[
                          "min-w-[64px] rounded-[10px] px-3 py-1.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:focus-visible:ring-brand-green/30",
                          selected
                            ? "bg-[#0B3EAF] text-white shadow-sm dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                            : "text-slate-700 hover:bg-white/80 dark:text-white/85 dark:hover:bg-white/5",
                        ].join(" ")}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/70">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reports
                </div>
                <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
                  {reportsForFacility.map((r) => {
                    const selected = String(r.id) === String(activeId);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setActiveId(r.id)}
                        className={[
                          "shrink-0 rounded-portal border px-3 py-1.5 text-sm font-semibold transition",
                          selected
                            ? "border-brand-blue/35 bg-brand-blue-soft text-brand-black dark:border-brand-green/30 dark:bg-white/10 dark:text-white"
                            : "border-slate-200 bg-white/70 text-slate-900 hover:bg-white dark:border-slate-700 dark:bg-slate-900/20 dark:text-white dark:hover:bg-white/5",
                        ].join(" ")}
                        title={r.description || r.title}
                      >
                        {safeTitle(r.title)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <section className="card -mx-4 min-h-[70vh] rounded-none p-2 sm:mx-0 sm:rounded-portal sm:p-4">
              {active ? (
                <>
                  <div className="mb-3">
                    <div className="flex flex-wrap items-end justify-end gap-2">
                      <div className="shrink-0">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Report size
                        </div>
                        <div className="inline-flex rounded-portal border border-slate-200 bg-white/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/25">
                          {REPORT_SIZE_OPTIONS.map((opt) => {
                            const selected = opt.value === reportScale;
                            return (
                              <button
                                key={opt.label}
                                type="button"
                                onClick={() => setReportScale(opt.value)}
                                className={[
                                  "rounded-[10px] px-2.5 py-1 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:focus-visible:ring-brand-green/30",
                                  selected
                                    ? "bg-[#0B3EAF] text-white shadow-sm dark:bg-[#A7D344] dark:text-[#0a0a0a]"
                                    : "text-slate-700 hover:bg-white/80 dark:text-white/85 dark:hover:bg-white/5",
                                ].join(" ")}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-portal border border-slate-200 bg-white/70 px-3 py-[9px] text-xs font-bold text-slate-700 shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900/25 dark:text-white/85 dark:hover:bg-white/5 dark:focus-visible:ring-brand-green/30"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m11-5v3a2 2 0 0 1-2 2h-3" />
                        </svg>
                        Expand
                      </button>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-portal border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                    <div className="h-[calc(100svh-13rem)] min-h-[30rem] w-full sm:h-[calc(100vh-17rem)] sm:min-h-[36rem]">
                      <iframe
                        title={safeTitle(active.title)}
                        src={reportEmbedSrc(active.embed_src)}
                        className="origin-top-left border-0"
                        style={{
                          width: `${reportScale * 100}%`,
                          height: `${reportScale * 100}%`,
                          transform: `scale(${1 / reportScale})`,
                        }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        allowFullScreen
                      />
                    </div>
                  </div>

                </>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-300">Choose a report.</div>
              )}
            </section>
          </section>
        )}

        {expanded && active && (
          <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center gap-1.5 rounded-portal border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900/40 dark:text-white/85 dark:hover:bg-white/5 dark:focus-visible:ring-brand-green/30"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                </svg>
                Back to portal
              </button>
              <div className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
                {safeTitle(active.title)}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <iframe
                title={safeTitle(active.title)}
                src={reportEmbedSrc(active.embed_src)}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer"
                allowFullScreen
              />
            </div>
          </div>
        )}
    </main>
  );
}

