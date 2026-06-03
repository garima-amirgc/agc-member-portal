import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import { FACILITY_CODES } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import OrgChart from "../components/OrgChart";

/** Rounded-stroke icons (outline style). */
function ResourceCategoryIcon({ name }) {
  const cls = "h-7 w-7";
  const stroke = { strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "finance":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <path d="M3 21h18M4 21V7l8-4v18M20 21V11l-6-3.5" />
          <path d="M9 9h.01M9 12h.01M9 15h.01M9 18h.01" />
        </svg>
      );
    case "sales":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <path d="M3 3v18h18" />
          <path d="m7 12 4-4 4 4 6-6" />
          <path d="M17 8h4v4" />
        </svg>
      );
    case "hr":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "safety":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "production":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96L12 12.01l7.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      );
    case "it":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...stroke}>
          <rect x="2" y="4" width="20" height="12" rx="2" />
          <path d="M6 20h12" />
          <path d="M12 16v4" />
        </svg>
      );
    default:
      return null;
  }
}

const RESOURCE_CARD_SHELL =
  [
    "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-[#eef2fb] p-0 text-left",
    "shadow-[0_6px_24px_-8px_rgba(15,23,42,0.08),0_2px_8px_-4px_rgba(11,62,175,0.06)]",
    "transition-all duration-200 ease-out",
    "hover:z-[1] hover:-translate-y-0.5 hover:scale-[0.99]",
    "hover:border-slate-300/60 hover:shadow-[0_14px_40px_-12px_rgba(15,23,42,0.12),0_6px_16px_-6px_rgba(11,62,175,0.1)]",
    "dark:border-white/10 dark:bg-slate-800/85",
    "dark:shadow-[0_8px_28px_-10px_rgba(0,0,0,0.45),0_2px_10px_-4px_rgba(0,0,0,0.25)]",
    "dark:hover:border-white/15 dark:hover:shadow-[0_16px_44px_-12px_rgba(0,0,0,0.55),0_6px_18px_-6px_rgba(0,0,0,0.35)]",
  ].join(" ");

const RESOURCE_CARDS = [
  {
    key: "finance",
    title: "Finance",
    desc: "Policies, forms, and finance reference materials.",
    icon: "finance",
  },
  {
    key: "sales",
    title: "Sales",
    desc: "Playbooks, pricing context, and commercial resources.",
    icon: "sales",
  },
  {
    key: "hr",
    title: "HR",
    desc: "People processes, onboarding, and HR documents.",
    icon: "hr",
  },
  {
    key: "safety",
    title: "Safety",
    desc: "Compliance, procedures, and safety training aids.",
    icon: "safety",
  },
  {
    key: "production",
    title: "Production",
    desc: "Standard work, SOPs, and operations resources.",
    icon: "production",
  },
  {
    key: "it",
    title: "IT",
    desc: "Tools, guides, and technology support material.",
    icon: "it",
  },
];

export default function FacilityCoursesPage() {
  const { facility } = useParams();
  const facilityNorm = (facility || "").toUpperCase();

  const [me, setMe] = useState(null);
  const [activeTab, setActiveTab] = useState("resources"); // resources | org
  const [resourceCounts, setResourceCounts] = useState({});
  const [resourceCountsLoading, setResourceCountsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const meRes = await api.get("/users/me");
      setMe(meRes.data);
    })();
  }, []);

  /** Opening or switching facility always lands on Resources (AGC, AQM, SCF, ASP). */
  useEffect(() => {
    setActiveTab("resources");
  }, [facilityNorm]);

  useEffect(() => {
    if (!FACILITY_CODES.includes(facilityNorm)) return;
    let cancelled = false;
    setResourceCountsLoading(true);
    (async () => {
      const out = {};
      await Promise.all(
        RESOURCE_CARDS.map(async (c) => {
          try {
            const [videosRes, docsRes] = await Promise.allSettled([
              api.get(`/resources/facility/${facilityNorm}/category/${c.key}`),
              api.get(`/resources/facility/${facilityNorm}/category/${c.key}/documents`),
            ]);
            const videos =
              videosRes.status === "fulfilled" && Array.isArray(videosRes.value?.data?.videos)
                ? videosRes.value.data.videos
                : [];
            const docs =
              docsRes.status === "fulfilled" && Array.isArray(docsRes.value?.data?.documents)
                ? docsRes.value.data.documents
                : [];
            out[c.key] = { videos: videos.length, docs: docs.length, total: videos.length + docs.length };
          } catch {
            out[c.key] = { videos: 0, docs: 0, total: 0 };
          }
        })
      );
      if (cancelled) return;
      setResourceCounts(out);
      setResourceCountsLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setResourceCounts({});
        setResourceCountsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm]);

  useEffect(() => {
    if (FACILITY_CODES.includes(facilityNorm)) {
      try {
        sessionStorage.setItem("agc_portal_last_facility", facilityNorm);
      } catch {
        /* ignore */
      }
    }
  }, [facilityNorm]);

  const hasAccess = useMemo(() => (me?.facilities ?? []).includes(facilityNorm), [me, facilityNorm]);
  const visibleResourceCards = useMemo(() => {
    if (resourceCountsLoading) return [];
    return RESOURCE_CARDS.filter((c) => (resourceCounts?.[c.key]?.total || 0) > 0);
  }, [resourceCounts, resourceCountsLoading]);

  if (!FACILITY_CODES.includes(facilityNorm)) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  const facilityBanner = (() => {
    const code = facilityNorm;
    const title = `${code} Facility`;
    const desc = hasAccess
      ? `Complete all assigned ${code} trainings. Your learning progress is tracked by facility.`
      : `You don’t currently have access to ${code}. You can still browse Resources below, but courses may be restricted.`;
    return { title, desc };
  })();

  return (
    <main className={PAGE_SHELL}>
      <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
        <div
          className="relative"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1768796371809-95b49943a48b?auto=format&fit=crop&w=2400&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-slate-950/20" />
          <div className="relative p-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-100/90">
              {facilityBanner.title}
            </div>
            <p className="mt-4 max-w-3xl text-sm text-slate-200">{facilityBanner.desc}</p>
          </div>
        </div>
      </section>

      <section className="min-w-0">
        <div className="relative flex items-end gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("resources")}
            className={[
              "relative -mb-px rounded-t-2xl border px-4 py-2.5 text-base font-semibold transition",
              "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
              "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
              activeTab === "resources"
                ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
                : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
            ].join(" ")}
            role="tab"
            aria-selected={activeTab === "resources"}
          >
            Resources
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("org")}
            className={[
              "relative -mb-px rounded-t-2xl border px-4 py-2.5 text-base font-semibold transition",
              "border-slate-200 bg-white text-slate-900 hover:text-[#0B3EAF]",
              "dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:text-[#0B3EAF]",
              activeTab === "org"
                ? "z-10 border-b-transparent bg-[#eef2fb] !text-[#0B3EAF] shadow-sm dark:bg-[#0B3EAF]/10 dark:!text-[#0B3EAF]"
                : "border-b-slate-200 bg-slate-50 text-slate-900 dark:border-b-slate-700 dark:bg-slate-950/40 dark:text-white/90",
            ].join(" ")}
            role="tab"
            aria-selected={activeTab === "org"}
          >
            Organization
          </button>

          {/* Baseline under tabs; active tab overlaps it (no line between active tab and panel). */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />
        </div>

        <div
          className="min-w-0 overflow-x-auto rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          role="tabpanel"
        >
          {activeTab === "resources" ? (
            <div>
              {resourceCountsLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Loading resources…</p>
              ) : visibleResourceCards.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">No resources uploaded yet.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleResourceCards.map((c) => (
                    <Link
                      key={c.key}
                      to={`/facilities/${facilityNorm}/resources/${c.key}`}
                      className={RESOURCE_CARD_SHELL}
                    >
                      <div className="relative flex min-h-0 flex-1 flex-col p-4">
                        <div className="relative flex items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/90 text-[#0B3EAF] dark:bg-slate-900/90 dark:ring-slate-600/70 dark:text-[#A7D344]">
                            <ResourceCategoryIcon name={c.icon} />
                          </div>
                          <div className="min-w-0 pt-0.5">
                            <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white">{c.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.desc}</p>
                          </div>
                        </div>
                      </div>

                      <div className="relative mt-auto flex shrink-0 items-center justify-between rounded-b-2xl border-t border-white/10 bg-[#0B3EAF] px-4 py-3.5 text-sm font-semibold text-white transition group-hover:bg-[#082d82] dark:border-white/10 dark:bg-[#0B3EAF] dark:group-hover:bg-[#0a3494]">
                        <span>See Details</span>
                        <span aria-hidden className="text-white transition group-hover:translate-x-0.5">
                          →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "org" ? (
            <div className="min-w-0">
              <OrgChart facility={facilityNorm} />
            </div>
          ) : null}
        </div>
      </section>

      {facilityNorm === "AGC" && (
        <section className="overflow-hidden rounded-2xl bg-[#0C3EB0] shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="p-5 md:w-[280px] md:pr-0">
              <img
                src="/sherry-aziz.png"
                alt="Sherry Aziz"
                className="aspect-square w-full rounded-2xl object-cover ring-1 ring-white/20"
              />
            </div>
            <div className="flex-1 p-5 pt-0 md:pt-5">
              <div className="text-sm font-semibold text-[#ffffff]">
                Message from the CFO
              </div>
              <h3 className="mt-1 text-2xl font-bold !text-white">Sherry Aziz</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#ffffff]/90">
                Welcome to AGC. As part of our commitment to compliance, safety, and operational excellence, please
                complete your assigned training on time and keep your training status up to date. Your continued
                progress plays an important role in supporting a safe, efficient, and successful workplace across our
                facility.
              </p>
            </div>
          </div>
        </section>
      )}

      {!hasAccess && (
        <section className="card border-dashed text-slate-600 dark:text-slate-400">
          <p>Courses may be restricted for this facility. Use the Resources tab above, or contact an administrator to request access.</p>
        </section>
      )}
    </main>
  );
}
