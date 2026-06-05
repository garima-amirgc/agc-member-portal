import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

/**
 * Banner when the employee has completed all assigned training (persistent until dismissed).
 */
export default function TrainingCompletionNotice({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.get("/notifications/employee/me");
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load training notifications"));
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-training-complete", onRefresh);
    return () => window.removeEventListener("agc-training-complete", onRefresh);
  }, [load]);

  const dismiss = async (id) => {
    try {
      await api.post(`/notifications/employee/${id}/dismiss`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not dismiss notification"));
    }
  };

  if (loading || notifications.length === 0) return null;

  return (
    <div className="space-y-2">
      {error ? <div className="rounded bg-rose-100 p-2 text-sm text-rose-700">{error}</div> : null}
      {notifications.map((n) => (
        <div
          key={n.id}
          className="rounded-portal border border-emerald-300/60 bg-emerald-50 px-4 py-3 dark:border-emerald-700/50 dark:bg-emerald-950/30"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{n.title}</p>
              {n.message ? (
                <p className="mt-1 text-sm text-emerald-800/90 dark:text-emerald-100/85">{n.message}</p>
              ) : null}
              {n.created_at ? (
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/70">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              ) : null}
            </div>
            <button type="button" className="btn-outline shrink-0" onClick={() => dismiss(n.id)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
