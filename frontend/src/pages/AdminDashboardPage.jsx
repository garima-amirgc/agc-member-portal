import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { uploadLessonVideo, uploadResourceDocumentFile } from "../services/directUpload";
import { PAGE_SHELL } from "../constants/pageLayout";
import ResourceDocumentGridCard from "../components/resources/ResourceDocumentGridCard";
import { CATEGORIES } from "../utils/resourcesContent";
import { DEPARTMENTS } from "../constants/departments";

const EMPTY_COURSE = { title: "", description: "", business_unit: "AGC", resource_category: "", department: "" };
const EMPTY_DOC = { business_unit: "AGC", category: "finance", title: "" };
const EMPTY_REPORT = { business_unit: "AGC", title: "", link_url: "", description: "" };

export default function AdminDashboardPage() {
  const [active, setActive] = useState("videos");
  const [courses, setCourses] = useState([]);
  const [resourceDocuments, setResourceDocuments] = useState([]);
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const createCourseVideoRef = useRef(null);
  const [courseEdit, setCourseEdit] = useState(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [uploadingCourseId, setUploadingCourseId] = useState(null);
  const [docForm, setDocForm] = useState(EMPTY_DOC);
  const docFileRef = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docEdit, setDocEdit] = useState(null);
  const docEditFileRef = useRef(null);
  const [savingDocEdit, setSavingDocEdit] = useState(false);
  const [resourceReports, setResourceReports] = useState([]);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [savingReport, setSavingReport] = useState(false);
  const [reportEdit, setReportEdit] = useState(null);
  const [savingReportEdit, setSavingReportEdit] = useState(false);

  const load = () => {
    api.get("/courses").then((r) => setCourses(r.data));
  };

  const loadResourceDocuments = useCallback(() => {
    api
      .get("/resources/documents")
      .then((r) => setResourceDocuments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setResourceDocuments([]));
  }, []);

  const loadResourceReports = useCallback(() => {
    api
      .get("/resources/reports")
      .then((r) => setResourceReports(Array.isArray(r.data) ? r.data : []))
      .catch(() => setResourceReports([]));
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (active === "documents") loadResourceDocuments();
    if (active === "reports") loadResourceReports();
  }, [active, loadResourceDocuments, loadResourceReports]);

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
  const startEditCourse = (c) => {
    setCourseEdit({
      id: c.id,
      title: c.title || "",
      description: c.description ?? "",
      business_unit: c.business_unit,
      resource_category: c.resource_category || "",
      department: c.department || "",
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
        department: courseEdit.department?.trim() || null,
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
      const upload = await uploadLessonVideo(file);
      const videoUrl = upload?.video_url;
      if (!videoUrl) {
        throw new Error("Upload finished but no video URL was returned.");
      }
      await api.post("/lessons", {
        course_id: Number(courseId),
        title: file.name.replace(/\.[^/.]+$/, ""),
        video_url: videoUrl,
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
        `Delete "${c.title}"? This removes its video files (where stored) and lessons.`
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
      const upload = await uploadResourceDocumentFile(file);
      const fileUrl = upload?.file_url;
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
      if (docEdit?.id === doc.id) setDocEdit(null);
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

  const startEditDocument = (doc) => {
    setDocEdit({
      id: doc.id,
      title: doc.title || "",
      business_unit: doc.business_unit,
      category: doc.category,
      file_url: doc.file_url,
    });
    if (docEditFileRef.current) docEditFileRef.current.value = "";
  };

  const saveDocumentEdit = async (e) => {
    e.preventDefault();
    if (!docEdit) return;
    if (!String(docEdit.title || "").trim()) {
      window.alert("Please enter a document title.");
      return;
    }
    setSavingDocEdit(true);
    try {
      let fileUrl = docEdit.file_url;
      const replacement = docEditFileRef.current?.files?.[0];
      if (replacement) {
        const upload = await uploadResourceDocumentFile(replacement);
        const nextUrl = upload?.file_url;
        if (!nextUrl) throw new Error("Upload finished but no file URL was returned.");
        fileUrl = nextUrl;
      }
      await api.put(`/resources/documents/${docEdit.id}`, {
        business_unit: docEdit.business_unit,
        category: docEdit.category,
        title: docEdit.title.trim(),
        file_url: fileUrl,
      });
      setDocEdit(null);
      if (docEditFileRef.current) docEditFileRef.current.value = "";
      loadResourceDocuments();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        "Could not update document.";
      window.alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSavingDocEdit(false);
    }
  };

  const createReportLink = async (e) => {
    e.preventDefault();
    if (!String(reportForm.title || "").trim()) {
      window.alert("Please enter a report name.");
      return;
    }
    if (!String(reportForm.link_url || "").trim()) {
      window.alert("Please enter a dashboard link.");
      return;
    }
    setSavingReport(true);
    try {
      await api.post("/resources/reports", {
        business_unit: reportForm.business_unit,
        title: reportForm.title.trim(),
        link_url: reportForm.link_url.trim(),
        description: reportForm.description?.trim() || "",
      });
      setReportForm(EMPTY_REPORT);
      loadResourceReports();
    } catch (err) {
      window.alert(
        err.response?.data?.message || err.message || "Could not save report link."
      );
    } finally {
      setSavingReport(false);
    }
  };

  const startEditReport = (row) => {
    setReportEdit({
      id: row.id,
      business_unit: row.business_unit,
      title: row.title || "",
      link_url: row.link_url || "",
      description: row.description || "",
    });
  };

  const saveReportEdit = async (e) => {
    e.preventDefault();
    if (!reportEdit) return;
    setSavingReportEdit(true);
    try {
      await api.put(`/resources/reports/${reportEdit.id}`, {
        business_unit: reportEdit.business_unit,
        title: reportEdit.title.trim(),
        link_url: reportEdit.link_url.trim(),
        description: reportEdit.description?.trim() || "",
      });
      setReportEdit(null);
      loadResourceReports();
    } catch (err) {
      window.alert(
        err.response?.data?.message || err.message || "Could not update report link."
      );
    } finally {
      setSavingReportEdit(false);
    }
  };

  const deleteReportLink = async (row) => {
    if (!window.confirm(`Delete report link "${row.title}"?`)) return;
    try {
      await api.delete(`/resources/reports/${row.id}`);
      if (reportEdit?.id === row.id) setReportEdit(null);
      loadResourceReports();
    } catch (err) {
      window.alert(
        err.response?.data?.message || err.message || "Could not delete report link."
      );
    }
  };

  const nav = [
    { id: "videos", label: "Videos" },
    { id: "documents", label: "Documents" },
    { id: "reports", label: "IT report links" },
  ];

  return (
    <main className={PAGE_SHELL}>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#000000] dark:text-white">Learning admin</h1>
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
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Department (leave blank to show to all departments)
                    </label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={courseForm.department || ""}
                      onChange={(e) => setCourseForm({ ...courseForm, department: e.target.value })}
                    >
                      <option value="">All departments</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
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
                      <option value="">Not listed in Resources</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label} · Videos on {courseForm.business_unit} Resources page
                        </option>
                      ))}
                    </select>
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
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={creatingCourse}>
                    {creatingCourse ? "Saving…" : "Save video"}
                  </button>
                </form>
              </section>

              <section className="card flex max-h-[calc(100svh-10rem)] flex-col">
                <h2 className="mb-3 text-lg font-semibold">Uploaded videos</h2>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
                                Department
                              </label>
                              <select
                                className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                value={courseEdit.department || ""}
                                onChange={(e) => setCourseEdit({ ...courseEdit, department: e.target.value })}
                                disabled={savingCourse}
                              >
                                <option value="">All departments</option>
                                {DEPARTMENTS.map((d) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
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
                                {c.department ? (
                                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                    {c.department}
                                  </div>
                                ) : null}
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
                            No lessons yet.
                          </p>
                        )}
                        {Array.isArray(c.lessons) &&
                        c.lessons.length > 0 &&
                        !(c.resource_category || "").trim() &&
                        courseEdit?.id !== c.id ? (
                          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                            Not listed under Resources Videos yet.
                          </p>
                        ) : null}
                        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-600">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Add another lesson (video)
                          </label>
                          {uploadingCourseId === c.id ? (
                            <p className="mt-2 text-xs font-medium text-brand-blue dark:text-brand-green">
                              Uploading…
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
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={uploadingDoc}>
                    {uploadingDoc ? "Uploading…" : "Upload document"}
                  </button>
                </form>
              </section>

              <section className="card flex max-h-[calc(100svh-10rem)] flex-col">
                <h2 className="mb-3 text-lg font-semibold">Uploaded documents</h2>
                <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
                  {resourceDocuments.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No documents yet.</div>
                  ) : (
                    resourceDocuments.map((d) => {
                      const catLabel = CATEGORIES.find((c) => c.key === d.category)?.label || d.category;
                      const metaLine = `${d.business_unit} · ${catLabel} · Documents`;
                      const docTo = `/facilities/${d.business_unit}/resources/${d.category}/document/${d.id}`;
                      let addedLabel = null;
                      const docDate = d.added_at ?? d.created_at;
                      if (docDate) {
                        try {
                          const dt = new Date(docDate);
                          if (!Number.isNaN(dt.getTime())) {
                            addedLabel = dt.toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            });
                          }
                        } catch {
                        }
                      }
                      return (
                        <div key={d.id}>
                          {docEdit?.id === d.id ? (
                            <div className="rounded-xl border p-3 dark:border-slate-700">
                              <form className="agc-form space-y-2" onSubmit={saveDocumentEdit}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    Edit document
                                  </span>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-brand-blue underline dark:text-brand-green"
                                    onClick={() => setDocEdit(null)}
                                    disabled={savingDocEdit}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                    Facility
                                  </label>
                                  <select
                                    className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                    value={docEdit.business_unit}
                                    onChange={(e) =>
                                      setDocEdit({ ...docEdit, business_unit: e.target.value })
                                    }
                                    disabled={savingDocEdit}
                                  >
                                    <option value="AGC">AGC</option>
                                    <option value="AQM">AQM</option>
                                    <option value="SCF">SCF</option>
                                    <option value="ASP">ASP</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                    Resources category (Documents)
                                  </label>
                                  <select
                                    className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                    value={docEdit.category}
                                    onChange={(e) => setDocEdit({ ...docEdit, category: e.target.value })}
                                    disabled={savingDocEdit}
                                  >
                                    {CATEGORIES.map((cat) => (
                                      <option key={cat.key} value={cat.key}>
                                        {cat.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <input
                                  className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                  placeholder="Document title"
                                  value={docEdit.title}
                                  onChange={(e) => setDocEdit({ ...docEdit, title: e.target.value })}
                                  disabled={savingDocEdit}
                                />
                                <div>
                                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                    Replace file (optional)
                                  </label>
                                  <input
                                    ref={docEditFileRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,application/pdf"
                                    disabled={savingDocEdit}
                                    className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-brand-blue-soft file:px-2 file:py-1 file:text-xs file:font-semibold dark:file:bg-white/10"
                                  />
                                </div>
                                <button type="submit" className="btn-primary w-full" disabled={savingDocEdit}>
                                  {savingDocEdit ? "Saving…" : "Save changes"}
                                </button>
                              </form>
                            </div>
                          ) : (
                            <ResourceDocumentGridCard
                              title={d.title}
                              url={d.file_url}
                              metaLine={metaLine}
                              addedLabel={addedLabel}
                              linkTo={docTo}
                              openButtonLabel="Open document"
                              compactPreview
                              tailHint="Click title or preview to open. Delete removes the file from storage."
                              rightSlot={
                                <>
                                  <button
                                    type="button"
                                    className="btn-outline px-3 py-1.5 text-xs"
                                    onClick={() => startEditDocument(d)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-danger px-3 py-1.5 text-xs"
                                    onClick={() => deleteResourceDocument(d)}
                                  >
                                    Delete
                                  </button>
                                </>
                              }
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}

          {active === "reports" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="mb-1 text-lg font-semibold">Add IT report link</h2>
                <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                  Appears under University → IT → Reports when at least one link exists for that facility.
                </p>
                <form className="agc-form space-y-3" onSubmit={createReportLink}>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Facility</label>
                    <select
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={reportForm.business_unit}
                      onChange={(e) => setReportForm({ ...reportForm, business_unit: e.target.value })}
                      disabled={savingReport}
                    >
                      <option value="AGC">AGC</option>
                      <option value="AQM">AQM</option>
                      <option value="SCF">SCF</option>
                      <option value="ASP">ASP</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Report / dashboard name
                    </label>
                    <input
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      placeholder="e.g. IT ticket metrics"
                      value={reportForm.title}
                      onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                      disabled={savingReport}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Dashboard link (URL)
                    </label>
                    <input
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      type="url"
                      placeholder="https://..."
                      value={reportForm.link_url}
                      onChange={(e) => setReportForm({ ...reportForm, link_url: e.target.value })}
                      disabled={savingReport}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Short description (optional)
                    </label>
                    <textarea
                      className="min-h-[80px] w-full rounded border p-2 dark:bg-slate-700"
                      placeholder="What this dashboard shows…"
                      value={reportForm.description}
                      onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                      disabled={savingReport}
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={savingReport}>
                    {savingReport ? "Saving…" : "Add report link"}
                  </button>
                </form>
              </section>

              <section className="card flex max-h-[calc(100svh-10rem)] flex-col">
                <h2 className="mb-3 text-lg font-semibold">IT report links</h2>
                <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
                  {resourceReports.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No report links yet.</div>
                  ) : (
                    resourceReports.map((r) => (
                      <div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        {reportEdit?.id === r.id ? (
                          <form className="agc-form space-y-2" onSubmit={saveReportEdit}>
                            <select
                              className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                              value={reportEdit.business_unit}
                              onChange={(e) =>
                                setReportEdit({ ...reportEdit, business_unit: e.target.value })
                              }
                              disabled={savingReportEdit}
                            >
                              <option value="AGC">AGC</option>
                              <option value="AQM">AQM</option>
                              <option value="SCF">SCF</option>
                              <option value="ASP">ASP</option>
                            </select>
                            <input
                              className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                              placeholder="Report name"
                              value={reportEdit.title}
                              onChange={(e) => setReportEdit({ ...reportEdit, title: e.target.value })}
                              disabled={savingReportEdit}
                            />
                            <input
                              className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                              type="url"
                              placeholder="https://..."
                              value={reportEdit.link_url}
                              onChange={(e) => setReportEdit({ ...reportEdit, link_url: e.target.value })}
                              disabled={savingReportEdit}
                            />
                            <textarea
                              className="min-h-[72px] w-full rounded border p-2 text-sm dark:bg-slate-700"
                              placeholder="Description"
                              value={reportEdit.description}
                              onChange={(e) =>
                                setReportEdit({ ...reportEdit, description: e.target.value })
                              }
                              disabled={savingReportEdit}
                            />
                            <div className="flex gap-2">
                              <button type="submit" className="btn-primary flex-1" disabled={savingReportEdit}>
                                {savingReportEdit ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => setReportEdit(null)}
                                disabled={savingReportEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {r.business_unit} · IT · Reports
                            </div>
                            <div className="mt-1 text-base font-bold text-brand-blue dark:text-brand-green">
                              {r.title}
                            </div>
                            {r.description ? (
                              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{r.description}</p>
                            ) : null}
                            <a
                              href={r.link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 block truncate text-xs text-brand-blue underline dark:text-brand-green"
                            >
                              {r.link_url}
                            </a>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-outline px-3 py-1.5 text-xs"
                                onClick={() => startEditReport(r)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-danger px-3 py-1.5 text-xs"
                                onClick={() => deleteReportLink(r)}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
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
