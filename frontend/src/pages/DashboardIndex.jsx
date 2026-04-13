import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardPage from "./DashboardPage";

/** Admins land on Upcoming; everyone else sees dashboard home. */
export default function DashboardIndex() {
  const { user } = useAuth();
  if (user?.role === "Admin") return <Navigate to="/upcoming" replace />;
  return <DashboardPage />;
}
