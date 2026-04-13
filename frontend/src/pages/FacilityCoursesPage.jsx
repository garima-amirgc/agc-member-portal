import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "../services/api";
import { FACILITY_CODES } from "../constants/facilities";
import { PAGE_PADDING, PAGE_SHELL } from "../constants/pageLayout";
import OrgChart from "../components/OrgChart";
import UpcomingEventCards from "../components/UpcomingEventCards";

export default function FacilityCoursesPage() {
  const { facility } = useParams();
  const location = useLocation();
  const facilityNorm = (facility || "").toUpperCase();

  const [me, setMe] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);

  const loadUpcoming = useCallback(async () => {
    if (!FACILITY_CODES.includes(facilityNorm)) {
      setUpcoming([]);
      setUpcomingLoading(false);
      return;
    }
    setUpcomingLoading(true);
    try {
      const r = await api.get("/upcoming", { params: { business_unit: facilityNorm } });
      setUpcoming(Array.isArray(r.data) ? r.data : []);
    } catch (err) {
      console.warn("Upcoming fetch failed:", err.response?.status, err.response?.data ?? err.message);
      setUpcoming([]);
    } finally {
      setUpcomingLoading(false);
    }
  }, [facilityNorm]);

  useEffect(() => {
    (async () => {
      const meRes = await api.get("/users/me");
      setMe(meRes.data);
    })();
  }, []);

  useEffect(() => {
    loadUpcoming();
  }, [facilityNorm, location.key, loadUpcoming]);

  useEffect(() => {
    if (FACILITY_CODES.includes(facilityNorm)) {
      try {
        sessionStorage.setItem("agc_portal_last_facility", facilityNorm);
      } catch {
        /* ignore */
      }
    }
  }, [facilityNorm]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadUpcoming();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadUpcoming]);

  useEffect(() => {
    const onUpdated = () => loadUpcoming();
    window.addEventListener("facility-upcoming-updated", onUpdated);
    return () => window.removeEventListener("facility-upcoming-updated", onUpdated);
  }, [loadUpcoming]);

  const hasAccess = useMemo(() => (me?.facilities ?? []).includes(facilityNorm), [me, facilityNorm]);

  if (!FACILITY_CODES.includes(facilityNorm)) {
    return <div className={PAGE_PADDING}>Unknown facility.</div>;
  }

  return (
    <main className={PAGE_SHELL}>
      {facilityNorm === "AGC" && (
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
                AGC Facility
              </div>
              <p className="mt-4 max-w-3xl text-sm text-slate-200">
                Complete all assigned AGC trainings. Once completed, your manager will receive a notification in the Manager dashboard.
              </p>
            </div>
          </div>
        </section>
      )}

      {facilityNorm !== "AGC" && (
        <section>
          <h1 className="mb-2 text-2xl font-bold">{facilityNorm} Courses</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {hasAccess ? "Your assigned courses for this facility." : "You don't currently have access to this facility."}
          </p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-12 lg:items-start xl:gap-6">
        <div className="card min-w-0 p-3 sm:p-4 lg:col-span-9">
          <h2 className="mb-2 text-sm font-semibold lg:text-base">Organization Chart</h2>
          <OrgChart />
        </div>
        <aside className="min-w-0 lg:col-span-3 lg:sticky lg:top-6 lg:self-start">
          <div className="card upcoming-rail p-3 sm:p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Upcoming</h3>
            <UpcomingEventCards items={upcoming} loading={upcomingLoading} compact />
          </div>
        </aside>
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
                Welcome to AGC. Please complete your assigned courses on time and keep your training status up to date.
                Your progress helps us maintain compliance, safety, and operational excellence across the facility.
              </p>
            </div>
          </div>
        </section>
      )}

      {!hasAccess && (
        <section className="card border-dashed text-slate-600 dark:text-slate-400">
          <p>No course assignments for this facility yet. You can still use Resources below.</p>
        </section>
      )}

      <section>
        <div className="mb-4">
          <h2 className="mb-2 text-xl font-semibold">Resources</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[
              { key: "finance", label: "Finance" },
              { key: "sales", label: "Sales" },
              { key: "hr", label: "HR" },
              { key: "safety", label: "Safety" },
              { key: "production", label: "Production" },
            ].map((c) => (
              <Link
                key={c.key}
                to={`/facilities/${facilityNorm}/resources/${c.key}`}
                className="group rounded-portal border border-stone-200/90 bg-white px-4 py-4 text-left shadow-brand transition hover:border-brand-blue/40 dark:border-stone-600 dark:bg-[#2a2520] dark:hover:border-brand-green/50"
              >
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">Open resources</div>
                <div className="mt-3 h-1 w-10 rounded-full bg-brand-red/90 transition-all group-hover:w-14 dark:bg-brand-red/90" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
