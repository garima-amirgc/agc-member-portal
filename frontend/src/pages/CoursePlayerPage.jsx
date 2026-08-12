import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { dispatchTrainingComplete, dispatchTrainingProgressUpdated } from "../utils/trainingProgressEvents";
import { PAGE_PADDING } from "../constants/pageLayout";

export default function CoursePlayerPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const assignmentId = search.get("assignment");
  const [course, setCourse] = useState(null);
  const [courseError, setCourseError] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [completedLessonIds, setCompletedLessonIds] = useState(new Set());
  const [marking, setMarking] = useState(false);
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState("progress");

  useEffect(() => {
    setCourse(null);
    setCourseError(null);
    setCompletedLessonIds(new Set());
    const query = assignmentId ? `?assignment=${assignmentId}` : "";
    api
      .get(`/courses/${id}${query}`)
      .then((res) => {
        setCourse(res.data);
        setCurrentLesson(res.data.lessons[0] || null);
        setCompletedLessonIds(new Set(res.data.completed_lesson_ids || []));
      })
      .catch((err) => {
        const status = err?.response?.status;
        setCourseError(
          status === 403
            ? "You don't have access to this course. If you believe this is a mistake, contact your manager or IT support."
            : status === 404
            ? "This course could not be found. It may have been removed or reassigned."
            : "Something went wrong loading this course. Please try again in a moment."
        );
      });
  }, [id]);

  const orderedLessons = useMemo(
    () => [...(course?.lessons || [])].sort((a, b) => a.order_index - b.order_index),
    [course]
  );

  const currentLessonDone = currentLesson ? completedLessonIds.has(currentLesson.id) : false;

  const markComplete = async () => {
    if (!assignmentId || !currentLesson || currentLessonDone || marking) return;
    setMarking(true);
    try {
      const { data } = await api.post(`/assignments/${assignmentId}/progress`, {
        lesson_id: currentLesson.id,
        completed: true,
      });
      // Update immediately rather than waiting on a refetch, so the button
      // flips to "Completed" as soon as the save succeeds.
      setCompletedLessonIds((prev) => new Set(prev).add(currentLesson.id));
      setToast(data.message);
      setToastKind(data.all_training_just_notified ? "all_complete" : "progress");
      dispatchTrainingProgressUpdated();
      if (data.all_training_just_notified) {
        dispatchTrainingComplete();
      }
      setTimeout(() => {
        setToast("");
        setToastKind("progress");
      }, data.all_training_just_notified ? 6000 : 3000);
    } finally {
      setMarking(false);
    }
  };

  if (courseError) {
    return (
      <div className={PAGE_PADDING}>
        <div className="card max-w-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300">
          {courseError}
        </div>
      </div>
    );
  }

  if (!course) {
    return <div className={PAGE_PADDING}>Loading course…</div>;
  }

  return (
    <main
      className={`${PAGE_PADDING} grid w-full min-w-0 gap-4 md:grid-cols-[2fr,1fr]`}
    >
      <section className="card">
        <h1 className="mb-4 text-2xl font-bold">{course.title}</h1>
        {toast && (
          <div
            className={`mb-3 rounded p-2 ${
              toastKind === "all_complete"
                ? "border border-emerald-400 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {toast}
          </div>
        )}
        {currentLesson ? (
          <>
            <video
              className="aspect-video w-full rounded-xl bg-black"
              controls
              src={
                /^https?:\/\//i.test(currentLesson.video_url)
                  ? currentLesson.video_url
                  : `${import.meta.env.VITE_API_URL || "http://localhost:5000"}${currentLesson.video_url.startsWith("/") ? "" : "/"}${currentLesson.video_url}`
              }
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{currentLesson.title}</h2>
              <button
                type="button"
                disabled={currentLessonDone || marking}
                className={
                  currentLessonDone
                    ? "shrink-0 cursor-default rounded-portal border-2 border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    : "btn-primary shrink-0 disabled:opacity-60"
                }
                onClick={markComplete}
              >
                {currentLessonDone ? "✓ Completed" : marking ? "Saving…" : "Mark as Completed"}
              </button>
            </div>
          </>
        ) : (
          <p>No lessons available.</p>
        )}
      </section>
      <aside className="card">
        <h3 className="mb-3 text-lg font-semibold">Lessons</h3>
        <div className="space-y-2">
          {orderedLessons.map((lesson) => {
            const done = completedLessonIds.has(lesson.id);
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setCurrentLesson(lesson)}
                className={`flex w-full items-center gap-2 rounded-portal border-2 p-3 text-left text-sm font-medium transition ${
                  currentLesson?.id === lesson.id
                    ? "border-[#082d82] bg-brand-blue text-white dark:border-[#a7d344]"
                    : "border-transparent bg-slate-100 hover:border-[rgba(11,62,175,0.25)] hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                }`}
              >
                <span className="min-w-0 flex-1">
                  {lesson.order_index}. {lesson.title}
                </span>
                {done && (
                  <span
                    className={`shrink-0 text-xs font-bold ${
                      currentLesson?.id === lesson.id ? "text-white" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                    title="Completed"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
