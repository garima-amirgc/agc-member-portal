import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import NewHireWelcomeCard from "../components/NewHireWelcomeCard";
import TrainingCompletionNotice from "../components/TrainingCompletionNotice";
import UpcomingEventsList from "../components/UpcomingEventsList";
import api from "../services/api";
import { useCelebration } from "../context/CelebrationContext";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { hasAdminGrant } from "../utils/adminAccess";
import CompanyNewsFeed from "../components/CompanyNewsFeed";
import NewHiresCard from "../components/NewHiresCard";
import BirthdaysCard from "../components/BirthdaysCard";
import QuickActionsRow from "../components/QuickActionsRow";
import WelcomeBanner from "../components/WelcomeBanner";
import HelpfulResourcesCard from "../components/HelpfulResourcesCard";
import UpcomingMiniCalendar from "../components/UpcomingMiniCalendar";

function parseSpotlightFeedEntries(data) {
  if (Array.isArray(data)) {
    return data.filter((item) => item?.title);
  }
  return data?.title ? [data] : [];
}

function SidebarCardHeader({ title, accent = "blue", action = null }) {
  const dot = accent === "green" ? "bg-[#A7D344]" : "bg-[#0B3EAF]";
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canManageEmployeeOfMonth = hasAdminGrant(user, ADMIN_GRANT_KEYS.EMPLOYEE_OF_MONTH);
  const canManageLeadershipUpdates = hasAdminGrant(user, ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES);
  const canManageNewHires = hasAdminGrant(user, ADMIN_GRANT_KEYS.NEW_HIRES);
  const canManageCustomerWins = hasAdminGrant(user, ADMIN_GRANT_KEYS.CUSTOMER_WINS);
  const canManageCommunityInvolvement = hasAdminGrant(user, ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT);
  const canManageCompanyNews =
    canManageEmployeeOfMonth || canManageLeadershipUpdates || canManageCustomerWins || canManageCommunityInvolvement;
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const { openCelebration, feed: birthdays, feedLoading: birthdaysLoading } = useCelebration();
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
    ] = await Promise.allSettled([
      api.get("/upcoming/feed"),
      api.get("/employee-of-month/current"),
      api.get("/leadership-updates/current"),
      api.get("/new-hires/current"),
      api.get("/customer-wins/current"),
      api.get("/community-involvement/current"),
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
  }, []);

  useEffect(() => {
    loadHomeFeeds();
  }, [loadHomeFeeds]);

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
        await api.post("/users/me/portal-visit");
        if (!cancelled) sessionStorage.setItem(key, "1");
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const birthdayCards = useMemo(() => {
    return Array.isArray(birthdays?.today) ? birthdays.today : [];
  }, [birthdays]);

  const anniversaryCards = useMemo(() => {
    return Array.isArray(birthdays?.anniversaries_today) ? birthdays.anniversaries_today : [];
  }, [birthdays]);

  return (
    <>
      <main className={PAGE_SHELL}>
        <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 space-y-6 lg:col-span-9">
            <WelcomeBanner user={user} />
            <NewHireWelcomeCard user={user} />
            <TrainingCompletionNotice user={user} />
            <QuickActionsRow />

            <div className="grid gap-6 sm:grid-cols-2">
              <CompanyNewsFeed
                employeeOfMonthEntries={employeeOfMonthEntries}
                employeeOfMonthLoading={employeeOfMonthLoading}
                leadershipEntries={leadershipUpdateEntries}
                leadershipLoading={leadershipUpdateLoading}
                communityEntries={communityInvolvementEntries}
                communityLoading={communityInvolvementLoading}
                customerWinEntries={customerWinEntries}
                customerWinLoading={customerWinLoading}
                canManage={canManageCompanyNews}
              />

              <NewHiresCard
                newHireEntries={newHireEntries}
                newHireLoading={newHireLoading}
                canManageNewHires={canManageNewHires}
              />

              <BirthdaysCard
                birthdayCards={birthdayCards}
                anniversaryCards={anniversaryCards}
                birthdaysLoading={birthdaysLoading}
                onCelebrationClick={openCelebration}
              />
            </div>

          </div>

          <aside className="min-w-0 lg:col-span-3 lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-4">
              <div className="card no-title-underline rounded-2xl p-3 sm:p-4">
                <SidebarCardHeader
                  title="Upcoming Events"
                  accent="blue"
                  action={
                    <Link
                      to="/upcoming"
                      className="text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
                    >
                      View all
                    </Link>
                  }
                />
                <UpcomingEventsList events={upcoming} loading={upcomingLoading} />
              </div>

              <HelpfulResourcesCard />

              <UpcomingMiniCalendar
                events={upcoming}
                loading={upcomingLoading}
                onEventClick={openCelebration}
              />
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
