import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { hasNpdAccess } from "../utils/adminAccess";

// Counts everything sitting in the current user's "My tasks" +
// "Waiting for my approval" lists on the NPD dashboard — i.e. submit steps
// assigned to them, approval steps they're a configured approver for, and
// multi_confirm slots they can confirm. Mirrors useMyOpenTicketCount's
// pattern (same refresh triggers) so the NPD nav badge behaves exactly like
// the IT Ticket one.
export function useMyNpdActionCount(user) {
  const [count, setCount] = useState(0);
  const canAccess = hasNpdAccess(user);

  const load = useCallback(async () => {
    if (!user?.id || !canAccess) {
      setCount(0);
      return;
    }
    try {
      const [tasksRes, approvalsRes] = await Promise.all([
        api.get("/npd/my-tasks"),
        api.get("/npd/my-approvals"),
      ]);
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const approvals = Array.isArray(approvalsRes.data) ? approvalsRes.data : [];
      setCount(tasks.length + approvals.length);
    } catch {
      setCount(0);
    }
  }, [user?.id, canAccess]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-npd-changed", onRefresh);
    return () => window.removeEventListener("agc-npd-changed", onRefresh);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  return count;
}
