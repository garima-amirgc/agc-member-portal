import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import TrainingCompletionNotice from "../components/TrainingCompletionNotice";
import UpcomingEventCards from "../components/UpcomingEventCards";
import UpcomingMiniCalendar from "../components/UpcomingMiniCalendar";
import api from "../services/api";
import { useCelebration } from "../context/CelebrationContext";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { splitUpcomingForHome } from "../utils/upcomingFeedSplit";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { hasAdminGrant, isFullAdmin } from "../utils/adminAccess";
import { userHasDepartment } from "../utils/userDepts";
import ItTicketsAssigneeWidget from "../components/ItTicketsAssigneeWidget";
import EmployeeOfMonthCard from "../components/EmployeeOfMonthCard";
import LeadershipUpdateCard from "../components/LeadershipUpdateCard";
import NewHireCard from "../components/NewHireCard";
import CustomerWinCard from "../components/CustomerWinCard";
import CommunityInvolvementCard from "../components/CommunityInvolvementCard";
import { COMMUNITY_INVOLVEMENT_FEED, CUSTOMER_WINS_FEED, NEW_HIRES_FEED } from "../constants/spotlightFeedConfig";

function parseSpotlightFeedEntries(data) {
  if (Array.isArray(data)) {
    return data.filter((item) => item?.title);
  }
  return data?.title ? [data] : [];
}

function CelebrationMiniCard({ item, onClick, kind = "birthday" }) {
  const fullName = String(item?.name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || "—";
  const facility = String(item?.facility_name || item?.company_name || "").trim();
  const img = resolvePublicMediaUrl(item?.profile_image_url);
  const isAnniversary = kind === "anniversary";
  const years = Number(item?.years_employed);
  const inDays = Number(item?.in_days);
  const headline = isAnniversary
    ? Number.isFinite(years) && years >= 1
      ? `${years} yr${years === 1 ? "" : "s"} — ${firstName}`
      : `Anniversary — ${firstName}`
    : inDays === 0
      ? `HBD ${firstName}`
      : `HBD ${firstName} · in ${inDays}d`;
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
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-left shadow-sm ring-1 ring-white/60 transition hover:shadow-md dark:ring-white/5 ${
        isAnniversary
          ? "border-[#0B3EAF]/25 bg-gradient-to-br from-[#eef2fb] via-[#f8fafc] to-[#fff8e8] dark:border-[#A7D344]/25 dark:from-white/5 dark:via-white/5 dark:to-white/5"
          : "border-[#e8b6c6]/50 bg-gradient-to-br from-[#fff7fb] via-[#fff2ea] to-[#eef8ff] dark:border-white/10 dark:from-white/5 dark:via-white/5 dark:to-white/5"
      }`}
    >
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15">
        <div className="flex h-full w-full items-center justify-center">
          <img src={img || fallback} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-extrabold text-[#4b2a35] dark:text-white">{headline}</div>
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
  const navigate = useNavigate();
  const canViewTopVisitors = isFullAdmin(user) || user?.is_full_admin === true;
  const canManageLeadershipUpdates = hasAdminGrant(user, ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES);
  const canManageNewHires = hasAdminGrant(user, ADMIN_GRANT_KEYS.NEW_HIRES);
  const canManageCustomerWins = hasAdminGrant(user, ADMIN_GRANT_KEYS.CUSTOMER_WINS);
  const canManageCommunityInvolvement = hasAdminGrant(user, ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT);
  const isIT = userHasDepartment(user, "IT");
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const { openCelebration, feed: birthdays, feedLoading: birthdaysLoading } = useCelebration();
  const [topVisitors, setTopVisitors] = useState([]);
  const [topVisitorsLoading, setTopVisitorsLoading] = useState(false);
  const [employeeOfMonthEntries, setEmployeeOfMonthEntries] = useState([]);
  const [employeeOfMonthLoading, setEmployeeOfMonthLoading] = useState(true);
  const [leadershipUpdateEntries, setLeadershipUpdateEntries] = useState([]);
  const [leadershipUpdateLoading, setLeadershipUpdateLoading] = useState(true);
  const [newHireEntries, setNewHireEntries] = useState([]);
  const [newHireLoading, setNewHireLoading] = useState(true);
  const [customerWinEntries, setCustomerWinEntries] = useState([]);
  const [customerWinLoading, setCustomerWinLoading] = useState(true);
  const [communityInvolvementEntries, setCommunityInvolvementEntries] = useState([]);
  const [communityInvolvementLoading, setCommunityInvolvementLoading] = useState(true);
  const [bottomRowOrder, setBottomRowOrder] = useState([
    NEW_HIRES_FEED.widgetKey,
    CUSTOMER_WINS_FEED.widgetKey,
  ]);

  // Defer assignment sync so login/home stay fast; Facilities also triggers sync via /assignments/me.
  useEffect(() => {
    if (!user?.id || user?.role === "Admin") return;
    const key = "agc_assignment_sync_started";
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key) === "1") return;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
    api.get("/assignments/me").catch(() => {});
  }, [user?.id, user?.role]);

  const loadHomeFeeds = useCallback(async () => {
    setUpcomingLoading(true);
    setEmployeeOfMonthLoading(true);
    setLeadershipUpdateLoading(true);
    setNewHireLoading(true);
    setCustomerWinLoading(true);
    setCommunityInvolvementLoading(true);

    const [
      upcomingResult,
      employeeOfMonthResult,
      leadershipResult,
      newHireResult,
      customerWinResult,
      communityResult,
      layoutResult,
    ] = await Promise.allSettled([
      api.get("/upcoming/feed"),
      api.get("/employee-of-month/current"),
      api.get("/leadership-updates/current"),
      api.get("/new-hires/current"),
      api.get("/customer-wins/current"),
      api.get("/community-involvement/current"),
      api.get("/home-spotlight/layout"),
    ]);

    if (upcomingResult.status === "fulfilled") {
      setUpcoming(Array.isArray(upcomingResult.value.data) ? upcomingResult.value.data : []);
    } else {
      console.warn(
        "Upcoming feed failed:",
        upcomingResult.reason?.response?.status,
        upcomingResult.reason?.response?.data ?? upcomingResult.reason?.message
      );
      setUpcoming([]);
    }
    setUpcomingLoading(false);

    if (employeeOfMonthResult.status === "fulfilled") {
      const data = employeeOfMonthResult.value.data;
      const rows = Array.isArray(data)
        ? data.filter((item) => item?.employee?.name)
        : data?.employee?.name
          ? [data]
          : [];
      setEmployeeOfMonthEntries(rows);
    } else {
      console.warn(
        "Employee of the Month failed:",
        employeeOfMonthResult.reason?.response?.status,
        employeeOfMonthResult.reason?.response?.data ?? employeeOfMonthResult.reason?.message
      );
      setEmployeeOfMonthEntries([]);
    }
    setEmployeeOfMonthLoading(false);

    if (leadershipResult.status === "fulfilled") {
      setLeadershipUpdateEntries(parseSpotlightFeedEntries(leadershipResult.value.data));
    } else {
      console.warn(
        "Leadership update failed:",
        leadershipResult.reason?.response?.status,
        leadershipResult.reason?.response?.data ?? leadershipResult.reason?.message
      );
      setLeadershipUpdateEntries([]);
    }
    setLeadershipUpdateLoading(false);

    if (newHireResult.status === "fulfilled") {
      setNewHireEntries(parseSpotlightFeedEntries(newHireResult.value.data));
    } else {
      console.warn(
        "New hire failed:",
        newHireResult.reason?.response?.status,
        newHireResult.reason?.response?.data ?? newHireResult.reason?.message
      );
      setNewHireEntries([]);
    }
    setNewHireLoading(false);

    if (customerWinResult.status === "fulfilled") {
      setCustomerWinEntries(parseSpotlightFeedEntries(customerWinResult.value.data));
    } else {
      console.warn(
        "Customer win failed:",
        customerWinResult.reason?.response?.status,
        customerWinResult.reason?.response?.data ?? customerWinResult.reason?.message
      );
      setCustomerWinEntries([]);
    }
    setCustomerWinLoading(false);

    if (communityResult.status === "fulfilled") {
      setCommunityInvolvementEntries(parseSpotlightFeedEntries(communityResult.value.data));
    } else {
      console.warn(
        "Community involvement failed:",
        communityResult.reason?.response?.status,
        communityResult.reason?.response?.data ?? communityResult.reason?.message
      );
      setCommunityInvolvementEntries([]);
    }
    setCommunityInvolvementLoading(false);

    if (layoutResult.status === "fulfilled") {
      const order = Array.isArray(layoutResult.value.data?.order) ? layoutResult.value.data.order : [];
      const allowed = [
        NEW_HIRES_FEED.widgetKey,
        CUSTOMER_WINS_FEED.widgetKey,
        COMMUNITY_INVOLVEMENT_FEED.widgetKey,
      ];
      const normalized = [];
      const seen = new Set();
      for (const key of order) {
        const k = String(key || "").trim();
        if (!allowed.includes(k) || seen.has(k)) continue;
        seen.add(k);
        normalized.push(k);
      }
      for (const key of allowed) {
        if (!seen.has(key)) normalized.push(key);
      }
      setBottomRowOrder(normalized);
    } else {
      setBottomRowOrder([NEW_HIRES_FEED.widgetKey, CUSTOMER_WINS_FEED.widgetKey, COMMUNITY_INVOLVEMENT_FEED.widgetKey]);
    }
  }, []);

  useEffect(() => {
    loadHomeFeeds();
  }, [loadHomeFeeds]);

  const bottomRowWidgets = useMemo(() => {
    const map = {
      [NEW_HIRES_FEED.widgetKey]: (
        <NewHireCard
          key={NEW_HIRES_FEED.widgetKey}
          entries={newHireEntries}
          loading={newHireLoading}
          compact
          canManage={canManageNewHires}
        />
      ),
      [CUSTOMER_WINS_FEED.widgetKey]: (
        <CustomerWinCard
          key={CUSTOMER_WINS_FEED.widgetKey}
          entries={customerWinEntries}
          loading={customerWinLoading}
          compact
          canManage={canManageCustomerWins}
        />
      ),
      [COMMUNITY_INVOLVEMENT_FEED.widgetKey]: (
        <CommunityInvolvementCard
          key={COMMUNITY_INVOLVEMENT_FEED.widgetKey}
          entries={communityInvolvementEntries}
          loading={communityInvolvementLoading}
          compact
          canManage={canManageCommunityInvolvement}
        />
      ),
    };
    return bottomRowOrder.map((key) => map[key]).filter(Boolean);
  }, [
    bottomRowOrder,
    newHireEntries,
    newHireLoading,
    customerWinEntries,
    customerWinLoading,
    communityInvolvementEntries,
    communityInvolvementLoading,
    canManageNewHires,
    canManageCustomerWins,
    canManageCommunityInvolvement,
  ]);

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
    if (!canViewTopVisitors) return;
    setTopVisitorsLoading(true);
    api
      .get("/reports/admin/top-portal-visitors", { params: { days: 7 } })
      .then((r) => {
        const payload = r.data;
        const list = Array.isArray(payload?.visitors)
          ? payload.visitors
          : Array.isArray(payload)
            ? payload
            : [];
        setTopVisitors(list);
      })
      .catch(() => setTopVisitors([]))
      .finally(() => setTopVisitorsLoading(false));
  }, [canViewTopVisitors]);

  const { todayEvents, upcomingFutureOnly } = useMemo(() => splitUpcomingForHome(upcoming), [upcoming]);
  const birthdayCards = useMemo(() => {
    const today = Array.isArray(birthdays?.today) ? birthdays.today : [];
    const up = Array.isArray(birthdays?.upcoming) ? birthdays.upcoming : [];
    return [...today, ...up].slice(0, 4);
  }, [birthdays]);

  const anniversaryCards = useMemo(() => {
    const today = Array.isArray(birthdays?.anniversaries_today) ? birthdays.anniversaries_today : [];
    const up = Array.isArray(birthdays?.anniversaries_upcoming) ? birthdays.anniversaries_upcoming : [];
    return [...today, ...up].slice(0, 4);
  }, [birthdays]);

  const openUpcomingEvent = (event) => {
    const id = event?.id;
    navigate(id != null ? `/upcoming/${encodeURIComponent(String(id))}` : "/upcoming");
  };

  return (
    <>
      <main className={PAGE_SHELL}>
        <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 space-y-6 lg:col-span-9">
            <DashboardAssignmentNotice user={user} />
            <TrainingCompletionNotice user={user} />

            {isIT ? <ItTicketsAssigneeWidget /> : null}

            <div className="space-y-6">
              <div className="card">
                <h2 className="mb-2 text-lg font-semibold">Your role</h2>
                <p className="text-sm text-[#000000] dark:text-white/90">
                  <span className="inline-flex items-center rounded-full border-2 border-[#0B3EAF] bg-[rgba(167,211,68,0.2)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:border-[#A7D344] dark:bg-[rgba(11,62,175,0.25)] dark:text-[#A7D344]">
                    {user?.role || "Guest"}
                  </span>
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {employeeOfMonthLoading || employeeOfMonthEntries.length > 0 ? (
                  <EmployeeOfMonthCard
                    entries={employeeOfMonthEntries}
                    loading={employeeOfMonthLoading}
                    compact
                  />
                ) : (
                  <div className="hidden md:block" aria-hidden />
                )}
                <LeadershipUpdateCard
                  entries={leadershipUpdateEntries}
                  loading={leadershipUpdateLoading}
                  compact
                  canManage={canManageLeadershipUpdates}
                />
              </div>

              <hr className="border-slate-200 dark:border-slate-700" />

              <div className="grid gap-6 md:grid-cols-2">{bottomRowWidgets}</div>
            </div>

            {canViewTopVisitors ? (
              <div className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Top portal visitors</h2>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {topVisitorsLoading ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>
                  ) : topVisitors.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      No Home visits in the last 7 days yet. Users are counted when they open the dashboard (once per browser session).
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
                          <div className="flex min-w-[4rem] flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#0B3EAF]/10 px-3 py-2 text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                            <img
                              src="/portal-visitor-flame.png"
                              alt=""
                              aria-hidden
                              className="h-11 w-11 object-contain drop-shadow-[0_4px_14px_rgba(224,43,32,0.4)]"
                            />
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
              <UpcomingMiniCalendar
                events={upcoming}
                loading={upcomingLoading}
                onEventClick={openUpcomingEvent}
              />

              {!upcomingLoading && todayEvents.length > 0 ? (
                <div className="card no-title-underline p-3 sm:p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Today’s event</h3>
                  <UpcomingEventCards
                    items={todayEvents.slice(0, 1)}
                    loading={false}
                    compact
                    showFacility
                    onItemClick={openUpcomingEvent}
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
                        <CelebrationMiniCard
                          key={`bday-${b?.id ?? "b"}`}
                          item={b}
                          kind="birthday"
                          onClick={() =>
                            openCelebration({ ...b, in_days: Number(b?.in_days) || 0, celebrationKind: "birthday" })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {birthdaysLoading || anniversaryCards.length > 0 ? (
                <div className="card no-title-underline p-3 sm:p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Work anniversaries</h3>
                  {birthdaysLoading ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Loading anniversaries…</p>
                  ) : (
                    <div className="space-y-2.5">
                      {anniversaryCards.map((a) => (
                        <CelebrationMiniCard
                          key={`ann-${a?.id ?? "a"}`}
                          item={a}
                          kind="anniversary"
                          onClick={() =>
                            openCelebration({
                              ...a,
                              celebrationKind: "anniversary",
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {upcomingLoading || upcomingFutureOnly.length > 0 ? (
                <div className="card upcoming-rail flex max-h-[calc(100svh-18rem)] flex-col p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">Upcoming</h3>
                    <Link
                      to="/upcoming"
                      className="text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <UpcomingEventCards
                      items={upcomingFutureOnly}
                      loading={upcomingLoading}
                      compact
                      showFacility
                      onItemClick={openUpcomingEvent}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
