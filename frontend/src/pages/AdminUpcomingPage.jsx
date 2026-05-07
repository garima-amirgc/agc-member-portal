import { PAGE_SHELL } from "../constants/pageLayout";
import AdminUpcomingSection from "../components/AdminUpcomingSection";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";

export default function AdminUpcomingPage() {
  const { user } = useAuth();

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Upcoming events" />
      <DashboardAssignmentNotice user={user} />
      <AdminUpcomingSection className="card" />
    </main>
  );
}
