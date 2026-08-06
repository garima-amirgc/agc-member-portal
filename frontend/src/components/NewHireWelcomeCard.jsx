import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import ProgressBar from "./ProgressBar";
import {
  IconSparkle,
  IconUser,
  IconTicket,
  IconCalendar,
  IconChart,
  IconDocument,
  IconClipboard,
  IconCheckCircle,
  IconDownload,
  IconShield,
  IconChevron,
} from "./layout/SidebarIcons";

const VISIBLE_DAYS = 30;

// External, SSO-enabled trainings that aren't tracked in our own database —
// completion is self-serve; real status lives in the provider's own console.
const EXTERNAL_TRAININGS = [
  {
    key: "knowbe4-cyber",
    title: "Cybersecurity Awareness Training",
    provider: "KnowBe4",
    url: "https://ca.knowbe4.com",
    note: "Opens in a new tab — sign in with your Microsoft account.",
  },
];

const ESSENTIAL_LINKS = [
  { to: "/profile", label: "Your profile", desc: "Add a photo and double-check your details.", icon: IconUser },
  { to: "/it-tickets", label: "IT support", desc: "Need a laptop, login, or access? Open a ticket.", icon: IconTicket },
  { to: "/upcoming", label: "Upcoming events", desc: "Orientation, training sessions, and company events.", icon: IconCalendar },
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
  const [hasMoreTraining, setHasMoreTraining] = useState(false);
  const glowRef = useRef(null);
  const trainingScrollRef = useRef(null);

  const checkTrainingOverflow = () => {
    const el = trainingScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setHasMoreTraining(el.scrollHeight > el.clientHeight + 4 && !nearBottom);
  };

  const handlePointerMove = (e) => {
    const el = glowRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--glow-x", `${x}%`);
    el.style.setProperty("--glow-y", `${y}%`);
  };

  const handlePointerEnter = () => {
    if (glowRef.current) glowRef.current.style.opacity = "1";
  };

  const handlePointerLeave = () => {
    if (glowRef.current) glowRef.current.style.opacity = "0";
  };

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

  useEffect(() => {
    checkTrainingOverflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, courseAssignments, docAssignments]);

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

  const handleSaveForLater = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const lines = [
      `Welcome to the AGC Group, ${firstName(user?.name)}!`,
      "",
    ];
    if (user?.manager_name) lines.push(`You report to: ${user.manager_name}`, "");

    lines.push("ESSENTIAL TRAINING");
    EXTERNAL_TRAININGS.forEach((t) => {
      lines.push(`- [ ] ${t.title} (${t.provider}) — ${t.url}`);
    });
    if (courseAssignments.length === 0 && docAssignments.length === 0) {
      lines.push("- Nothing assigned yet — check back soon.");
    } else {
      courseAssignments.forEach((a) => {
        lines.push(`- [${a.status === "completed" ? "x" : " "}] ${a.course_title || "Untitled course"}`);
      });
      docAssignments.forEach((d) => {
        lines.push(`- [${d.status === "completed" ? "x" : " "}] ${d.title}${d.file_url ? ` — ${d.file_url}` : ""}`);
      });
    }

    lines.push("", "HELPFUL LINKS");
    ESSENTIAL_LINKS.forEach((l) => {
      lines.push(`- ${l.label}: ${origin}${l.to}`, `  ${l.desc}`);
    });

    lines.push("", "Saved from your AGC Group onboarding dashboard.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AGC-Welcome-Checklist-${firstName(user?.name)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  const progressPct = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-[#0B3EAF]/12 bg-gradient-to-br from-[#eef3ff] via-white to-[#f4fbe8] p-5 shadow-md transition-shadow duration-200 hover:shadow-lg dark:border-[#A7D344]/20 dark:from-[#0B3EAF]/10 dark:via-slate-900/40 dark:to-[#A7D344]/10 sm:p-6"
      onMouseMove={handlePointerMove}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />

      {/* Mouse-follow glow */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out bg-[radial-gradient(480px_circle_at_var(--glow-x,50%)_var(--glow-y,50%),rgba(11,62,175,0.35),transparent_65%)] dark:bg-[radial-gradient(480px_circle_at_var(--glow-x,50%)_var(--glow-y,50%),rgba(11,62,175,0.55),transparent_65%)]"
        aria-hidden
      />

      <div className="relative z-10">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B3EAF] to-[#082d82] shadow-sm dark:from-[#A7D344] dark:to-[#7fa62d]"
            aria-hidden
          >
            <IconSparkle className="h-5 w-5 text-white dark:text-[#0B3EAF]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold leading-tight text-[#0B3EAF] dark:text-[#A7D344]">
                Welcome to the AGC Group, {firstName(user?.name)}!
              </h2>
              <span className="inline-flex items-center rounded-full bg-[#A7D344]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4d6b12] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">
                New hire
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              We're glad you're here. Here's what to get done first.
            </p>

            {user?.manager_name ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <IconUser className="h-3.5 w-3.5 text-[#0B3EAF] dark:text-[#A7D344]" />
                Reports to {user.manager_name}
              </div>
            ) : null}
          </div>
        </div>

        {totalItems > 0 && !loading ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span>Onboarding progress</span>
              <span>{completedItems}/{totalItems} complete</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={progressPct} />
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Essential training column */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <IconClipboard className="h-3.5 w-3.5" aria-hidden />
              Essential training
            </h3>

            {/* Bounded + scrollable: the number of assigned trainings varies per
                department/employee, so this keeps the column height in line with
                the Helpful links column instead of stretching the card unevenly. */}
            <div className="relative">
            <div
              ref={trainingScrollRef}
              onScroll={checkTrainingOverflow}
              className="max-h-[300px] space-y-0 overflow-y-auto pr-1 -mr-1"
            >

            {EXTERNAL_TRAININGS.length > 0 && (
              <>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Cybersecurity training
                </p>
                <ul className="mb-3 space-y-2">
                {EXTERNAL_TRAININGS.map((t) => (
                  <li key={t.key}>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200"
                    >
                      <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{t.title}</span>
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            {t.provider}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                          {t.note}
                        </span>
                      </span>
                      <IconChevron className="mt-0.5 h-3 w-3 shrink-0 -rotate-90 text-slate-400" aria-hidden />
                    </a>
                  </li>
                ))}
                </ul>
              </>
            )}

            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Department training
            </p>

            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : !hasPending && totalItems === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nothing assigned yet — check back soon.
              </p>
            ) : !hasPending ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-400">
                <IconCheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                All training complete — great work!
              </div>
            ) : (
              <ul className="space-y-2">
                {pendingCourses.map((a) => (
                  <li key={`c-${a.id}`}>
                    <Link
                      to={`/course/${a.course_id}`}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200"
                    >
                      <IconChart className="h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{a.course_title || "Untitled course"}</span>
                      <IconChevron className="h-3 w-3 shrink-0 -rotate-90 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                ))}
                {pendingDocs.map((d) => (
                  <li key={`d-${d.id}`}>
                    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/30">
                      <IconDocument className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {d.title}
                          </span>
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            doc
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          {d.file_url && (
                            <a
                              href={d.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-[#0B3EAF] underline decoration-[#A7D344] underline-offset-2 dark:text-[#A7D344]"
                            >
                              Open
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={completing === d.document_id}
                            onClick={() => markDocDone(d.document_id)}
                            className="rounded-full border border-[#0B3EAF]/30 px-2 py-0.5 text-[10px] font-bold text-[#0B3EAF] hover:bg-[#0B3EAF]/10 disabled:opacity-50 dark:border-[#A7D344]/40 dark:text-[#A7D344] dark:hover:bg-[#A7D344]/10"
                          >
                            {completing === d.document_id ? "Saving…" : "Mark done"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            </div>

            {hasMoreTraining && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center rounded-b-lg bg-gradient-to-t from-white via-white/85 to-transparent pb-1 dark:from-slate-900 dark:via-slate-900/80">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Scroll for more ↓
                </span>
              </div>
            )}
            </div>
          </div>

          {/* Helpful links column */}
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Helpful links
            </h3>
            <ul className="space-y-2">
              {ESSENTIAL_LINKS.map(({ to, icon: Icon, label, desc }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block">{label}</span>
                      <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">{desc}</span>
                    </span>
                    <IconChevron className="mt-0.5 h-3 w-3 shrink-0 -rotate-90 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-700/60">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Save these essential links — this card will disappear in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            onClick={handleSaveForLater}
            className="btn-outline gap-1.5 !px-3 !py-1.5 !text-xs"
          >
            <IconDownload className="h-3.5 w-3.5" aria-hidden />
            Save for later
          </button>
        </div>
      </div>
    </div>
  );
}
