import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import api from "./services/api";
import { FACILITY_CODES } from "./constants/facilities";
import AuthenticatedLayout from "./components/layout/AuthenticatedLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SsoCallbackPage from "./pages/SsoCallbackPage";
import InviteSetupPage from "./pages/InviteSetupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardIndex from "./pages/DashboardIndex";
import DashboardPage from "./pages/DashboardPage";
import UpcomingPage, { UpcomingEventDetailPage } from "./pages/UpcomingPage";
import AdminUpcomingPage from "./pages/AdminUpcomingPage";
import AdminEmployeeOfMonthPage from "./pages/AdminEmployeeOfMonthPage";
import AdminLeadershipUpdatesPage from "./pages/AdminLeadershipUpdatesPage";
import AdminNewHiresPage from "./pages/AdminNewHiresPage";
import EmployeeOfMonthHistoryPage from "./pages/EmployeeOfMonthHistoryPage";
import LeadershipUpdatesPage from "./pages/LeadershipUpdatesPage";
import LeadershipUpdateDetailPage from "./pages/LeadershipUpdateDetailPage";
import NewHiresPage from "./pages/NewHiresPage";
import NewHireDetailPage from "./pages/NewHireDetailPage";
import CustomerWinsPage from "./pages/CustomerWinsPage";
import CustomerWinDetailPage from "./pages/CustomerWinDetailPage";
import AdminCustomerWinsPage from "./pages/AdminCustomerWinsPage";
import CommunityInvolvementPage from "./pages/CommunityInvolvementPage";
import CommunityInvolvementDetailPage from "./pages/CommunityInvolvementDetailPage";
import AdminCommunityInvolvementPage from "./pages/AdminCommunityInvolvementPage";
import AdminAboutCompanyPage from "./pages/AdminAboutCompanyPage";
import AboutCompanyPage from "./pages/AboutCompanyPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import CoursePlayerPage from "./pages/CoursePlayerPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import ProfilePage from "./pages/ProfilePage";
import HelpPage from "./pages/HelpPage";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityCoursesPage from "./pages/FacilityCoursesPage";
import ManagerDashboardPage from "./pages/ManagerDashboardPage";
import TeamPage from "./pages/TeamPage";
import ResourcesCategoryPage from "./pages/ResourcesCategoryPage";
import ResourceVideoPage from "./pages/ResourceVideoPage";
import ResourceDocumentPage from "./pages/ResourceDocumentPage";
import ItTicketsPage from "./pages/ItTicketsPage";
import CalendarPage from "./pages/CalendarPage";
import ReportsPage from "./pages/ReportsPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminSystemStatusPage from "./pages/AdminSystemStatusPage";
import AdminCalendarPage from "./pages/AdminCalendarPage";
import AdminPollsPage from "./pages/AdminPollsPage";
import { ADMIN_GRANT_KEYS } from "./constants/adminGrants";

function pickFacilityForLegacyResources(me) {
  try {
    const last = sessionStorage.getItem("agc_portal_last_facility");
    const lastU = last ? String(last).toUpperCase() : null;
    if (lastU && FACILITY_CODES.includes(lastU)) return lastU;
  } catch {
    /* ignore */
  }
  const facs = Array.isArray(me?.facilities) ? me.facilities.map((f) => String(f).toUpperCase()) : [];
  const firstKnown = facs.find((f) => FACILITY_CODES.includes(f));
  if (firstKnown) return firstKnown;
  const bu = String(me?.business_unit || "AGC").toUpperCase();
  if (FACILITY_CODES.includes(bu)) return bu;
  return "AGC";
}

function LegacyResourcesCategoryRedirect() {
  const { category } = useParams();
  const [to, setTo] = useState(null);
  useEffect(() => {
    api
      .get("/users/me")
      .then((res) => setTo(`/facilities/${pickFacilityForLegacyResources(res.data)}/resources/${category}`))
      .catch(() => setTo(`/facilities/AGC/resources/${category}`));
  }, [category]);
  if (!to)
    return <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">Loading resources…</div>;
  return <Navigate to={to} replace />;
}

function LegacyResourceVideoRedirect() {
  const { category, videoId } = useParams();
  const [to, setTo] = useState(null);
  useEffect(() => {
    api
      .get("/users/me")
      .then((res) =>
        setTo(`/facilities/${pickFacilityForLegacyResources(res.data)}/resources/${category}/video/${videoId}`)
      )
      .catch(() => setTo(`/facilities/AGC/resources/${category}/video/${videoId}`));
  }, [category, videoId]);
  if (!to)
    return <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-400">Loading…</div>;
  return <Navigate to={to} replace />;
}

export default function App() {
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/sso" element={<SsoCallbackPage />} />
      <Route path="/invite" element={<InviteSetupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AuthenticatedLayout darkMode={darkMode} setDarkMode={setDarkMode} />}>
        <Route index element={<DashboardIndex />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="upcoming" element={<UpcomingPage />} />
        <Route path="upcoming/:eventId" element={<UpcomingEventDetailPage />} />
        <Route path="employee-of-month/history" element={<EmployeeOfMonthHistoryPage />} />
        <Route path="leadership-updates" element={<LeadershipUpdatesPage />} />
        <Route path="leadership-updates/:id" element={<LeadershipUpdateDetailPage />} />
        <Route path="new-hires" element={<NewHiresPage />} />
        <Route path="new-hires/:id" element={<NewHireDetailPage />} />
        <Route path="customer-wins" element={<CustomerWinsPage />} />
        <Route path="customer-wins/:id" element={<CustomerWinDetailPage />} />
        <Route path="community-involvement" element={<CommunityInvolvementPage />} />
        <Route path="community-involvement/:id" element={<CommunityInvolvementDetailPage />} />
        <Route path="about-company/:section" element={<AboutCompanyPage />} />
        <Route
          path="users"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.USERS}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="it-tickets" element={<ItTicketsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route
          path="facilities/:facility/resources/:category/video/:videoId"
          element={<ResourceVideoPage />}
        />
        <Route
          path="facilities/:facility/resources/:category/document/:docId"
          element={<ResourceDocumentPage />}
        />
        <Route path="facilities/:facility/resources/:category" element={<ResourcesCategoryPage />} />
        <Route path="facilities/:facility" element={<FacilityCoursesPage />} />
        <Route path="course/:id" element={<CoursePlayerPage />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.LEARNING_ADMIN}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.REPORTS}>
              <AdminReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/system"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.SYSTEM}>
              <AdminSystemStatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/calendar"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR}>
              <AdminCalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/upcoming"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminUpcomingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/employee-of-month"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminEmployeeOfMonthPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/leadership-updates"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminLeadershipUpdatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/new-hires"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminNewHiresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/customer-wins"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminCustomerWinsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/community-involvement"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.UPCOMING}>
              <AdminCommunityInvolvementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/about-company"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.COMPANY_CONTENT}>
              <AdminAboutCompanyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/polls"
          element={
            <ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.FEEDBACK_POLLS}>
              <AdminPollsPage />
            </ProtectedRoute>
          }
        />
        <Route path="team" element={<TeamPage />} />
        <Route
          path="manager"
          element={
            <ProtectedRoute supervisor>
              <ManagerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="employee-engagement-calendar" element={<Navigate to="/calendar" replace />} />
        <Route path="admin/engagement-calendar" element={<Navigate to="/admin/calendar" replace />} />
        <Route path="resources/:category/video/:videoId" element={<LegacyResourceVideoRedirect />} />
        <Route path="resources/:category" element={<LegacyResourcesCategoryRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}
