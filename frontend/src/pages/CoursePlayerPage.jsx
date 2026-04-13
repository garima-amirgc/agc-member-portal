import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { PAGE_PADDING } from "../constants/pageLayout";

export default function CoursePlayerPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const assignmentId = search.get("assignment");
  const [course, setCourse] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.get(`/courses/${id}`).then((res) => {
      setCourse(res.data);
      setCurrentLesson(res.data.lessons[0] || null);
    });
  }, [id]);

  const orderedLessons = useMemo(
    () => [...(course?.lessons || [])].sort((a, b) => a.order_index - b.order_index),
    [course]
  );

  const markComplete = async () => {
    if (!assignmentId || !currentLesson) return;
    const { data } = await api.post(`/assignments/${assignmentId}/progress`, {
      lesson_id: currentLesson.id,
      completed: true,
    });
    setToast(data.message);
    setTimeout(() => setToast(""), 3000);
  };

  if (!course) {
    return <div className={PAGE_PADDING}>Loading course…</div>;
  }

  return (
    <main
      className={`${PAGE_PADDING} grid w-full min-w-0 gap-4 lg:grid-cols-[2fr,1fr]`}
    >
      <section className="card">
        <h1 className="mb-4 text-2xl font-bold">{course.title}</h1>
        {toast && <div className="mb-3 rounded bg-emerald-100 p-2 text-emerald-700">{toast}</div>}
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
            <div className="mt-3 flex items-center justify-between">
              <h2 className="font-semibold">{currentLesson.title}</h2>
              <button type="button" className="btn-primary" onClick={markComplete}>
                Mark as Completed
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
          {orderedLessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => setCurrentLesson(lesson)}
              className={`w-full rounded-portal border-2 p-3 text-left text-sm font-medium transition ${
                currentLesson?.id === lesson.id
                  ? "border-[#082d82] bg-brand-blue text-white dark:border-[#a7d344]"
                  : "border-transparent bg-slate-100 hover:border-[rgba(11,62,175,0.25)] hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              }`}
            >
              {lesson.order_index}. {lesson.title}
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
