import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AppSidebar from "./AppSidebar";
import AppTopBar from "./AppTopBar";
import Footer from "./Footer";
import PageBirdAccent from "./PageBirdAccent";

export default function AuthenticatedLayout({ darkMode, setDarkMode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="agc-app-shell app-dashboard flex min-h-dvh w-full flex-col lg:flex-row">
      <AppSidebar />
      <div className="agc-main-column relative flex min-w-0 flex-1 flex-col">
        <AppTopBar darkMode={darkMode} setDarkMode={setDarkMode} />
        <div className="min-h-0 min-w-0 flex-1">
          <Outlet />
        </div>
        <Footer />
        <PageBirdAccent />
      </div>
    </div>
  );
}
