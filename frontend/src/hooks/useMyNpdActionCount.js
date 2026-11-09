import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { hasNpdAccess } from "../utils/adminAccess";

// Counts how many NPD requests are sitting in the current user's "Needs my
// decision" list — i.e. they were picked as an SLT approver for a request
// that's still pending_review. Used to be "My tasks" + "Waiting for my
// approval" from the old 13-step pipeline; those endpoints were removed
// when that pipeline was, on 2026-11-07. Mirrors useMyOpenTicketCount's
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
      const { data } = await api.get("/npd/my-pending-decisions");
      const pending = Array.isArray(data) ? data : [];
      setCount(pending.length);
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
