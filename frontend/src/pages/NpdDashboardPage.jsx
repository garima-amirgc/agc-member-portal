import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import NpdRequestBoardTable from "../components/npd/NpdRequestBoardTable";

// Mirrors the KPI tiles on the source workbook's "Management Dashboard"
// sheet (Active Projects, Priority 1 count, Total Annual GP$) — computed
// client-side from the same /npd/requests list the board table already
// loads, so this needs no new backend endpoint.
function ScorecardKpis({ requests }) {
  const stats = useMemo(() => {
    const priority1 = requests.filter((r) => r.priority_tier === "Priority 1").length;
    const totalGp = requests.reduce((sum, r) => sum + (Number(r.annual_gp_dollars) || 0), 0);
    return { activeCount: requests.length, priority1, totalGp };
  }, [requests]);

  if (requests.length === 0) return null;

  const fmtMoney = (n) =>
    n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${Math.round(n)}`;

  const tiles = [
    { label: "Active Projects", value: stats.activeCount },
    { label: "Priority 1", value: stats.priority1 },
    { label: "Total Annual GP$ (scored)", value: fmtMoney(stats.totalGp) },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-[#0B3EAF] dark:text-[#A7D344]">{t.value}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// "Needs my decision" — mirrors the IT Ticket "assigned to me" pattern.
// Only renders for people who actually have something pending; nobody else
// ever sees this section.
function PendingDecisionsPanel({ pending }) {
  if (pending.length === 0) return null;
  return (
    <section className="card border-2 border-[#0B3EAF]/30 p-4 sm:p-6 dark:border-[#A7D344]/30">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#000000] dark:text-white">Needs my decision</h2>
        <span className="rounded-full bg-[#E02B20] px-2.5 py-0.5 text-xs font-bold text-white">{pending.length}</span>
      </div>
      <ul className="space-y-2">
        {pending.map((r) => (
          <li key={r.id}>
            <Link
              to={`/npd/requests/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <span>
                <span className="font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{r.request_number}</span>{" "}
                {r.product_name} — {r.customer_name}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Sent by {r.created_by_name || "—"} · Score {r.weighted_score ?? "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NpdDashboardPage() {
  const { user } = useAuth();
  const isAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);

  const [requests, setRequests] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/npd/requests");
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      const { data } = await api.get("/npd/my-pending-decisions");
      setPending(Array.isArray(data) ? data : []);
    } catch {
      setPending([]);
    }
  };

  useEffect(() => {
    void load();
    void loadPending();
  }, []);

  useEffect(() => {
    const onRefresh = () => {
      void load();
      void loadPending();
    };
    window.addEventListener("agc-npd-changed", onRefresh);
    return () => window.removeEventListener("agc-npd-changed", onRefresh);
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
          subtitle="Gate 1 — score and prioritize new-product launch requests."
        />
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link to="/npd/admin" className="btn-outline">
              Manage access
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

      <PendingDecisionsPanel pending={pending} />

      <ScorecardKpis requests={requests} />

      <NpdRequestBoardTable
        requests={requests}
        loading={loading}
        onDelete={deleteRequest}
        deletingId={deletingId}
      />
    </div>
  );
}
