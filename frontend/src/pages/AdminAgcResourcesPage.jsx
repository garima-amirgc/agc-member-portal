import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import { PAGE_SHELL } from "../constants/pageLayout";
import { ADMIN_FIELD_INPUT, ADMIN_FIELD_LABEL } from "../constants/adminFormStyles";
import api from "../services/api";
import { uploadResourceDocumentFile } from "../services/directUpload";

const EMPTY_FORM = { title: "" };

function fileExtLabel(url) {
  if (!url) return "FILE";
  const p = String(url).split("?")[0].toLowerCase();
  const m = p.match(/\.([a-z0-9]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}

function ExtBadge({ url }) {
  const ext = fileExtLabel(url);
  const colors = {
    PDF:  "bg-red-100 text-red-700",
    PPT:  "bg-slate-100 text-slate-700",
    PPTX: "bg-slate-100 text-slate-700",
    DOC:  "bg-blue-100 text-blue-700",
    DOCX: "bg-blue-100 text-blue-700",
    XLS:  "bg-green-100 text-green-700",
    XLSX: "bg-green-100 text-green-700",
  };
  const cls = colors[ext] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {ext}
    </span>
  );
}

export default function AdminAgcResourcesPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    api
      .get("/resources/documents")
      .then((r) => {
        const all = Array.isArray(r.data) ? r.data : [];
        setDocs(all.filter((d) => String(d.business_unit || "").toUpperCase() === "AGC"));
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(""); }
    else { setSuccess(msg); setError(""); }
    setTimeout(() => { setError(""); setSuccess(""); }, 4000);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return flash("Please select a file.", true);
    if (!form.title.trim()) return flash("Please enter a title.", true);

    setUploading(true);
    try {
      const upload = await uploadResourceDocumentFile(file);
      const fileUrl = upload?.file_url;
      if (!fileUrl) throw new Error("Upload finished but no file URL returned.");
      await api.post("/resources/documents", {
        business_unit: "AGC",
        category: "general",
        title: form.title.trim(),
        file_url: fileUrl,
      });
      setForm(EMPTY_FORM);
      if (fileRef.current) fileRef.current.value = "";
      flash("Resource added.");
      load();
    } catch (err) {
      flash(err.response?.data?.message || err.message || "Upload failed.", true);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This removes it from storage and the portal.`)) return;
    try {
      await api.delete(`/resources/documents/${doc.id}`);
      load();
    } catch (err) {
      flash(err.response?.data?.message || err.message || "Could not delete.", true);
    }
  };

  const handleRename = async (doc) => {
    const trimmed = editTitle.trim();
    if (!trimmed) return flash("Title cannot be empty.", true);
    try {
      await api.put(`/resources/documents/${doc.id}`, {
        business_unit: doc.business_unit,
        category: doc.category,
        title: trimmed,
        file_url: doc.file_url,
      });
      setEditId(null);
      load();
    } catch (err) {
      flash(err.response?.data?.message || err.message || "Could not rename.", true);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <DashboardAssignmentNotice />
      <PageHeader title="AGC Resources" subtitle="Upload and manage files shown on the AGC hub page." />

      {/* Upload form */}
      <div className="card mb-6 rounded-2xl">
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Add resource</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className={ADMIN_FIELD_LABEL}>Title</label>
            <input
              className={ADMIN_FIELD_INPUT}
              placeholder="e.g. PPT Template, Email Signatures…"
              value={form.title}
              onChange={(e) => setForm({ title: e.target.value })}
            />
          </div>
          <div>
            <label className={ADMIN_FIELD_LABEL}>File</label>
            <input
              ref={fileRef}
              type="file"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-[#0B3EAF] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-[#082d82] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-[#0B3EAF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#082d82] disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      {/* Existing docs */}
      <div className="card rounded-2xl">
        <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">
          Current resources{" "}
          {!loading && <span className="text-sm font-normal text-slate-500">({docs.length})</span>}
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">No resources yet. Upload one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3">
                <ExtBadge url={doc.file_url} />

                {editId === doc.id ? (
                  <input
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(doc);
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                ) : (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-sm font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
                  >
                    {doc.title}
                  </a>
                )}

                <div className="flex shrink-0 items-center gap-2">
                  {editId === doc.id ? (
                    <>
                      <button
                        onClick={() => handleRename(doc)}
                        className="rounded bg-[#0B3EAF] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#082d82]"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditId(doc.id); setEditTitle(doc.title); }}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
