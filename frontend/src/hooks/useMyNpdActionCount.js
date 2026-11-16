import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { hasNpdAccess } from "../utils/adminAccess";

// Counts how many NPD requests are sitting in the current user's "Needs my
// decision" list — i.e. they were picked as an SLT approver for a request
// that's still pending_review, for EITHER Gate 1's SLT review or Gate 2's
// sign-off (two separate pending-decision lists, summed into one badge).
// Used to be "My tasks" + "Waiting for my approval" from the old 13-step
// pipeline; those endpoints were removed when that pipeline was, on
// 2026-11-07. Mirrors useMyOpenTicketCount's pattern (same refresh
// triggers) so the NPD nav badge behaves exactly like the IT Ticket one.
//
// Bug fixed 2026-11-16: this only ever checked Gate 1's endpoint, so being
// picked as a Gate 2 approver never bumped the sidebar badge — the request
// only showed up if someone happened to open the NPD dashboard page itself
// and saw the "Needs my Gate 2 decision" panel there. Now checks both.
export function useMyNpdActionCount(user) {
  const [count, setCount] = useState(0);
  const canAccess = hasNpdAccess(user);

  const load = useCallback(async () => {
    if (!user?.id || !canAccess) {
      setCount(0);
      return;
    }
    const fetchCount = async (path) => {
      try {
        const { data } = await api.get(path);
        return Array.isArray(data) ? data.length : 0;
      } catch {
        return 0;
      }
    };
    const [gate1Count, gate2Count] = await Promise.all([
      fetchCount("/npd/my-pending-decisions"),
      fetchCount("/npd/gate2/my-pending-decisions"),
    ]);
    setCount(gate1Count + gate2Count);
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
