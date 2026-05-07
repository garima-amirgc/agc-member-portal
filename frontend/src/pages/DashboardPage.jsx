import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import UpcomingEventCards from "../components/UpcomingEventCards";
import api from "../services/api";
import BirthdayPopupModal from "../components/BirthdayPopupModal";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { getEventTimeIso } from "../utils/eventDate";
import { splitUpcomingForHome } from "../utils/upcomingFeedSplit";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { hasAdminGrant } from "../utils/adminAccess";

function BirthdayMiniCard({ item, onClick }) {
  const fullName = String(item?.name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || "—";
  const facility = String(item?.facility_name || item?.company_name || "").trim();
  const img = resolvePublicMediaUrl(item?.profile_image_url);
  const fallback =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="28" fill="url(#g)"/>
  <circle cx="128" cy="104" r="46" fill="#fff" fill-opacity="0.22"/>
  <path d="M56 214c14-54 56-82 72-82s58 28 72 82" fill="#fff" fill-opacity="0.20"/>
</svg>`);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-[#e8b6c6]/50 bg-gradient-to-br from-[#fff7fb] via-[#fff2ea] to-[#eef8ff] px-3 py-2.5 text-left shadow-sm ring-1 ring-white/60 transition hover:shadow-md dark:border-white/10 dark:from-white/5 dark:via-white/5 dark:to-white/5 dark:ring-white/5"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.55]">
        <div className="absolute -left-10 -top-12 h-24 w-24 rounded-full bg-[#ffcad8]/60 blur-xl" />
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#d7f3ff]/60 blur-xl" />
        <div className="absolute -bottom-16 left-16 h-28 w-28 rounded-full bg-[#fff0b8]/60 blur-xl" />
      </div>
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15">
        <div className="flex h-full w-full items-center justify-center">
          <img src={img || fallback} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-extrabold text-[#4b2a35] dark:text-white">
          HBD {firstName}
        </div>
        {facility ? (
          <div className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-[#6b4a55] dark:text-white/85">
            {facility}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canLearningAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.LEARNING_ADMIN);
  const canReports = user?.role === "Admin" || hasAdminGrant(user, ADMIN_GRANT_KEYS.REPORTS);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [birthdays, setBirthdays] = useState({ today: [], upcoming: [], range_days: 14 });
  const [birthdaysLoading, setBirthdaysLoading] = useState(true);
  const [birthdayPopup, setBirthdayPopup] = useState(null);
  /** Same detail modal for Today’s event and Upcoming cards */
  const [eventModal, setEventModal] = useState(null);
  const [topVisitors, setTopVisitors] = useState([]);
  const [topVisitorsLoading, setTopVisitorsLoading] = useState(false);

  const loadUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    try {
      const r = await api.get("/upcoming/feed");
      setUpcoming(Array.isArray(r.data) ? r.data : []);
    } catch (err) {
      console.warn("Upcoming feed failed:", err.response?.status, err.response?.data ?? err.message);
      setUpcoming([]);
    } finally {
      setUpcomingLoading(false);
    }
  }, []);

  const loadBirthdays = useCallback(async () => {
    setBirthdaysLoading(true);
    try {
      const r = await api.get("/birthdays/feed", { params: { days: 14 } });
      const d = r.data || {};
      setBirthdays({
        today: Array.isArray(d.today) ? d.today : [],
        upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
        range_days: Number(d.range_days) || 14,
      });
    } catch (err) {
      console.warn("Birthdays feed failed:", err.response?.status, err.response?.data ?? err.message);
      setBirthdays({ today: [], upcoming: [], range_days: 14 });
    } finally {
      setBirthdaysLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);

  useEffect(() => {
    loadBirthdays();
  }, [loadBirthdays]);

  // Lightweight per-session portal visit tracking.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof sessionStorage === "undefined") {
          await api.post("/users/me/portal-visit");
          return;
        }
        const key = "agc_portal_visit_recorded";
        if (sessionStorage.getItem(key) === "1") return;
        // Only mark as recorded after the API call succeeds (so a previous 500/DB-missing doesn't permanently block).
        await api.post("/users/me/portal-visit");
        if (!cancelled) sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canReports) return;
    setTopVisitorsLoading(true);
    api
      .get("/reports/admin/top-portal-visitors")
      .then((r) => setTopVisitors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTopVisitors([]))
      .finally(() => setTopVisitorsLoading(false));
  }, [canReports]);

  useEffect(() => {
    if (!eventModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") setEventModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eventModal]);

  const { todayEvents, upcomingFutureOnly } = useMemo(() => splitUpcomingForHome(upcoming), [upcoming]);
  const birthdayCards = useMemo(() => {
    const today = Array.isArray(birthdays?.today) ? birthdays.today : [];
    const up = Array.isArray(birthdays?.upcoming) ? birthdays.upcoming : [];
    return [...today, ...up].slice(0, 4);
  }, [birthdays]);

  return (
    <>
      <main className={PAGE_SHELL}>
        <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 space-y-6 lg:col-span-9">
            <DashboardAssignmentNotice user={user} />

            <div className="grid gap-6 md:grid-cols-2">
              <div className="card">
                <h2 className="mb-2 text-lg font-semibold">Your role</h2>
                <p className="text-sm text-[#000000] dark:text-white/90">
                  <span className="inline-flex items-center rounded-full border-2 border-[#0B3EAF] bg-[rgba(167,211,68,0.2)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:border-[#A7D344] dark:bg-[rgba(11,62,175,0.25)] dark:text-[#A7D344]">
                    {user?.role || "Guest"}
                  </span>
                </p>
              </div>

              <div className="card">
                <h2 className="mb-2 text-lg font-semibold">Quick links</h2>
                <div className="space-y-2 text-sm">
                  <Link
                    className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                    to="/facilities"
                  >
                    AGC University
                  </Link>
                  <Link
                    className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                    to="/employee-engagement-calendar"
                  >
                    Employee engagement calendar
                  </Link>
                  <Link
                    className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                    to="/profile"
                  >
                    Profile & leave requests
                  </Link>
                  {canLearningAdmin && (
                    <Link
                      className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                      to="/admin"
                    >
                      Learning admin
                    </Link>
                  )}
                  {user?.role === "Manager" && (
                    <Link
                      className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                      to="/manager"
                    >
                      Manager hub
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {canReports ? (
              <div className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Top portal visitors</h2>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Last updated as people open the dashboard.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {topVisitorsLoading ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
                  ) : topVisitors.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      No visits recorded yet. Open the dashboard once as a few users to populate this list.
                    </p>
                  ) : (
                    topVisitors.slice(0, 5).map((u, idx) => (
                      <div
                        key={u.id || idx}
                        className="flex items-center justify-between gap-3 rounded-portal border border-slate-200 bg-white/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/20"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{u.name || "—"}</div>
                          <div className="truncate text-xs text-slate-600 dark:text-slate-300">{u.email || ""}</div>
                        </div>

                        <div className="shrink-0">
                          <div className="flex min-w-[3.25rem] flex-col items-center justify-center gap-1 rounded-2xl bg-[#0B3EAF]/10 px-3 py-1.5 text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                            <div
                              className="grid h-5 w-5 place-items-center rounded-full bg-[#E02B20] text-[11px] font-black text-white shadow-[0_6px_18px_rgba(0,0,0,0.25)] ring-2 ring-white/80 dark:ring-white/20"
                              aria-hidden
                            >
                              🔥
                            </div>
                            <div className="text-sm font-extrabold leading-none">{Number(u.visit_count) || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 lg:col-span-3 lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-4">
              {!upcomingLoading && todayEvents.length > 0 ? (
                <div className="card no-title-underline p-3 sm:p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Today’s event</h3>
                  <UpcomingEventCards
                    items={todayEvents.slice(0, 1)}
                    loading={false}
                    compact
                    showFacility
                    onItemClick={(ev) => setEventModal({ event: ev, kind: "today" })}
                  />
                </div>
              ) : null}

              {birthdaysLoading || birthdayCards.length > 0 ? (
                <div className="card no-title-underline p-3 sm:p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Birthdays</h3>
                  {birthdaysLoading ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Loading birthdays…</p>
                  ) : (
                    <div className="space-y-2.5">
                      {birthdayCards.map((b) => (
                        <BirthdayMiniCard
                          key={`${b?.id ?? "b"}-${b?.in_days ?? "u"}`}
                          item={b}
                          onClick={() => setBirthdayPopup({ ...b, in_days: Number(b?.in_days) || 0 })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="card upcoming-rail p-3 sm:p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Upcoming</h3>
                <UpcomingEventCards
                  items={upcomingFutureOnly}
                  loading={upcomingLoading}
                  compact
                  showFacility
                  onItemClick={(ev) => setEventModal({ event: ev, kind: "upcoming" })}
                />
                {!upcomingLoading && upcomingFutureOnly.length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">No upcoming events yet.</p>
                ) : null}
              </div>
            </div>
          </aside>
        </section>
      </main>

      <BirthdayPopupModal
        open={Boolean(birthdayPopup)}
        onClose={() => setBirthdayPopup(null)}
        person={birthdayPopup}
      />

      {eventModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-popup-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEventModal(null);
          }}
        >
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#0B3EAF]/18 bg-gradient-to-br from-[#f5f7fb] via-[#eef3fb] to-[#e6eef8] shadow-2xl ring-1 ring-white/70 dark:border-white/12 dark:from-[#151c28] dark:via-[#131a26] dark:to-[#0f141d] dark:ring-white/10">
            <button
              type="button"
              onClick={() => setEventModal(null)}
              className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full text-slate-600/90 transition hover:bg-white/60 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3EAF] dark:text-white/75 dark:hover:bg-white/12 dark:hover:text-white"
              aria-label="Close"
            >
              <span className="text-3xl leading-none font-black tracking-tight" aria-hidden>
                ×
              </span>
            </button>

            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.45]">
              <div className="absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#0B3EAF]/18 blur-3xl dark:bg-[#0B3EAF]/25" />
              <div className="absolute -right-8 top-1/4 h-48 w-48 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/15" />
              <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-indigo-200/35 blur-3xl dark:bg-indigo-950/40" />
              <div className="absolute -right-14 bottom-8 h-36 w-36 rounded-full bg-[#c5d9f5]/50 blur-2xl dark:bg-white/5" />
            </div>

            <div className="relative z-10 space-y-4 p-5 pt-12 sm:p-6 sm:pt-14">
              <div className="pr-10">
                <p
                  id="event-detail-popup-title"
                  className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B3EAF] dark:text-[#A7D344]"
                >
                  {eventModal.kind === "today" ? "Today’s event" : "Upcoming event"}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {(() => {
                    const iso = getEventTimeIso(eventModal.event);
                    return iso ? new Date(iso).toLocaleString() : "Schedule TBD";
                  })()}
                </p>
              </div>

              {(() => {
                const img = resolvePublicMediaUrl(eventModal.event?.image_url);
                if (!img) return null;
                return (
                  <div className="overflow-hidden rounded-xl border border-white/70 bg-white/50 shadow-inner ring-1 ring-[#0B3EAF]/10 dark:border-white/10 dark:bg-white/[0.06] dark:ring-white/10">
                    <div className="flex max-h-64 w-full items-center justify-center p-3">
                      <img src={img} alt="" className="max-h-56 w-full object-contain" />
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-start gap-2">
                {eventModal.event?.business_unit ? (
                  <span className="rounded-md bg-[#0B3EAF]/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                    {eventModal.event.business_unit}
                  </span>
                ) : null}
                <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                  {eventModal.event?.title}
                </h2>
              </div>

              {eventModal.event?.detail ? (
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{eventModal.event.detail}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
