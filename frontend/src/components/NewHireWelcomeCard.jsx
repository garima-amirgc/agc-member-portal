import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const VISIBLE_DAYS = 14;

const ESSENTIAL_LINKS = [
  { to: "/facilities", label: "Facilities & org chart", desc: "See your facility's leadership and team." },
  { to: "/profile", label: "Your profile", desc: "Add a photo and double-check your details." },
  { to: "/it-tickets", label: "IT support", desc: "Need a laptop, login, or access? Open a ticket." },
  { to: "/upcoming", label: "Upcoming events", desc: "Orientation, training sessions, and company events." },
];

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / (1000 * 60 * 60 * 24);
}

function firstName(name = "") {
  const part = String(name).trim().split(/\s+/).filter(Boolean)[0];
  return part || "there";
}

export default function NewHireWelcomeCard({ user }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const elapsedDays = daysSince(user?.new_hire_marked_at);
  const show = Boolean(user?.is_new_hire) && elapsedDays != null && elapsedDays < VISIBLE_DAYS;

  useEffect(() => {
    if (!show) {
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    api
      .get("/assignments/me")
      .then((r) => {
        if (stale) return;
        setAssignments(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!stale) setAssignments([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, user?.id]);

  if (!show) return null;

  const daysLeft = Math.max(1, Math.ceil(VISIBLE_DAYS - elapsedDays));
  const pendingTraining = assignments.filter((a) => a.status !== "completed").slice(0, 5);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#0B3EAF]/12 bg-gradient-to-br from-[#eef3ff] via-white to-[#f4fbe8] p-5 shadow-sm dark:border-[#A7D344]/20 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />

      <div className="relative">
        <h2 className="text-lg font-bold text-[#0B3EAF] dark:text-[#A7D344]">
          Welcome to the AGC Group, {firstName(user?.name)}!
        </h2>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
          We're glad you're here. Here's what to get done first.
        </p>

        {user?.manager_name ? (
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-slate-900 dark:text-white">You report to:</span>{" "}
            {user.manager_name}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Essential training
            </h3>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : pendingTraining.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Nothing assigned yet — check back soon.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {pendingTraining.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/course/${a.course_id}`}
                      className="text-sm font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
                    >
                      {a.course_title || "Untitled course"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Helpful links
            </h3>
            <ul className="mt-2 space-y-1.5">
              {ESSENTIAL_LINKS.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
                  >
                    {l.label}
                  </Link>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{l.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          Save these essential links — this card will disappear in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
        </p>
      </div>
    </div>
  );
}
