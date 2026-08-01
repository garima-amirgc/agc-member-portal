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
  const [courseAssignments, setCourseAssignments] = useState([]);
  const [docAssignments, setDocAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(null);

  const elapsedDays = daysSince(user?.new_hire_marked_at);
  const show = Boolean(user?.is_new_hire) && elapsedDays != null && elapsedDays < VISIBLE_DAYS;

  const loadTraining = (userId) => {
    return Promise.all([
      api.get("/assignments/me").then((r) => Array.isArray(r.data) ? r.data : []).catch(() => []),
      api.get("/training/me").then((r) => Array.isArray(r.data?.documents) ? r.data.documents : []).catch(() => []),
    ]);
  };

  useEffect(() => {
    if (!show || !user?.id) {
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    loadTraining(user.id).then(([courses, docs]) => {
      if (stale) return;
      setCourseAssignments(courses);
      setDocAssignments(docs);
    }).finally(() => {
      if (!stale) setLoading(false);
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, user?.id]);

  const markDocDone = async (docId) => {
    if (!user?.id) return;
    setCompleting(docId);
    try {
      const r = await api.put(`/training/users/${user.id}/document/${docId}/complete`);
      // Refresh doc list
      const docs = await api.get("/training/me").then((r2) => Array.isArray(r2.data?.documents) ? r2.data.documents : []).catch(() => []);
      setDocAssignments(docs);
      if (r.data?.all_training_complete) {
        window.dispatchEvent(new CustomEvent("agc-training-complete"));
      }
    } catch {
      // silent
    } finally {
      setCompleting(null);
    }
  };

  if (!show) return null;

  const daysLeft = Math.max(1, Math.ceil(VISIBLE_DAYS - elapsedDays));
  const pendingCourses = courseAssignments.filter((a) => a.status !== "completed");
  const pendingDocs = docAssignments.filter((d) => d.status !== "completed");

  // Progress across both
  const totalItems = courseAssignments.length + docAssignments.length;
  const completedItems =
    courseAssignments.filter((a) => a.status === "completed").length +
    docAssignments.filter((d) => d.status === "completed").length;

  const hasPending = pendingCourses.length > 0 || pendingDocs.length > 0;

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
          {/* Essential training column */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Essential training
              </h3>
              {totalItems > 0 && (
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  {completedItems}/{totalItems} done
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : !hasPending && totalItems === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nothing assigned yet — check back soon.
              </p>
            ) : !hasPending ? (
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ All training complete — great work!
              </p>
            ) : (
              <ul className="space-y-2">
                {pendingCourses.map((a) => (
                  <li key={`c-${a.id}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0B3EAF] dark:bg-[#A7D344]" aria-hidden />
                    <Link
                      to={`/course/${a.course_id}`}
                      className="text-sm font-semibold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF]"
                    >
                      {a.course_title || "Untitled course"}
                    </Link>
                  </li>
                ))}
                {pendingDocs.map((d) => (
                  <li key={`d-${d.id}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {d.title}
                        </span>
                        <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          doc
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {d.file_url && (
                          <a
                            href={d.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#0B3EAF] underline decoration-[#A7D344] underline-offset-2 dark:text-[#A7D344]"
                          >
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={completing === d.document_id}
                          onClick={() => markDocDone(d.document_id)}
                          className="rounded border border-[#0B3EAF]/30 px-1.5 py-0.5 text-[11px] font-semibold text-[#0B3EAF] hover:bg-[#0B3EAF]/10 disabled:opacity-50 dark:border-[#A7D344]/40 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10"
                        >
                          {completing === d.document_id ? "Saving…" : "Mark done"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Helpful links column */}
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Helpful links
            </h3>
            <ul className="space-y-1.5">
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
