import { useEffect, useState } from "react";
import api from "../../services/api";
import { badgeClassFor, fmtDateRange } from "./timeOffShared";

// FYI panel for ADP time-off EVENTS (pending/approved/cancelled), separate
// from the approved-only data the rest of the board reads from the synced
// tables — see backend/src/services/adpTimeOffEvents.service.js for where
// these come from. Dismissing here only clears the notification in the
// portal; it never touches ADP, so the actual request is still whatever it
// is there regardless of what a manager does with this card.
const KIND_LABEL = {
  pending: "requested",
  approved: "had a request approved",
  cancelled: "cancelled a request",
  other: "has a time-off update",
};
const KIND_DOT = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  cancelled: "bg-slate-400",
  other: "bg-sky-500",
};

export default function NewRequestsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get("/manager-time-off/notifications");
      setItems(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch {
      // A non-manager hitting this (shouldn't happen — the board that
      // renders this panel is already supervisor-gated) would 403 here;
      // treat any failure as "nothing to show" rather than surfacing an
      // error on what's meant to be a lightweight FYI card.
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dismiss = async (id) => {
    setDismissingId(id);
    try {
      await api.post(`/manager-time-off/notifications/${id}/dismiss`);
      setItems((prev) => prev.filter((n) => n.id !== id));
      window.dispatchEvent(new Event("agc-timeoff-notifications-changed"));
    } catch {
      // Leave it in the list — the button will just be clickable again.
    } finally {
      setDismissingId(null);
    }
  };

  if (loading || error || items.length === 0) return null;

  return (
    <div className="card no-title-underline overflow-hidden rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-0 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/10">
      <div className="border-b border-amber-200/70 px-4 py-3 dark:border-amber-900/40">
        <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
          New time off requests ({items.length})
        </h3>
        <p className="mt-0.5 text-xs text-amber-900/70 dark:text-amber-200/70">
          From ADP — this is an FYI, the request itself is still handled in ADP.
        </p>
      </div>
      <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/30">
        {items.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${KIND_DOT[n.event_kind] || KIND_DOT.other}`} aria-hidden />
                <span className="font-semibold text-slate-900 dark:text-white">{n.employee_name}</span>
                <span className="text-slate-600 dark:text-slate-300">{KIND_LABEL[n.event_kind] || KIND_LABEL.other}</span>
                {n.policy_name ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClassFor(n.policy_name)}`}>
                    {n.policy_name}
                  </span>
                ) : null}
              </div>
              {n.start_date ? (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fmtDateRange(n.start_date, n.end_date)}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(n.id)}
              disabled={dismissingId === n.id}
              className="shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-950/40"
            >
              {dismissingId === n.id ? "…" : "Dismiss"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
