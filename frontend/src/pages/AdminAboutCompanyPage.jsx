import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import { PAGE_SHELL } from "../constants/pageLayout";
import { ADMIN_FIELD_INPUT, ADMIN_FIELD_LABEL } from "../constants/adminFormStyles";
import { COMPANY_CONTENT_ADMIN_SECTIONS } from "../constants/companyContentConfig";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { uploadResourceDocumentFile } from "../services/directUpload";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const AGC_RESOURCES_TAB = "agc_resources";

function fileExtLabel(url) {
  if (!url) return "FILE";
  const p = String(url).split("?")[0].toLowerCase();
  const m = p.match(/\.([a-z0-9]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}
function ExtBadge({ url }) {
  const ext = fileExtLabel(url);
  const colors = { PDF: "bg-red-100 text-red-700", PPT: "bg-slate-100 text-slate-700", PPTX: "bg-slate-100 text-slate-700", DOC: "bg-blue-100 text-blue-700", DOCX: "bg-blue-100 text-blue-700", XLS: "bg-green-100 text-green-700", XLSX: "bg-green-100 text-green-700" };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colors[ext] || "bg-slate-100 text-slate-600"}`}>{ext}</span>;
}

const fieldLabel = ADMIN_FIELD_LABEL;
const fieldInput = ADMIN_FIELD_INPUT;

function emptyForm(section) {
  return {
    section,
    title: "",
    description: "",
    link_url: "",
    file_url: "",
    published: true,
  };
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminAboutCompanyPage() {
  const [activeTab, setActiveTab] = useState(COMPANY_CONTENT_ADMIN_SECTIONS[0].key);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm(activeTab));
  const [editingId, setEditingId] = useState(null);
  const [aboutIntro, setAboutIntro] = useState("");
  const [introSaving, setIntroSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const fileRef = useRef(null);

  // ── AGC Resources tab state ──────────────────────────────
  const [agcDocs, setAgcDocs] = useState([]);
  const [agcDocsLoading, setAgcDocsLoading] = useState(false);
  const [agcFileTitle, setAgcFileTitle] = useState(""); // optional title for single-file upload
  const [agcUploading, setAgcUploading] = useState(false);
  const [agcUploadProgress, setAgcUploadProgress] = useState([]); // [{name, status}]
  const [agcEditId, setAgcEditId] = useState(null);
  const [agcEditTitle, setAgcEditTitle] = useState("");
  const [agcEditSaving, setAgcEditSaving] = useState(false);
  const [agcLinkForm, setAgcLinkForm] = useState({ title: "", url: "" });
  const [agcLinkMode, setAgcLinkMode] = useState(false); // toggle between file and link
  const [agcAddingLink, setAgcAddingLink] = useState(false);
  const agcFileRef = useRef(null);
  const agcEditFileRef = useRef(null); // file input in edit/replace mode

  const loadAgcDocs = useCallback(() => {
    setAgcDocsLoading(true);
    api.get("/resources/documents")
      .then((r) => setAgcDocs((Array.isArray(r.data) ? r.data : []).filter((d) => String(d.business_unit || "").toUpperCase() === "AGC")))
      .catch(() => setAgcDocs([]))
      .finally(() => setAgcDocsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === AGC_RESOURCES_TAB) loadAgcDocs();
  }, [activeTab, loadAgcDocs]);

  // Upload multiple files — each gets its own DB record, filename used as title
  const handleAgcUpload = async (e) => {
    e.preventDefault();
    const files = Array.from(agcFileRef.current?.files || []);
    if (!files.length) { setError("Please select at least one file."); return; }
    setAgcUploading(true); setError(""); setSuccess("");
    setAgcUploadProgress(files.map((f) => ({ name: f.name, status: "pending", error: "" })));
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setAgcUploadProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: "uploading", error: "" } : p));
      try {
        const upload = await uploadResourceDocumentFile(file);
        const fileUrl = upload?.file_url;
        if (!fileUrl) throw new Error("No URL returned from storage.");
        // single file + custom title entered → use it; multiple files → use filename
        const title = files.length === 1 && agcFileTitle.trim()
          ? agcFileTitle.trim()
          : file.name.replace(/\.[^/.]+$/, "");
        await api.post("/resources/documents", { business_unit: "AGC", category: "general", title, file_url: fileUrl });
        setAgcUploadProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: "done" } : p));
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Upload failed.";
        console.error(`AGC upload failed for ${file.name}:`, msg, err);
        setAgcUploadProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: "error", error: msg } : p));
        failed++;
      }
    }
    if (agcFileRef.current) agcFileRef.current.value = "";
    setAgcFileTitle("");
    setSuccess(failed === 0 ? `${files.length} file${files.length > 1 ? "s" : ""} uploaded.` : `${files.length - failed} uploaded, ${failed} failed.`);
    setAgcUploading(false);
    loadAgcDocs();
  };

  // Add a link (URL) as a resource
  const handleAgcAddLink = async (e) => {
    e.preventDefault();
    if (!agcLinkForm.title.trim()) { setError("Please enter a title."); return; }
    if (!agcLinkForm.url.trim()) { setError("Please enter a URL."); return; }
    setAgcAddingLink(true); setError(""); setSuccess("");
    try {
      await api.post("/resources/documents", { business_unit: "AGC", category: "general", title: agcLinkForm.title.trim(), file_url: agcLinkForm.url.trim() });
      setAgcLinkForm({ title: "", url: "" });
      setSuccess("Link added.");
      loadAgcDocs();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not add link.");
    } finally {
      setAgcAddingLink(false);
    }
  };

  const handleAgcDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await api.delete(`/resources/documents/${doc.id}`);
      loadAgcDocs();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not delete.");
    }
  };

  const handleAgcRename = async (doc) => {
    const trimmed = agcEditTitle.trim();
    if (!trimmed) { setError("Title cannot be empty."); return; }
    setAgcEditSaving(true); setError("");
    try {
      let fileUrl = doc.file_url;
      // If a replacement file was chosen, upload it first
      const newFile = agcEditFileRef.current?.files?.[0];
      if (newFile) {
        const upload = await uploadResourceDocumentFile(newFile);
        if (!upload?.file_url) throw new Error("File upload failed — no URL returned.");
        fileUrl = upload.file_url;
      }
      await api.put(`/resources/documents/${doc.id}`, {
        business_unit: doc.business_unit,
        category: doc.category,
        title: trimmed,
        file_url: fileUrl,
      });
      setAgcEditId(null);
      if (agcEditFileRef.current) agcEditFileRef.current.value = "";
      loadAgcDocs();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not save.");
    } finally {
      setAgcEditSaving(false);
    }
  };
  // ────────────────────────────────────────────────────────

  const tabMeta = useMemo(
    () => COMPANY_CONTENT_ADMIN_SECTIONS.find((s) => s.key === activeTab) || COMPANY_CONTENT_ADMIN_SECTIONS[0],
    [activeTab],
  );

  const sectionItems = useMemo(
    () => items.filter((item) => item.section === activeTab).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [items, activeTab],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/company-content/admin/items");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError(
          "About Company API was not found. Restart the backend server (node src/server.js) so the latest routes load, then refresh this page.",
        );
      } else {
        setError(friendlyErrorMessage(err, "Could not load items."));
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAboutIntro = useCallback(async () => {
    try {
      const { data } = await api.get("/company-content/admin/about-intro");
      setAboutIntro(String(data?.intro || ""));
    } catch {
      setAboutIntro("");
    }
  }, []);

  useEffect(() => {
    loadItems();
    loadAboutIntro();
  }, [loadItems, loadAboutIntro]);

  useEffect(() => {
    setForm(emptyForm(activeTab));
    setEditingId(null);
    setError("");
    setSuccess("");
  }, [activeTab]);

  const resetForm = () => {
    setForm(emptyForm(activeTab));
    setEditingId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const upload = await uploadResourceDocumentFile(file);
      setForm((prev) => ({ ...prev, file_url: upload?.file_url || "" }));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Upload failed."));
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (item) => {
    setEditingId(item.id);
    setForm({
      section: item.section,
      title: item.title || "",
      description: item.description || "",
      link_url: item.link_url || "",
      file_url: item.file_url || "",
      published: item.published !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        section: activeTab,
        title: form.title.trim(),
        description: form.description.trim(),
        link_url: tabMeta.showLink ? form.link_url.trim() : null,
        file_url: tabMeta.showFile ? form.file_url || null : null,
        published: form.published,
      };
      if (!payload.title) {
        setError("Title is required.");
        return;
      }
      if (editingId) {
        await api.put(`/company-content/admin/items/${editingId}`, payload);
        setSuccess("Item updated.");
      } else {
        await api.post("/company-content/admin/items", payload);
        setSuccess("Item added.");
      }
      resetForm();
      await loadItems();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save item."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    setError("");
    try {
      await api.delete(`/company-content/admin/items/${id}`);
      if (editingId === id) resetForm();
      await loadItems();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete item."));
    }
  };

  const onMove = async (id, direction) => {
    setError("");
    try {
      const { data } = await api.post(`/company-content/admin/items/${id}/move`, { direction });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not reorder item."));
    }
  };

  const onSaveIntro = async () => {
    setIntroSaving(true);
    setError("");
    try {
      const { data } = await api.put("/company-content/admin/about-intro", { intro: aboutIntro });
      setAboutIntro(String(data?.intro || ""));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save about text."));
    } finally {
      setIntroSaving(false);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="About Company"
        subtitle="Manage company policies, benefits, forms, portal links, and the about page."
      />
      <DashboardAssignmentNotice />

      {error ? <p className="mb-4 text-sm text-[#E02B20]">{error}</p> : null}
      {success ? <p className="mb-4 text-sm font-medium text-[#0B3EAF] dark:text-[#A7D344]">{success}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {COMPANY_CONTENT_ADMIN_SECTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              activeTab === tab.key
                ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0f0f0f]"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveTab(AGC_RESOURCES_TAB)}
          className={[
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            activeTab === AGC_RESOURCES_TAB
              ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0f0f0f]"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
          ].join(" ")}
        >
          AGC Resources
        </button>
      </div>

      {activeTab === AGC_RESOURCES_TAB ? (
        <>
          {/* Toggle: Upload files vs Add link */}
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setAgcLinkMode(false)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                !agcLinkMode
                  ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0f0f0f]"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
              ].join(" ")}
            >
              Upload files
            </button>
            <button
              type="button"
              onClick={() => setAgcLinkMode(true)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                agcLinkMode
                  ? "bg-[#0B3EAF] text-white dark:bg-[#A7D344] dark:text-[#0f0f0f]"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
              ].join(" ")}
            >
              Add link
            </button>
          </div>

          {!agcLinkMode ? (
            /* ── Upload files form ── */
            <form onSubmit={handleAgcUpload} className="card mb-6 p-4 sm:p-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Upload files</h2>
              <div className="grid gap-4">
                <div>
                  <label className={fieldLabel}>Title <span className="font-normal text-slate-400">(optional — for single file)</span></label>
                  <input
                    className={fieldInput}
                    placeholder="e.g. PPT Template, Email Signatures… (leave blank to use filename)"
                    value={agcFileTitle}
                    onChange={(e) => setAgcFileTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>File(s)</label>
                  <input
                    ref={agcFileRef}
                    type="file"
                    multiple
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-[#0B3EAF] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-[#082d82] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <p className="mt-1 text-xs text-slate-400">Select multiple files to upload in bulk — each will use its filename as the title.</p>
                </div>
              </div>
              {/* Per-file progress */}
              {agcUploadProgress.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {agcUploadProgress.map((f, i) => (
                    <li key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={[
                          "inline-block w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-bold uppercase tracking-wide",
                          f.status === "done"      ? "bg-green-100 text-green-700"  :
                          f.status === "error"     ? "bg-red-100 text-red-700"      :
                          f.status === "uploading" ? "bg-blue-100 text-blue-700"    :
                                                     "bg-slate-100 text-slate-500",
                        ].join(" ")}>
                          {f.status === "uploading" ? "…" : f.status === "done" ? "✓ done" : f.status === "error" ? "✗ fail" : "queued"}
                        </span>
                        <span className="truncate text-slate-600 dark:text-slate-300">{f.name}</span>
                      </div>
                      {f.status === "error" && f.error && (
                        <p className="ml-[4.5rem] mt-0.5 text-red-600 dark:text-red-400">{f.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="submit"
                disabled={agcUploading}
                className="mt-4 rounded-lg bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082d82] disabled:opacity-60"
              >
                {agcUploading ? "Uploading…" : "Upload"}
              </button>
            </form>
          ) : (
            /* ── Add link form ── */
            <form onSubmit={handleAgcAddLink} className="card mb-6 p-4 sm:p-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Add link</h2>
              <div className="grid gap-4">
                <div>
                  <label className={fieldLabel}>Title</label>
                  <input
                    className={fieldInput}
                    placeholder="e.g. AGC Website, Benefits Portal…"
                    value={agcLinkForm.title}
                    onChange={(e) => setAgcLinkForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>URL</label>
                  <input
                    className={fieldInput}
                    type="url"
                    placeholder="https://…"
                    value={agcLinkForm.url}
                    onChange={(e) => setAgcLinkForm((f) => ({ ...f, url: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={agcAddingLink}
                className="mt-4 rounded-lg bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082d82] disabled:opacity-60"
              >
                {agcAddingLink ? "Saving…" : "Add link"}
              </button>
            </form>
          )}

          {/* Existing docs */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Current resources{" "}
                {!agcDocsLoading && <span className="text-sm font-normal text-slate-500">({agcDocs.length})</span>}
              </h2>
            </div>
            {agcDocsLoading ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : agcDocs.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No resources yet. Upload a file or add a link above.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {agcDocs.map((doc) => {
                  const isLink = doc.file_url && /^https?:\/\//.test(doc.file_url) && !doc.file_url.includes("digitaloceanspaces");
                  return (
                    <li key={doc.id} className={`px-4 py-3 ${agcEditId === doc.id ? "" : "flex items-center gap-3"}`}>
                      {agcEditId === doc.id ? (
                        /* ── Expanded edit row ── */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {isLink
                              ? <span className="inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700">LINK</span>
                              : <ExtBadge url={doc.file_url} />
                            }
                            <input
                              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              value={agcEditTitle}
                              onChange={(e) => setAgcEditTitle(e.target.value)}
                              autoFocus
                              placeholder="Title"
                              onKeyDown={(e) => { if (e.key === "Escape") setAgcEditId(null); }}
                            />
                          </div>
                          {!isLink && (
                            <div>
                              <p className="mb-1 text-[10px] text-slate-400">Replace file (optional — leave empty to keep existing)</p>
                              <input
                                ref={agcEditFileRef}
                                type="file"
                                className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-700 dark:file:text-slate-200"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => handleAgcRename(doc)} disabled={agcEditSaving} className="rounded bg-[#0B3EAF] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#082d82] disabled:opacity-60">{agcEditSaving ? "Saving…" : "Save"}</button>
                            <button onClick={() => { setAgcEditId(null); if (agcEditFileRef.current) agcEditFileRef.current.value = ""; }} className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal row ── */
                        <>
                          {isLink
                            ? <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700">LINK</span>
                            : <ExtBadge url={doc.file_url} />
                          }
                          <a href={doc.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm font-medium text-[#0B3EAF] hover:underline dark:text-[#A7D344]">
                            {doc.title}
                          </a>
                          <div className="flex shrink-0 items-center gap-2">
                            <button onClick={() => { setAgcEditId(doc.id); setAgcEditTitle(doc.title); }} className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Edit</button>
                            <button onClick={() => handleAgcDelete(doc)} className="rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">Delete</button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {activeTab !== AGC_RESOURCES_TAB && tabMeta.aboutIntroTab ? (
        <div className="card mb-6 p-4 sm:p-5">
          <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">About page intro</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            This text appears at the top of the About the company page.
          </p>
          <textarea
            value={aboutIntro}
            onChange={(e) => setAboutIntro(e.target.value)}
            rows={5}
            className={`${fieldInput} min-h-[8rem]`}
          />
          <button
            type="button"
            onClick={onSaveIntro}
            disabled={introSaving}
            className="mt-3 rounded-lg bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082d82] disabled:opacity-60 dark:bg-[#A7D344] dark:text-[#0f0f0f]"
          >
            {introSaving ? "Saving…" : "Save intro"}
          </button>
        </div>
      ) : null}

      {activeTab !== AGC_RESOURCES_TAB && <form onSubmit={onSave} className="card mb-6 p-4 sm:p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          {editingId ? "Edit item" : "Add item"} — {tabMeta.label}
        </h2>
        {activeTab === "forms" ? (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            Items here appear under <strong>About Company → Forms</strong> (Mileage Reporting, Supply Request, etc.).
            Upload a PDF or document, then click Add item or Update item.
          </p>
        ) : null}
        {activeTab === "about_forms" ? (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            Items here appear on the <strong>About the company</strong> page, below the intro text.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={fieldLabel}>Title</label>
            <input
              className={fieldInput}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Title…"
              required
            />
          </div>
          {tabMeta.showDescription ? (
            <div className="md:col-span-2">
              <label className={fieldLabel}>Description (optional)</label>
              <textarea
                className={`${fieldInput} min-h-[6rem]`}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Summary or notes…"
              />
            </div>
          ) : null}
          {tabMeta.showLink ? (
            <div className="md:col-span-2">
              <label className={fieldLabel}>Link URL</label>
              <input
                className={fieldInput}
                value={form.link_url}
                onChange={(e) => setForm((prev) => ({ ...prev, link_url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
          ) : null}
          {tabMeta.showFile ? (
            <div className="md:col-span-2">
              <label className={fieldLabel}>Document file</label>
              {form.file_url ? (
                <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">
                  Current file:{" "}
                  <a
                    href={resolvePublicMediaUrl(form.file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]"
                  >
                    Open
                  </a>
                </p>
              ) : null}
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt" onChange={onPickFile} />
            </div>
          ) : null}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
              />
              Published
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082d82] disabled:opacity-60 dark:bg-[#A7D344] dark:text-[#0f0f0f]"
          >
            {saving ? "Saving…" : editingId ? "Update item" : "Add item"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>}

      {activeTab !== AGC_RESOURCES_TAB && <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{tabMeta.label}</h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading…</p>
        ) : sectionItems.length === 0 ? (
          <p className="p-4 text-sm text-slate-600 dark:text-slate-300">No items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sectionItems.map((item, idx) => (
                  <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDate(item.updated_at || item.created_at)}
                    </td>
                    <td className="px-4 py-3">{item.published ? "Published" : "Draft"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800" disabled={idx === 0} onClick={() => onMove(item.id, "up")}>↑</button>
                        <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800" disabled={idx === sectionItems.length - 1} onClick={() => onMove(item.id, "down")}>↓</button>
                        <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-[#0B3EAF] hover:bg-[#eef3ff] dark:text-[#A7D344]" onClick={() => onEdit(item)}>Edit</button>
                        <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-[#E02B20] hover:bg-[#E02B20]/10" onClick={() => onDelete(item.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </div>
  );
}
