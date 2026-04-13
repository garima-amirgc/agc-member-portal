import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

function formatAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export default function ItTicketsAssigneeWidget() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/tickets/assigned-to-me")
      .then((r) => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("agc-it-tickets-changed", onRefresh);
    return () => window.removeEventListener("agc-it-tickets-changed", onRefresh);
  }, [load]);

  const markCompleted = async (id) => {
    setCompletingId(id);
    try {
      await api.patch(`/tickets/${id}`, { status: "closed" });
      await load();
      window.dispatchEvent(new Event("agc-it-tickets-changed"));
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || "Could not update ticket.");
    } finally {
      setCompletingId(null);
    }
  };

  const active = tickets.filter((t) => t.status !== "closed");

  return (
    <section className="card border-[rgba(11,62,175,0.2)] dark:border-[rgba(167,211,68,0.25)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#000000] dark:text-white">IT tickets assigned to you</h2>
          <p className="mt-1 text-sm text-[#000000]/70 dark:text-white/65">
            New submissions that chose you as the assignee appear here and on{" "}
            <Link
              to="/it-tickets"
              className="font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 dark:text-[#A7D344]"
            >
              IT Ticket
            </Link>
            .
          </p>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full bg-[rgba(167,211,68,0.25)] px-3 py-1 text-xs font-bold text-[#000000] dark:text-[#A7D344]">
            {active.length} open
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-[#000000]/60 dark:text-white/55">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-[#000000]/70 dark:text-white/65">No tickets are assigned to you yet.</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-[#000000]/70 dark:text-white/65">
          No active assignments. All tickets assigned to you are completed.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((t) => (
            <li
              key={t.id}
              className="rounded-portal border border-[rgba(11,62,175,0.12)] p-3 dark:border-[rgba(167,211,68,0.2)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">Ticket #{t.id}</div>
                  <div className="font-semibold text-[#000000] dark:text-white">{t.title}</div>
                  <p className="mt-1 text-xs text-[#000000]/65 dark:text-white/55">
                    From <strong>{t.user_name}</strong> · {formatAt(t.created_at)}
                  </p>
                  <span
                    className={[
                      "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      t.status === "open"
                        ? "bg-[rgba(167,211,68,0.25)] text-[#000000] dark:text-[#A7D344]"
                        : "bg-[rgba(11,62,175,0.15)] text-[#0B3EAF] dark:bg-[rgba(11,62,175,0.35)] dark:text-white",
                    ].join(" ")}
                  >
                    {t.status === "in_progress" ? "In progress" : "Open"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={completingId === t.id}
                  className="btn-primary shrink-0 text-xs disabled:opacity-60"
                  onClick={() => markCompleted(t.id)}
                >
                  {completingId === t.id ? "Saving…" : "Mark completed"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
