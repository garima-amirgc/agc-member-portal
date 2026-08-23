import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import NpdRequestBoardTable from "../components/npd/NpdRequestBoardTable";

function IconClipboard({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h6" />
    </svg>
  );
}

function IconCheckCircle({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function NpdDashboardPage() {
  const { user } = useAuth();
  const isAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);

  const [requests, setRequests] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [myApprovals, setMyApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [reqRes, tasksRes, approvalsRes] = await Promise.all([
        api.get("/npd/requests"),
        api.get("/npd/my-tasks"),
        api.get("/npd/my-approvals"),
      ]);
      setRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
      setMyTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
      setMyApprovals(Array.isArray(approvalsRes.data) ? approvalsRes.data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const deleteRequest = async (r) => {
    if (!window.confirm(`Are you sure you want to delete ${r.request_number}? It will be removed from this list.`)) return;
    setError("");
    setDeletingId(r.id);
    try {
      await api.delete(`/npd/requests/${r.id}`);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      window.dispatchEvent(new Event("agc-npd-changed"));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete that request."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="New Product Development"
          subtitle="Track new-product and customer-modification requests from request to first shipment."
        />
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link to="/npd/admin" className="btn-outline">
              Manage access &amp; approvers
            </Link>
          ) : null}
          <Link to="/npd/new" className="btn-primary">
            + New Request
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border-2 border-[#E02B20]/40 bg-red-50 px-4 py-3 text-sm font-medium text-[#E02B20] dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {(myTasks.length > 0 || myApprovals.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {myTasks.length > 0 ? (
            <section className="card no-title-underline overflow-hidden border-l-4 border-l-[#0B3EAF] p-0 dark:border-l-[#A7D344]">
              <div className="flex items-center gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(11,62,175,0.08)] text-[#0B3EAF] dark:bg-[rgba(167,211,68,0.12)] dark:text-[#A7D344]">
                  <IconClipboard className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-semibold text-[#000000] dark:text-white">My tasks</h2>
                <span className="ml-auto rounded-full bg-[#0B3EAF] px-2.5 py-0.5 text-xs font-bold text-white dark:bg-[#A7D344] dark:text-[#0B3EAF]">
                  {myTasks.length}
                </span>
              </div>
              <ul className="space-y-2 p-4 sm:p-6">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/npd/requests/${t.request_id}`}
                      className="block rounded-xl border border-slate-200 p-3 text-sm transition hover:border-[#0B3EAF] hover:bg-[rgba(11,62,175,0.03)] dark:border-slate-800 dark:hover:border-[#A7D344] dark:hover:bg-[rgba(167,211,68,0.05)]"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100">{t.request_number}</span> —{" "}
                      {t.product_name} ({t.customer_name})
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">Step {t.step_number}: {t.step_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {myApprovals.length > 0 ? (
            <section className="card no-title-underline overflow-hidden border-l-4 border-l-[#A7D344] p-0">
              <div className="flex items-center gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(167,211,68,0.18)] text-[#5c7a1c] dark:bg-[rgba(167,211,68,0.15)] dark:text-[#A7D344]">
                  <IconCheckCircle className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Waiting for my approval</h2>
                <span className="ml-auto rounded-full bg-[#A7D344] px-2.5 py-0.5 text-xs font-bold text-[#1a3d00]">
                  {myApprovals.length}
                </span>
              </div>
              <ul className="space-y-2 p-4 sm:p-6">
                {myApprovals.map((t) => (
                  <li key={`${t.id}-${t.confirmation_area || ""}`}>
                    <Link
                      to={`/npd/requests/${t.request_id}`}
                      className="block rounded-xl border border-slate-200 p-3 text-sm transition hover:border-[#0B3EAF] hover:bg-[rgba(11,62,175,0.03)] dark:border-slate-800 dark:hover:border-[#A7D344] dark:hover:bg-[rgba(167,211,68,0.05)]"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-100">{t.request_number}</span> —{" "}
                      {t.product_name} ({t.customer_name})
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Step {t.step_number}: {t.step_name}
                        {t.confirmation_area ? ` (${t.confirmation_area})` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <NpdRequestBoardTable
        requests={requests}
        loading={loading}
        onDelete={deleteRequest}
        deletingId={deletingId}
      />
    </div>
  );
}
