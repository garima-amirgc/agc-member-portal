import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export default function RequiredTrainingChecklist({ user }) {
  const [courses, setCourses] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(null); // documentId being marked complete
  const [flash, setFlash] = useState({ msg: "", err: false });

  const showFlash = (msg, err = false) => {
    setFlash({ msg, err });
    setTimeout(() => setFlash({ msg: "", err: false }), 4000);
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const r = await api.get("/training/me");
      setCourses(Array.isArray(r.data?.courses) ? r.data.courses : []);
      setDocuments(Array.isArray(r.data?.documents) ? r.data.documents : []);
    } catch {
      setCourses([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const markDocComplete = async (docId) => {
    if (!user?.id) return;
    setCompleting(docId);
    try {
      const r = await api.put(`/training/users/${user.id}/document/${docId}/complete`);
      await load();
      if (r.data?.all_training_complete) {
        window.dispatchEvent(new CustomEvent("agc-training-complete"));
      }
      showFlash("Marked as complete!");
    } catch (err) {
      showFlash(err.response?.data?.message || "Could not mark complete.", true);
    } finally {
      setCompleting(null);
    }
  };

  if (loading) return null;

  const total = courses.length + documents.length;
  if (total === 0) return null;

  const completedCount =
    courses.filter((c) => c.status === "completed").length +
    documents.filter((d) => d.status === "completed").length;

  const allDone = completedCount === total;

  return (
    <div className="rounded-portal border border-blue-200/70 bg-blue-50/60 p-4 dark:border-blue-800/40 dark:bg-blue-950/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100">Required Training</h3>
          <p className="mt-0.5 text-xs text-blue-700/80 dark:text-blue-300/80">
            {allDone
              ? "All training complete — great work!"
              : `${completedCount} of ${total} item${total === 1 ? "" : "s"} complete`}
          </p>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-blue-200/60 dark:bg-blue-800/40">
          <div
            className="h-full rounded-full bg-blue-500 transition-all dark:bg-blue-400"
            style={{ width: total === 0 ? "0%" : `${Math.round((completedCount / total) * 100)}%` }}
          />
        </div>
      </div>

      {flash.msg && (
        <p className={`mb-3 rounded p-2 text-xs font-medium ${flash.err ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300"}`}>
          {flash.msg}
        </p>
      )}

      <div className="space-y-2">
        {courses.map((c) => {
          const done = c.status === "completed";
          return (
            <div
              key={`course-${c.id}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                done
                  ? "border-green-200 bg-green-50/80 dark:border-green-800/40 dark:bg-green-950/20"
                  : "border-blue-100 bg-white dark:border-blue-900/30 dark:bg-slate-900/60"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    done
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-blue-300 dark:border-blue-600"
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <span className="mr-1.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    Video
                  </span>
                  <span className={`text-xs font-medium ${done ? "text-green-800 line-through opacity-60 dark:text-green-200" : "text-slate-800 dark:text-slate-100"}`}>
                    {c.title}
                  </span>
                </div>
              </div>
              {!done && (
                <Link
                  to={`/course/${c.course_id}`}
                  className="shrink-0 text-xs font-semibold text-brand-blue underline dark:text-brand-green"
                >
                  Start →
                </Link>
              )}
            </div>
          );
        })}

        {documents.map((d) => {
          const done = d.status === "completed";
          return (
            <div
              key={`doc-${d.id}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                done
                  ? "border-green-200 bg-green-50/80 dark:border-green-800/40 dark:bg-green-950/20"
                  : "border-blue-100 bg-white dark:border-blue-900/30 dark:bg-slate-900/60"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    done
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-blue-300 dark:border-blue-600"
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Doc
                  </span>
                  <span className={`text-xs font-medium ${done ? "text-green-800 line-through opacity-60 dark:text-green-200" : "text-slate-800 dark:text-slate-100"}`}>
                    {d.title}
                  </span>
                  {d.facility && (
                    <span className="ml-1 text-[10px] text-slate-400">{d.facility}</span>
                  )}
                </div>
              </div>
              {!done ? (
                <div className="flex shrink-0 items-center gap-2">
                  {d.file_url && (
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-brand-blue underline dark:text-brand-green"
                    >
                      Open
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={completing === d.document_id}
                    onClick={() => markDocComplete(d.document_id)}
                    className="rounded border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  >
                    {completing === d.document_id ? "Saving…" : "Mark done"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
