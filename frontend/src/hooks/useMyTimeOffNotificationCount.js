import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { isSupervisor } from "../utils/supervisorAccess";

// Same pattern as useMyOpenTicketCount / useMyNpdActionCount: poll count on
// mount, refresh on a custom window event (fired by NewRequestsPanel after a
// dismiss) and every 60s while the tab is visible, swallow errors to 0.
// Gated on isSupervisor so non-managers never hit the manager-only endpoint
// (it 403s for them anyway, but there's no reason to keep polling it).
export function useMyTimeOffNotificationCount(user) {
  const [count, setCount] = useState(0);
  const canSee = isSupervisor(user);

  const load = useCallback(async () => {
    if (!user?.id || !canSee) {
      setCount(0);
      return;
    }
    try {
      const { data } = await api.get("/manager-time-off/notifications");
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setCount(list.length);
    } catch {
      setCount(0);
    }
  }, [user?.id, canSee]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-timeoff-notifications-changed", onRefresh);
    return () => window.removeEventListener("agc-timeoff-notifications-changed", onRefresh);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  return count;
}
