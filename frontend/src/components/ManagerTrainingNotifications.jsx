import { useEffect, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

export default function ManagerTrainingNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/notifications/me");
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to load learning updates"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dismiss = async (id, kind = "course") => {
    try {
      const qs = kind === "all_training" ? "?kind=all_training" : "";
      await api.post(`/notifications/${id}/dismiss${qs}`);
      setNotifications((prev) =>
        prev.filter((n) => !(n.id === id && (n.notification_kind || "course") === kind))
      );
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to dismiss"));
    }
  };

  return (
    <section className="card border-stone-200/90 dark:border-stone-600">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">University learning updates</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Course completions and all-training milestones from your team.
      </p>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading updates…</p>}
      {error && (
        <div className="mt-4 rounded bg-rose-100 p-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No active learning updates.</p>
      )}

      {!loading && !error && notifications.length > 0 && (
        <ul className="mt-4 space-y-3">
          {notifications.map((n) => {
            const isAllTraining = n.notification_kind === "all_training";
            return (
              <li
                key={`${n.notification_kind || "course"}-${n.id}`}
                className={`flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50 ${
                  isAllTraining ? "border-emerald-300/50 dark:border-emerald-700/40" : ""
                }`}
              >
                <div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {isAllTraining
                      ? `${n.employee_name} completed all assigned training`
                      : `${n.employee_name} completed`}
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {n.course_name || n.course_title}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                  </div>
                </div>
                <button type="button" className="btn-primary shrink-0" onClick={() => dismiss(n.id, n.notification_kind || "course")}>
                  Dismiss
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
