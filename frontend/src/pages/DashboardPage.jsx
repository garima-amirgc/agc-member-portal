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

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function BirthdayMiniCard({ item, onClick }) {
  const name = String(item?.name || "—");
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
        <div className="truncate text-sm font-extrabold text-[#4b2a35] dark:text-white">{name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#6b4a55] dark:text-white/80">
          {facility ? (
            <span className="rounded-full border border-[#e8b6c6]/60 bg-white/70 px-2 py-0.5 font-bold uppercase tracking-wide text-[#6b4a55] dark:border-white/10 dark:bg-white/10 dark:text-white/90">
              {facility}
            </span>
          ) : null}
          {item?.label ? <span className="font-semibold">{item.label}</span> : null}
          {item?.in_days != null ? (
            <span className="font-semibold">
              {Number(item.in_days) === 1 ? "in 1 day" : `in ${item.in_days} days`}
            </span>
          ) : null}
        </div>
      </div>
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#7b5060] group-hover:text-[#4b2a35] dark:text-white/70 dark:group-hover:text-white/90">
        View
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [birthdays, setBirthdays] = useState({ today: [], upcoming: [], range_days: 14 });
  const [birthdaysLoading, setBirthdaysLoading] = useState(true);
  const [birthdayPopup, setBirthdayPopup] = useState(null);
  const [todayEventPopup, setTodayEventPopup] = useState(null);

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

  const todayEvents = useMemo(() => {
    if (!Array.isArray(upcoming) || upcoming.length === 0) return [];
    const now = new Date();
    const out = [];
    for (const ev of upcoming) {
      const iso = getEventTimeIso(ev);
      if (!iso) continue;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      if (isSameLocalDay(d, now)) out.push(ev);
    }
    return out;
  }, [upcoming]);

  const todayEvent = todayEvents[0] || null;

  const upcomingFutureOnly = useMemo(() => {
    if (!Array.isArray(upcoming) || upcoming.length === 0) return [];
    const now = new Date();
    const todayIds = new Set(todayEvents.map((e) => e?.id).filter((x) => x != null));
    return upcoming.filter((ev) => {
      // Remove anything that is "today" so it only shows in Today’s event.
      if (todayIds.has(ev?.id)) return false;
      const iso = getEventTimeIso(ev);
      if (!iso) return true; // keep undated items in Upcoming
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return true;
      // Keep events strictly after today (don’t show past items in Upcoming).
      if (isSameLocalDay(d, now)) return false;
      return d.getTime() > now.getTime();
    });
  }, [upcoming, todayEvents]);

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
                  {isAdmin && (
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
          </div>

          <aside className="min-w-0 lg:col-span-3 lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-4">
              <div className="card no-title-underline p-3 sm:p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Today’s event</h3>
                {upcomingLoading ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Loading…</p>
                ) : todayEvents.length > 0 ? (
                  <UpcomingEventCards
                    items={todayEvents.slice(0, 1)}
                    loading={false}
                    compact
                    showFacility
                    onItemClick={(ev) => setTodayEventPopup(ev)}
                  />
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">No events scheduled for today.</p>
                )}
              </div>

              <div className="card no-title-underline p-3 sm:p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Birthdays</h3>
                {birthdaysLoading ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Loading birthdays…</p>
                ) : birthdays.today.length === 0 ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">No birthdays today.</p>
                ) : (
                  <div className="space-y-2.5">
                    {birthdays.today.slice(0, 4).map((b) => (
                      <BirthdayMiniCard
                        key={`t-${b.id}`}
                        item={b}
                        onClick={() => setBirthdayPopup({ ...b, in_days: 0 })}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="card upcoming-rail p-3 sm:p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Upcoming</h3>
                <UpcomingEventCards items={upcomingFutureOnly} loading={upcomingLoading} compact showFacility />
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

      {todayEventPopup ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTodayEventPopup(null);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-[#101010] dark:ring-white/10">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Today’s event</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {(() => {
                    const iso = getEventTimeIso(todayEventPopup);
                    return iso ? new Date(iso).toLocaleString() : "";
                  })()}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setTodayEventPopup(null)}>
                Close
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                {(() => {
                  const img = resolvePublicMediaUrl(todayEventPopup?.image_url);
                  if (!img) return null;
                  return (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/70 ring-1 ring-white/60 dark:border-white/10 dark:bg-white/5 dark:ring-white/10">
                      <div className="flex max-h-64 w-full items-center justify-center p-3">
                        <img src={img} alt="" className="max-h-56 w-full object-contain" />
                      </div>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-2">
                  {todayEventPopup.business_unit ? (
                    <span className="rounded bg-[#0B3EAF]/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                      {todayEventPopup.business_unit}
                    </span>
                  ) : null}
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{todayEventPopup.title}</div>
                </div>
                {todayEventPopup.detail ? (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{todayEventPopup.detail}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
