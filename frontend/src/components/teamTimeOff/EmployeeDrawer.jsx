import { useEffect, useState } from "react";
import api from "../../services/api";
import { friendlyErrorMessage } from "../../services/friendlyError";
import { badgeClassFor, dotClassFor, fmtDateRange, fmtDays } from "./timeOffShared";

// Vacation first (the policy managers care about most), then everything
// else alphabetically — so the card order is predictable regardless of
// what order ADP happens to return policies in.
function sortBalances(balances) {
  return [...(balances || [])].sort((a, b) => {
    const av = /vacation/i.test(a.policy_name || a.policy_code || "") ? 0 : 1;
    const bv = /vacation/i.test(b.policy_name || b.policy_code || "") ? 0 : 1;
    if (av !== bv) return av - bv;
    return String(a.policy_name || a.policy_code || "").localeCompare(String(b.policy_name || b.policy_code || ""));
  });
}

// Across-all-policies total, for the one-line summary at the top of the
// drawer. Skips policies with no numeric data at all (e.g. an "unlimited"
// unpaid-leave policy) so they don't silently drag the total down.
function totalsFor(balances) {
  let used = 0;
  let available = 0;
  let any = false;
  for (const b of balances || []) {
    if (b.used != null) {
      used += b.used;
      any = true;
    }
    if (b.available != null) {
      available += b.available;
      any = true;
    }
  }
  return { used, available, any };
}

export default function EmployeeDrawer({ employee, year, onClose }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!employee) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setHistory(null);
    (async () => {
      try {
        const { data } = await api.get(`/manager-time-off/employees/${employee.id}/history`, { params: { year } });
        if (!cancelled) setHistory(data);
      } catch (e) {
        if (!cancelled) setError(friendlyErrorMessage(e, "Could not load this employee's time-off history."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employee, year]);

  if (!employee) return null;

  const balances = sortBalances(employee.balances);
  const totals = totalsFor(balances);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{employee.name}</h3>
            {employee.job_title ? <p className="text-sm text-slate-500 dark:text-slate-400">{employee.job_title}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-outline px-2 py-1 text-sm">
            Close
          </button>
        </div>

        {!employee.adp_linked ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            This employee isn't linked to an ADP Associate ID yet, so no time-off data is available.
          </p>
        ) : (
          <>
            {employee.balances_authorized !== false && totals.any ? (
              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/60">
                <span className="font-semibold text-slate-900 dark:text-white">{fmtDays(totals.used)} days used</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  · {fmtDays(totals.available)} remaining across {balances.length} leave type{balances.length === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {employee.balances_authorized === false ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  ADP access for this employee's balances isn't available yet — see the banner on the main board.
                </p>
              ) : balances.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No balances on file for this employee — access is fine, ADP just doesn't have a time-off policy on
                  record for them.
                </p>
              ) : (
                balances.map((b) => {
                  const total = b.used != null && b.available != null ? b.used + b.available : null;
                  const pct = total ? Math.min(100, Math.round((b.used / total) * 100)) : null;
                  return (
                    <div key={b.policy_code} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClassFor(b.policy_name || b.policy_code)}`}>
                          {b.policy_name || b.policy_code}
                        </span>
                        {pct != null ? <span className="text-xs text-slate-500 dark:text-slate-400">{pct}% used</span> : null}
                      </div>
                      {pct != null ? (
                        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className={`h-full rounded-full ${dotClassFor(b.policy_name || b.policy_code)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <dt className="text-slate-500 dark:text-slate-400">Entitlement</dt>
                        <dd className="text-right font-medium">{fmtDays(b.entitlement)} days</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Carried over</dt>
                        <dd className="text-right font-medium">{fmtDays(b.carried_over)} days</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Used</dt>
                        <dd className="text-right font-medium">{fmtDays(b.used)} days</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Scheduled</dt>
                        <dd className="text-right font-medium">{fmtDays(b.scheduled)} days</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Available</dt>
                        <dd className="text-right font-medium">{fmtDays(b.available)} days</dd>
                      </dl>
                    </div>
                  );
                })
              )}
            </div>

            {employee.next_time_off ? (
              <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">
                <span className="font-medium">Upcoming:</span> {fmtDateRange(employee.next_time_off.start_date, employee.next_time_off.end_date)} —{" "}
                {employee.next_time_off.policy_name || employee.next_time_off.policy_code}
              </p>
            ) : null}

            <h4 className="mt-6 mb-2 font-semibold text-slate-900 dark:text-white">{year} time-off history</h4>
            {!loading && !error && history?.sync_window && (`${year}-01-01` < history.sync_window.from || `${year}-12-31` > history.sync_window.to) ? (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                {year} isn't fully covered by the last sync ({history.sync_window.from} to {history.sync_window.to}), so
                this may be missing entries outside that range.
              </p>
            ) : null}
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : error ? (
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            ) : history?.authorized === false ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                ADP access for time-off requests isn't available yet — see the banner on the main board.
              </p>
            ) : (history?.entries || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No time off on record for {year}.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {history.entries.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClassFor(t.policy_name || t.policy_code)}`}>
                      {t.policy_name || t.policy_code || "Time off"}
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">{fmtDateRange(t.start_date, t.end_date)}</span>
                    {t.hours != null ? <span className="text-xs text-slate-500">{t.hours}h</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
