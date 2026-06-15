import { useEffect, useState } from "react";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import LeaveRequestPanel from "../components/LeaveRequestPanel";
import ManagerEmployeeManagement from "../components/ManagerEmployeeManagement";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import { useAuth } from "../context/AuthContext";
import { isSupervisor } from "../utils/supervisorAccess";
import { friendlyErrorMessage } from "../services/friendlyError";

export default function TeamPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/users/me");
        setMe(res.data);
      } catch (e) {
        setError(friendlyErrorMessage(e, "Failed to load team"));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <main className={PAGE_SHELL}>
        <div className="card p-4 text-sm text-slate-500">Loading team…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={PAGE_SHELL}>
        <div className="rounded bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className={PAGE_SHELL}>
        <div className="card p-4 text-sm text-slate-500">Team information is unavailable.</div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-6 text-2xl font-bold">Team</h1>
      </section>

      <ReportingHierarchyTree hierarchy={me.reporting_hierarchy} currentUserId={me.id} />

      {isSupervisor(user) ? <ManagerEmployeeManagement /> : null}

      {user?.role !== "Admin" ? (
        <details className="group card rounded-portal border border-stone-200/90 p-4 open:ring-1 open:ring-brand-blue/20 dark:border-stone-700 dark:open:ring-brand-blue/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 font-semibold text-slate-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden dark:text-slate-100">
            <span>Leave requests</span>
            <svg
              className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180 dark:text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </summary>
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
            <LeaveRequestPanel embedded />
          </div>
        </details>
      ) : null}
    </main>
  );
}
