import AdminUsersSection from "../components/AdminUsersSection";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";

export default function AdminUsersPage() {
  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Users" />
      <AdminUsersSection className="card" />
    </main>
  );
}
