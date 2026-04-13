import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { userHasDepartment } from "../utils/userDepts";

function isActiveTicket(t) {
  return t && t.status !== "closed";
}

/**
 * Single banner when the user has open IT tickets assigned to them (IT staff)
 * or open tickets they submitted. Hidden when everything is completed.
 */
export default function DashboardAssignmentNotice({ user }) {
  const [assignedToMeCount, setAssignedToMeCount] = useState(0);
  const [myOpenCount, setMyOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const isIT = userHasDepartment(user, "IT");

  const load = useCallback(async () => {
    if (!user?.id) {
      setAssignedToMeCount(0);
      setMyOpenCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [ticketsRes, assignedRes] = await Promise.all([
        api.get("/tickets"),
        isIT ? api.get("/tickets/assigned-to-me") : Promise.resolve({ data: [] }),
      ]);

      const list = Array.isArray(ticketsRes.data) ? ticketsRes.data : [];
      const assignedList = Array.isArray(assignedRes.data) ? assignedRes.data : [];

      let mineOpen = 0;
      if (isIT) {
        const uid = Number(user.id);
        mineOpen = list.filter((t) => {
          if (!isActiveTicket(t)) return false;
          const creator = t.user_id != null ? Number(t.user_id) : null;
          if (creator === uid) return true;
          const email = (t.user_email || "").toLowerCase();
          return email && email === String(user.email || "").toLowerCase();
        }).length;
        setAssignedToMeCount(assignedList.filter(isActiveTicket).length);
      } else {
        mineOpen = list.filter(isActiveTicket).length;
        setAssignedToMeCount(0);
      }
      setMyOpenCount(mineOpen);
    } catch {
      setAssignedToMeCount(0);
      setMyOpenCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email, isIT]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-it-tickets-changed", onRefresh);
    return () => window.removeEventListener("agc-it-tickets-changed", onRefresh);
  }, [load]);

  if (loading) return null;

  const show = assignedToMeCount > 0 || myOpenCount > 0;
  if (!show) return null;

  return (
    <div
      className="rounded-portal border border-[rgba(11,62,175,0.25)] bg-[rgba(167,211,68,0.12)] px-4 py-3 dark:border-[rgba(167,211,68,0.35)] dark:bg-[rgba(11,62,175,0.2)]"
      role="status"
    >
      <p className="text-sm font-semibold text-[#000000] dark:text-white">You have open items</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[#000000]/85 dark:text-white/80">
        {assignedToMeCount > 0 ? (
          <li>
            {assignedToMeCount === 1
              ? "1 IT ticket is assigned to you."
              : `${assignedToMeCount} IT tickets are assigned to you.`}{" "}
            <Link
              to="/it-tickets"
              className="font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 dark:text-[#A7D344]"
            >
              Open IT Ticket
            </Link>{" "}
            to resolve or update them. This notice goes away when all assigned tickets are completed.
          </li>
        ) : null}
        {myOpenCount > 0 ? (
          <li>
            {myOpenCount === 1
              ? "You have 1 ticket you submitted that is still open or in progress."
              : `You have ${myOpenCount} tickets you submitted that are still open or in progress.`}{" "}
            <Link
              to="/it-tickets"
              className="font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 dark:text-[#A7D344]"
            >
              View IT Ticket
            </Link>{" "}
            for status. This notice goes away when IT marks them completed.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
