import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import ResourceDocumentGridCard from "../components/resources/ResourceDocumentGridCard";
import { CATEGORIES } from "../utils/resourcesContent";

const EMPTY_COURSE = { title: "", description: "", business_unit: "AGC", resource_category: "" };
const EMPTY_ASSIGN = { user_id: "", course_id: "" };
const EMPTY_DOC = { business_unit: "AGC", category: "finance", title: "" };

/** Large video uploads exceed the default axios 15s timeout. */
const UPLOAD_TIMEOUT_MS = 45 * 60 * 1000;

/** Videos, documents & assignments. Users → /users. Upcoming → /upcoming. */
export default function AdminDashboardPage() {
  const [active, setActive] = useState("videos"); // videos | documents | assignments
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [resourceDocuments, setResourceDocuments] = useState([]);
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const createCourseVideoRef = useRef(null);
  /** Inline edit: one course at a time */
  const [courseEdit, setCourseEdit] = useState(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [uploadingCourseId, setUploadingCourseId] = useState(null);
  const [docForm, setDocForm] = useState(EMPTY_DOC);
  const docFileRef = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/courses").then((r) => setCourses(r.data));
    api.get("/assignments").then((r) => setAssignments(r.data));
  };

  const loadResourceDocuments = useCallback(() => {
    api
      .get("/resources/documents")
      .then((r) => setResourceDocuments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setResourceDocuments([]));
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (active === "documents") loadResourceDocuments();
  }, [active, loadResourceDocuments]);

  const createCourse = async (e) => {
    e.preventDefault();
    if (!String(courseForm.title || "").trim()) {
      window.alert("Please enter a course title.");
      return;
    }
    setCreatingCourse(true);
    try {
      const { data } = await api.post("/courses", {
        ...courseForm,
        resource_category: courseForm.resource_category?.trim() || null,
      });
      const courseId = data.id;
      const file = createCourseVideoRef.current?.files?.[0];
      if (file) await onVideoUpload(courseId, file, createCourseVideoRef.current);
      setCourseForm(EMPTY_COURSE);
      if (createCourseVideoRef.current) createCourseVideoRef.current.value = "";
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not save video.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      load();
      setCreatingCourse(false);
    }
  };
  const assignCourse = async (e) => {
    e.preventDefault();
    const user_id = Number.parseInt(String(assignForm.user_id || "").trim(), 10);
    const course_id = Number.parseInt(String(assignForm.course_id || "").trim(), 10);
    if (!Number.isFinite(user_id) || user_id < 1 || !Number.isFinite(course_id) || course_id < 1) {
      window.alert("Choose both a user and a course.");
      return;
    }
    try {
      await api.post("/assignments", { user_id, course_id });
      setAssignForm(EMPTY_ASSIGN);
      load();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not assign course.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const startEditCourse = (c) => {
    setCourseEdit({
      id: c.id,
      title: c.title || "",
      description: c.description ?? "",
      business_unit: c.business_unit,
      resource_category: c.resource_category || "",
    });
  };

  const saveCourseEdit = async (e) => {
    e.preventDefault();
    if (!courseEdit) return;
    if (!String(courseEdit.title || "").trim()) {
      window.alert("Please enter a course title.");
      return;
    }
    setSavingCourse(true);
    try {
      await api.put(`/courses/${courseEdit.id}`, {
        title: courseEdit.title.trim(),
        description: courseEdit.description ?? "",
        business_unit: courseEdit.business_unit,
        resource_category: courseEdit.resource_category?.trim() || null,
      });
      setCourseEdit(null);
      load();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not update course.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSavingCourse(false);
    }
  };

  const onVideoUpload = async (courseId, file, fileInputEl) => {
    setUploadingCourseId(Number(courseId));
    try {
      const fd = new FormData();
      fd.append("video", file);
      // Do not set Content-Type — axios/browser must add the multipart boundary or multer sees no file.
      const upload = await api.post("/upload", fd, { timeout: UPLOAD_TIMEOUT_MS });
      const videoUrl = upload.data?.video_url;
      if (!videoUrl) {
        throw new Error("Upload finished but no video URL was returned.");
      }
      const courseRes = await api.get(`/courses/${courseId}`, { timeout: 60000 });
      const lessons = courseRes.data?.lessons || [];
      await api.post("/lessons", {
        course_id: Number(courseId),
        title: file.name.replace(/\.[^/.]+$/, ""),
        video_url: videoUrl,
        order_index: lessons.length + 1,
      });
      load();
    } catch (err) {
      const data = err.response?.data;
      let msg =
        (typeof data?.message === "string" && data.message) ||
        (typeof data === "string" ? data : null) ||
        err.message ||
        "Upload failed.";
      if (err.code === "ECONNABORTED") {
        msg = "Upload timed out. Try a smaller file or check your connection (large files can take several minutes).";
      }
      window.alert(msg);
    } finally {
      setUploadingCourseId(null);
      if (fileInputEl) fileInputEl.value = "";
    }
  };

  const deleteCourse = async (c) => {
    if (
      !window.confirm(
        `Delete "${c.title}"? This removes its video files (where stored), lessons, and assignments.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/courses/${c.id}`);
      if (courseEdit?.id === c.id) setCourseEdit(null);
      load();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not delete course.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const uploadResourceDocument = async (e) => {
    e.preventDefault();
    const file = docFileRef.current?.files?.[0];
    if (!file) {
      window.alert("Please select a document file first.");
      return;
    }
    if (!String(docForm.title || "").trim()) {
      window.alert("Please enter a document title.");
      return;
    }
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const upload = await api.post("/upload/document", fd, { timeout: UPLOAD_TIMEOUT_MS });
      const fileUrl = upload.data?.file_url;
      if (!fileUrl) throw new Error("Upload finished but no file URL was returned.");
      await api.post("/resources/documents", {
        business_unit: docForm.business_unit,
        category: docForm.category,
        title: docForm.title.trim(),
        file_url: fileUrl,
      });
      setDocForm(EMPTY_DOC);
      if (docFileRef.current) docFileRef.current.value = "";
      loadResourceDocuments();
      window.alert("Document uploaded.");
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not upload document.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setUploadingDoc(false);
    }
  };

  const deleteResourceDocument = async (doc) => {
    if (!window.confirm(`Delete document "${doc.title}"? This removes the file from storage and the portal.`)) {
      return;
    }
    try {
      await api.delete(`/resources/documents/${doc.id}`);
      loadResourceDocuments();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not delete document.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const nav = [
    { id: "videos", label: "Videos" },
    { id: "documents", label: "Documents" },
    { id: "assignments", label: "Assignments" },
  ];

  return (
    <main className={PAGE_SHELL}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#000000] dark:text-white">Learning admin</h1>
        </div>
        <Link
          className="text-sm font-bold text-brand-blue underline underline-offset-2 hover:text-brand-blue-hover dark:text-brand-green"
          to="/upcoming"
        >
          Back to Upcoming
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="rounded-portal border border-stone-200/90 bg-brand-surface p-3 shadow-brand dark:border-stone-700 dark:bg-[#2a2520]">
          <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-brand-muted dark:text-stone-400">
            Sections
          </div>
          <div className="space-y-1">
            {nav.map((item) => {
              const selected = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={[
                    "group w-full border-l-4 py-2.5 pl-3 pr-3 text-left transition rounded-r-md",
                    selected
                      ? "border-brand-blue bg-brand-blue-soft font-bold text-brand-black shadow-brand dark:border-brand-blue/60 dark:bg-white/10 dark:text-white"
                      : "border-transparent text-brand-black hover:bg-white dark:text-stone-200 dark:hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">{item.label}</div>
                  {selected ? null : (
                    <div className="mt-2 h-1 w-8 rounded-full bg-brand-blue/0 transition-all group-hover:w-12 group-hover:bg-brand-blue/50" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0">
          {active === "videos" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Add video</h2>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                  Videos are stored on DigitalOcean and listed under{" "}
                  <strong className="font-semibold">Member Portal → (facility) → Resources → (category) → Videos</strong> when
                  you set “List under Resources” below. Assignments still use the same entry in the Assignments tab.
                </p>
                <form className="agc-form space-y-2" onSubmit={createCourse}>
                  <input
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    placeholder="Video / training name"
                    value={courseForm.title}
                    onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  />
                  <textarea
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    placeholder="Description (optional)"
                    value={courseForm.description}
                    onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Facility (where this video belongs)
                    </label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={courseForm.business_unit}
                      onChange={(e) => setCourseForm({ ...courseForm, business_unit: e.target.value })}
                    >
                      <option value="AGC">AGC</option>
                      <option value="AQM">AQM (e.g. Amir Quality Meats)</option>
                      <option value="SCF">SCF</option>
                      <option value="ASP">ASP</option>
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Used for Resources <strong className="font-semibold">Videos</strong>, facility tiles (when assigned),
                      and who may receive assignments — users need this facility on their profile in{" "}
                      <strong className="font-semibold">Users</strong>.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      List video under Resources (Videos section)
                    </label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={courseForm.resource_category || ""}
                      onChange={(e) => setCourseForm({ ...courseForm, resource_category: e.target.value })}
                    >
                      <option value="">Not listed — assignments only (no Resources video list)</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label} · Videos on {courseForm.business_unit} Resources page
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Example: Member Portal → {courseForm.business_unit} → Resources → Finance → <strong>Videos</strong>.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Video file (optional — add more after save)
                    </label>
                    <input
                      ref={createCourseVideoRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
                      disabled={creatingCourse}
                      className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-brand-blue-soft file:px-2 file:py-1 file:text-xs file:font-semibold dark:file:bg-white/10"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      mp4, webm, mov, mkv. Large uploads are allowed several minutes to finish. If you save without a file,
                      open the course in <strong className="font-semibold">Uploaded videos</strong> and choose a file under{" "}
                      <strong className="font-semibold">Add another lesson (video)</strong> — that uploads to Spaces and
                      creates the lesson.
                    </p>
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={creatingCourse}>
                    {creatingCourse ? "Saving…" : "Save video"}
                  </button>
                </form>
              </section>

              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Uploaded videos</h2>
                <div className="space-y-2">
                  {courses.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No videos yet.</div>
                  ) : (
                    courses.map((c) => (
                      <div key={c.id} className="rounded-xl border p-3 dark:border-slate-700">
                        {courseEdit?.id === c.id ? (
                          <form className="agc-form space-y-2" onSubmit={saveCourseEdit}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Edit video
                              </span>
                              <button
                                type="button"
                                className="text-xs font-semibold text-brand-blue underline dark:text-brand-green"
                                onClick={() => setCourseEdit(null)}
                                disabled={savingCourse}
                              >
                                Cancel
                              </button>
                            </div>
                            <input
                              className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                              placeholder="Title"
                              value={courseEdit.title}
                              onChange={(e) => setCourseEdit({ ...courseEdit, title: e.target.value })}
                              disabled={savingCourse}
                            />
                            <textarea
                              className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                              placeholder="Description"
                              rows={3}
                              value={courseEdit.description}
                              onChange={(e) => setCourseEdit({ ...courseEdit, description: e.target.value })}
                              disabled={savingCourse}
                            />
                            <div>
                              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                Facility
                              </label>
                              <select
                                className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                value={courseEdit.business_unit}
                                onChange={(e) => setCourseEdit({ ...courseEdit, business_unit: e.target.value })}
                                disabled={savingCourse}
                              >
                                <option value="AGC">AGC</option>
                                <option value="AQM">AQM (e.g. Amir Quality Meats)</option>
                                <option value="SCF">SCF</option>
                                <option value="ASP">ASP</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                List under Resources (Videos)
                              </label>
                              <select
                                className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                value={courseEdit.resource_category || ""}
                                onChange={(e) =>
                                  setCourseEdit({ ...courseEdit, resource_category: e.target.value })
                                }
                                disabled={savingCourse}
                              >
                                <option value="">Not listed</option>
                                {CATEGORIES.map((cat) => (
                                  <option key={cat.key} value={cat.key}>
                                    {cat.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button type="submit" className="btn-primary w-full" disabled={savingCourse}>
                              {savingCourse ? "Saving…" : "Save changes"}
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold">{c.title}</div>
                                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{c.description}</div>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {c.business_unit}
                                </div>
                                {c.resource_category ? (
                                  <div className="text-[10px] font-medium uppercase text-brand-blue dark:text-brand-green">
                                    Resources · Videos:{" "}
                                    {CATEGORIES.find((x) => x.key === c.resource_category)?.label ||
                                      c.resource_category}
                                  </div>
                                ) : null}
                                <div className="mt-1 flex flex-col gap-1">
                                  <button
                                    type="button"
                                    className="btn-outline px-2 py-1 text-xs"
                                    onClick={() => startEditCourse(c)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-danger px-2 py-1 text-xs"
                                    onClick={() => deleteCourse(c)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                        {Array.isArray(c.lessons) && c.lessons.length > 0 ? (
                          <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/80">
                            <li className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Saved lessons ({c.lessons.length})
                            </li>
                            {c.lessons.map((L) => (
                              <li
                                key={L.id}
                                className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-200"
                              >
                                <span className="min-w-0 truncate font-medium">{L.title}</span>
                                <Link
                                  to={`/course/${c.id}`}
                                  className="shrink-0 font-semibold text-brand-blue underline dark:text-brand-green"
                                >
                                  Open
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                            No lessons yet — choose a video file under <strong className="font-semibold">Add another lesson (video)</strong>{" "}
                            below (saving metadata alone does not upload a file).
                          </p>
                        )}
                        {Array.isArray(c.lessons) &&
                        c.lessons.length > 0 &&
                        !(c.resource_category || "").trim() &&
                        courseEdit?.id !== c.id ? (
                          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                            Not listed under Resources <strong className="font-semibold">Videos</strong> yet — open{" "}
                            <strong className="font-semibold">Edit</strong> and choose{" "}
                            <strong className="font-semibold">List under Resources (Videos)</strong>.
                          </p>
                        ) : null}
                        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-600">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Add another lesson (video)
                          </label>
                          {uploadingCourseId === c.id ? (
                            <p className="mt-2 text-xs font-medium text-brand-blue dark:text-brand-green">
                              Uploading… keep this page open.
                            </p>
                          ) : null}
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
                            className="mt-1 text-xs"
                            disabled={uploadingCourseId === c.id}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onVideoUpload(c.id, f, e.target);
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

            </div>
          )}

          {active === "documents" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Add document</h2>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                  Files are uploaded to the <strong className="font-semibold">same DigitalOcean Space</strong> as training
                  videos (under <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">docs/</code> keys), then
                  listed under{" "}
                  <strong className="font-semibold">Member Portal → (facility) → Resources → (category) → Documents</strong>
                  . Use the <strong className="font-semibold">Videos</strong> tab for video files only.
                </p>
                <form className="agc-form space-y-3" onSubmit={uploadResourceDocument}>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Facility</label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={docForm.business_unit}
                      onChange={(e) => setDocForm({ ...docForm, business_unit: e.target.value })}
                      disabled={uploadingDoc}
                    >
                      <option value="AGC">AGC</option>
                      <option value="AQM">AQM</option>
                      <option value="SCF">SCF</option>
                      <option value="ASP">ASP</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Resources category (Documents section)
                    </label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={docForm.category}
                      onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                      disabled={uploadingDoc}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Document title
                    </label>
                    <input
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      placeholder="e.g. Expense Policy (PDF)"
                      value={docForm.title}
                      onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                      disabled={uploadingDoc}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">File</label>
                    <input
                      ref={docFileRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,application/pdf"
                      disabled={uploadingDoc}
                      className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-brand-blue-soft file:px-2 file:py-1 file:text-xs file:font-semibold dark:file:bg-white/10"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      pdf, doc, docx, ppt, pptx, xls, xlsx, txt. Large files may take several minutes.
                    </p>
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={uploadingDoc}>
                    {uploadingDoc ? "Uploading…" : "Upload document"}
                  </button>
                </form>
              </section>

              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Uploaded documents</h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {resourceDocuments.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No documents yet.</div>
                  ) : (
                    resourceDocuments.map((d) => {
                      const catLabel = CATEGORIES.find((c) => c.key === d.category)?.label || d.category;
                      const metaLine = `${d.business_unit} · ${catLabel} · Documents`;
                      const docTo = `/facilities/${d.business_unit}/resources/${d.category}/document/${d.id}`;
                      return (
                        <ResourceDocumentGridCard
                          key={d.id}
                          title={d.title}
                          url={d.file_url}
                          metaLine={metaLine}
                          linkTo={docTo}
                          tailHint="Click title or preview to open. Delete removes the file from storage."
                          rightSlot={
                            <button
                              type="button"
                              className="btn-danger px-3 py-1.5 text-xs"
                              onClick={() => deleteResourceDocument(d)}
                            >
                              Delete
                            </button>
                          }
                        />
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}

          {active === "assignments" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Assign training</h2>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                  Pick a video training from the <strong className="font-semibold">Videos</strong> tab. The user must
                  have the <strong className="font-semibold">same facility</strong> (check{" "}
                  <strong className="font-semibold">Users</strong>) or assignment will be rejected.
                </p>
                <form className="agc-form space-y-2" onSubmit={assignCourse}>
                  <select
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    value={assignForm.user_id}
                    onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}
                  >
                    <option value="">Select User</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    value={assignForm.course_id}
                    onChange={(e) => setAssignForm({ ...assignForm, course_id: e.target.value })}
                  >
                    <option value="">Select video training</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} · {c.business_unit}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary w-full">
                    Assign
                  </button>
                </form>
              </section>

              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">All Assignments</h2>
                <div className="space-y-2">
                  {assignments.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No assignments yet.</div>
                  ) : (
                    assignments.map((a) => (
                      <div key={a.id} className="rounded-xl border p-3 text-sm dark:border-slate-700">
                        <div className="font-semibold">
                          {a.user_name} {"\u2192"} {a.course_title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {a.course_business_unit ? `${a.course_business_unit} · ` : ""}
                          {a.status} · {a.progress}%
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
