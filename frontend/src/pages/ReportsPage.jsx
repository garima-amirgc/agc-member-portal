import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];

function safeTitle(s) {
  return String(s || "").trim() || "Untitled report";
}

function normalizeFacilities(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const cleaned = list.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean);
  const uniq = [...new Set(cleaned)].filter((x) => FACILITIES.includes(x));
  return uniq;
}

function reportFacilities(r) {
  const bu = normalizeFacilities(r?.business_units);
  // Empty means "all facilities" in this portal.
  return bu.length ? bu : FACILITIES;
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeFacility, setActiveFacility] = useState(null);

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

  // Keep facility selection stable and aligned to the active report.
  useEffect(() => {
    if (facilityTabs.length === 0) {
      if (activeFacility !== null) setActiveFacility(null);
      return;
    }
    // If current facility is valid, keep it.
    if (activeFacility && facilityTabs.includes(activeFacility)) return;

    // Prefer facility inferred from active report.
    const inferred = active ? reportFacilities(active)[0] : null;
    setActiveFacility(inferred && facilityTabs.includes(inferred) ? inferred : facilityTabs[0]);
  }, [active, activeFacility, facilityTabs]);

  const reportsForFacility = useMemo(() => {
    if (!activeFacility) return [];
    const list = reports.filter((r) => reportFacilities(r).includes(activeFacility));
    return list;
  }, [reports, activeFacility]);

  // If the active report doesn't belong to the selected facility, switch to the first report under that facility.
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
    <>
      <PageHeader
        title="Reports"
        subtitle="Power BI dashboards embedded in Member Portal"
      />
      <main className={PAGE_SHELL}>
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

            <section className="card min-h-[60vh]">
              {active ? (
                <>
                  <div className="mb-3">
                    <div className="text-lg font-semibold">{safeTitle(active.title)}</div>
                    {active.description ? (
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {String(active.description)}
                      </div>
                    ) : null}
                  </div>

                  <div className="relative overflow-hidden rounded-portal border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                    <div className="aspect-[16/9] w-full">
                      <iframe
                        title={safeTitle(active.title)}
                        src={String(active.embed_src)}
                        className="h-full w-full"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        allowFullScreen
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    If you see a blank frame, the report may require Power BI permissions or the embed link is not a public/embed-capable URL.
                  </p>
                </>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-300">Choose a report.</div>
              )}
            </section>
          </section>
        )}
      </main>
    </>
  );
}

