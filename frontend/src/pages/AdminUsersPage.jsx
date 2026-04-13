import AdminUsersSection from "../components/AdminUsersSection";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="Users" />
      <div className={PAGE_SHELL}>
        <AdminUsersSection className="card" />
      </div>
    </>
  );
}
