import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { userHasDepartment } from "../utils/userDepts";

function isActiveTicket(t) {
  return t && t.status !== "closed";
}

export function useMyOpenTicketCount(user) {
  const [count, setCount] = useState(0);
  const isIT = userHasDepartment(user, "IT");

  const load = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    try {
      const [ticketsRes, assignedRes] = await Promise.all([
        api.get("/tickets"),
        isIT ? api.get("/tickets/assigned-to-me") : Promise.resolve({ data: [] }),
      ]);
      const list = Array.isArray(ticketsRes.data) ? ticketsRes.data : [];
      const assignedList = Array.isArray(assignedRes.data) ? assignedRes.data : [];
      const uid = Number(user.id);
      const mineOpen = list.filter((t) => {
        if (!isActiveTicket(t)) return false;
        const creator = t.user_id != null ? Number(t.user_id) : null;
        if (creator === uid) return true;
        const email = (t.user_email || "").toLowerCase();
        return email && email === String(user.email || "").toLowerCase();
      }).length;
      const assignedOpen = isIT ? assignedList.filter(isActiveTicket).length : 0;
      setCount(mineOpen + assignedOpen);
    } catch {
      setCount(0);
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

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  return count;
}
