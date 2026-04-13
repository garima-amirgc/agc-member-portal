import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import api from "./services/api";
import { FACILITY_CODES } from "./constants/facilities";
import AuthenticatedLayout from "./components/layout/AuthenticatedLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import InviteSetupPage from "./pages/InviteSetupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardIndex from "./pages/DashboardIndex";
import DashboardPage from "./pages/DashboardPage";
import AdminUpcomingPage from "./pages/AdminUpcomingPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import CoursePlayerPage from "./pages/CoursePlayerPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import ProfilePage from "./pages/ProfilePage";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityCoursesPage from "./pages/FacilityCoursesPage";
import ManagerDashboardPage from "./pages/ManagerDashboardPage";
import ResourcesCategoryPage from "./pages/ResourcesCategoryPage";
import ResourceVideoPage from "./pages/ResourceVideoPage";
import ResourceDocumentPage from "./pages/ResourceDocumentPage";
import ItTicketsPage from "./pages/ItTicketsPage";

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
      <Route path="/invite" element={<InviteSetupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AuthenticatedLayout darkMode={darkMode} setDarkMode={setDarkMode} />}>
        <Route index element={<DashboardIndex />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="upcoming"
          element={
            <ProtectedRoute roles={["Admin"]}>
              <AdminUpcomingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute roles={["Admin"]}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="it-tickets" element={<ItTicketsPage />} />
        <Route path="profile" element={<ProfilePage />} />
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
            <ProtectedRoute roles={["Admin"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="manager"
          element={
            <ProtectedRoute roles={["Manager"]}>
              <ManagerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="resources/:category/video/:videoId" element={<LegacyResourceVideoRedirect />} />
        <Route path="resources/:category" element={<LegacyResourcesCategoryRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}
