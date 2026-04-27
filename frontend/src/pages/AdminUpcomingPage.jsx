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
      </div>
    </>
  );
}
