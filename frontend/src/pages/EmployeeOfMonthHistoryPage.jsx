import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  EMPLOYEE_OF_MONTH_FALLBACK_AVATAR,
  EmployeeOfMonthCardShell,
} from "../components/EmployeeOfMonthCardDecor";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function HistoryRow({ entry }) {
  const emp = entry.employee || {};
  const img = resolvePublicMediaUrl(entry.image_url || emp.profile_image_url);
  const designation = String(emp.designation || "").trim();
  const meta = [emp.department, emp.business_unit].filter(Boolean).join(" · ");

  return (
    <EmployeeOfMonthCardShell className="h-full p-4">
      <div className="flex gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white shadow-md ring-2 ring-[#A7D344]/50">
          <img src={img || EMPLOYEE_OF_MONTH_FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]">
            {entry.period_label}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-white">{emp.name || "—"}</h2>
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

export default function EmployeeOfMonthHistoryPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get("/employee-of-month/history")
      .then(({ data }) => {
        if (!alive) return;
        setEntries(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!alive) return;
        setEntries([]);
        const status = err.response?.status;
        if (status === 404) {
          setError("Past winners could not be loaded. The API may need a restart — try again in a moment.");
        } else {
          setError(err.response?.data?.message || "Could not load history.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        title="Employee of the Month"
        subtitle="Past winners"
      />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        <Link to="/" className="font-semibold text-brand-blue underline underline-offset-2 dark:text-brand-green">
          Back to home
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
      ) : entries.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-600 dark:text-slate-400">No past winners have been published yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </main>
  );
}
