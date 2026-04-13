import { Link } from "react-router-dom";
import { PAGE_SHELL } from "../constants/pageLayout";
import AdminUpcomingSection from "../components/AdminUpcomingSection";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";

export default function AdminUpcomingPage() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader title="Upcoming events" />
      <div className={PAGE_SHELL}>
        <DashboardAssignmentNotice user={user} />
        <AdminUpcomingSection className="card" />
        <div className="card">
          <h2 className="mb-2 text-lg font-semibold">Admin tools</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Go to{" "}
            <Link className="font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blue-hover dark:text-brand-green" to="/users">
              Users
            </Link>{" "}
            for accounts;{" "}
            <Link className="font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blue-hover dark:text-brand-green" to="/admin">
              Learning admin
            </Link>{" "}
            for courses and assignments.
          </p>
        </div>
      </div>
    </>
  );
}
