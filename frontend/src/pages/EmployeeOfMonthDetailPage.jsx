import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  EMPLOYEE_OF_MONTH_FALLBACK_AVATAR,
  EmployeeOfMonthCardShell,
} from "../components/EmployeeOfMonthCardDecor";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function EomCard({ entry, featured = false }) {
  const emp = entry.employee || {};
  const img = resolvePublicMediaUrl(entry.image_url || emp.profile_image_url);
  const designation = String(emp.designation || "").trim();
  const meta = [emp.department, emp.business_unit].filter(Boolean).join(" · ");

  return (
    <EmployeeOfMonthCardShell className="h-full p-4">
      <div className="flex gap-4">
        <div
          className={`shrink-0 overflow-hidden rounded-lg bg-white shadow-md ring-2 ring-[#A7D344]/50 ${
            featured ? "h-24 w-24" : "h-16 w-16"
          }`}
        >
          <img src={img || EMPLOYEE_OF_MONTH_FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
            {entry.period_label}
            {entry.facility ? ` · ${entry.facility}` : ""}
          </p>
          <h2 className={`mt-0.5 font-semibold text-slate-900 dark:text-white ${featured ? "text-xl" : "text-lg"}`}>
            {emp.name || "—"}
          </h2>
          {designation ? <p className="text-sm text-slate-700 dark:text-slate-200">{designation}</p> : null}
          {meta ? (
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {meta}
            </p>
          ) : null}
          {entry.citation ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{entry.citation}</p>
          ) : null}
        </div>
      </div>
    </EmployeeOfMonthCardShell>
  );
}

export default function EmployeeOfMonthDetailPage() {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    Promise.allSettled([
      api.get(`/employee-of-month/${encodeURIComponent(String(id))}`),
      api.get("/employee-of-month/history"),
    ]).then(([entryResult, historyResult]) => {
      if (!alive) return;

      if (entryResult.status === "fulfilled") {
        const data = entryResult.value.data;
        setEntry(data?.employee?.name ? data : null);
      } else {
        setError(
          entryResult.reason?.response?.data?.message || "Could not load this entry."
        );
      }

      if (historyResult.status === "fulfilled") {
        const all = Array.isArray(historyResult.value.data) ? historyResult.value.data : [];
        setHistory(all.filter((e) => String(e.id) !== String(id)));
      }

      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Employee of the Month" subtitle={entry?.employee?.name || "Detail"} />

      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
        <Link to="/" className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green">
          Back to home
        </Link>
        <Link
          to="/employee-of-month/history"
          className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green"
        >
          All past winners
        </Link>
      </p>

      {loading ? (
        <div className="card">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      ) : error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : !entry ? (
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">This entry could not be found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <EomCard entry={entry} featured />
          {history.map((e) => (
            <Link key={e.id} to={`/employee-of-month/${encodeURIComponent(String(e.id))}`} className="block h-full">
              <EomCard entry={e} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
