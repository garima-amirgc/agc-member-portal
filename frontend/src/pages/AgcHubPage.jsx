import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SHELL } from "../constants/pageLayout";
import { COMPANY_CONTENT_SECTIONS } from "../constants/companyContentConfig";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { friendlyErrorMessage } from "../services/friendlyError";
import { uploadResourceDocumentFile } from "../services/directUpload";
import ResourceDocumentPreview from "../components/resources/ResourceDocumentPreview";
import { CATEGORIES } from "../utils/resourcesContent";
import { IconBuilding } from "../components/layout/SidebarIcons";

// ─── Tile config — company brand colors ──────────────────────────────────────

const TILE_CONFIG = {
  about:          { bg: "#0B3EAF", text: "#ffffff" },
  benefits:       { bg: "#082d82", text: "#ffffff" },
  policy:         { bg: "#0B3EAF", text: "#ffffff" },
  policy_changes: { bg: "#082d82", text: "#ffffff" },
  links:          { bg: "#A7D344", text: "#0f0f0f" },
  links_websites: { bg: "#A7D344", text: "#0f0f0f" },
  forms:          { bg: "#082d82", text: "#ffffff" },
};

const RESOURCES_CFG = { bg: "#0B3EAF", text: "#ffffff" };

// Map public section key → admin POST key
function adminSectionKey(key) {
  return key === "about" ? "about_forms" : key;
}

// Upload config per section
function uploadConfig(section) {
  if (section.key === "about") return { showFile: true, showLink: false, showDescription: false };
  return { showFile: !!section.showFile, showLink: !!section.showLink, showDescription: !!section.showDescription };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, headerBg, headerText, Icon, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div className="relative my-4 w-full max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div
          className="flex items-center gap-3 rounded-t-2xl px-6 py-4"
          style={{ backgroundColor: headerBg }}
        >
          {Icon && (
            <Icon className="h-5 w-5 shrink-0" style={{ color: headerText }} />
          )}
          <h2 className="flex-1 text-sm font-bold" style={{ color: headerText }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm transition hover:bg-white/20"
            style={{ color: headerText }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────

function LinkIcon() {
  return (
    <svg className="h-8 w-8 text-[#0B3EAF] dark:text-[#A7D344]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function DocCard({ item, onDelete, isLink = false }) {
  const fileUrl = item.file_url ? resolvePublicMediaUrl(item.file_url) : "";
  const linkUrl = String(item.link_url || "").trim();
  const href = isLink ? linkUrl : fileUrl;
  const uploadedLabel = formatDate(item.updated_at || item.created_at);

  let hostname = "";
  if (isLink && href) {
    try { hostname = new URL(href).hostname; } catch {}
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200/90 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900/40">
      {/* Thumbnail: file preview for files, clean link banner for links */}
      {isLink ? (
        <a
          href={href || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-24 items-center justify-center gap-3 bg-slate-50 px-4 transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          <LinkIcon />
          {hostname && (
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{hostname}</span>
          )}
        </a>
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          <ResourceDocumentPreview url={href} />
        </a>
      ) : (
        <div><ResourceDocumentPreview url="" /></div>
      )}

      {/* Title + date */}
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#0B3EAF] hover:underline dark:text-[#A7D344]"
            >
              {item.title}
            </a>
          ) : (
            <span className="text-sm font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{item.title}</span>
          )}
          {item.description ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
          ) : null}
          {uploadedLabel ? (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{uploadedLabel}</p>
          ) : null}
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            title="Delete"
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 transition hover:bg-[#E02B20]/10 hover:text-[#E02B20] dark:bg-slate-700"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Inline upload form (admins only) ─────────────────────────────────────────

function AddItemForm({ section, onSaved, onCancel }) {
  const cfg = uploadConfig(section);
  const [form, setForm] = useState({ title: "", description: "", link_url: "", file_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadResourceDocumentFile(file);
      setForm((p) => ({ ...p, file_url: result?.file_url || "" }));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/company-content/admin/items", {
        section: adminSectionKey(section.key),
        title: form.title.trim(),
        description: form.description.trim() || null,
        link_url: cfg.showLink ? form.link_url.trim() || null : null,
        file_url: cfg.showFile ? form.file_url || null : null,
        published: true,
      });
      onSaved();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40"
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Add item</p>
      {error ? <p className="mb-2 text-xs text-[#E02B20]">{error}</p> : null}
      <div className="space-y-3">
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Title…"
          required
        />
        {cfg.showDescription && (
          <textarea
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Description (optional)…"
          />
        )}
        {cfg.showLink && (
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            value={form.link_url}
            onChange={(e) => setForm((p) => ({ ...p, link_url: e.target.value }))}
            placeholder="https://…"
          />
        )}
        {cfg.showFile && (
          <div>
            {form.file_url ? (
              <p className="mb-1 text-xs text-slate-500">
                ✓ Uploaded —{" "}
                <a href={resolvePublicMediaUrl(form.file_url)} target="_blank" rel="noopener noreferrer" className="text-[#0B3EAF] underline dark:text-[#A7D344]">preview</a>
                {" "}<button type="button" className="text-[#E02B20] underline" onClick={() => { setForm((p) => ({ ...p, file_url: "" })); if (fileRef.current) fileRef.current.value = ""; }}>remove</button>
              </p>
            ) : null}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt" onChange={handleFile} disabled={uploading} className="text-xs text-slate-700 dark:text-slate-300" />
            {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={saving || uploading} className="rounded-lg bg-[#0B3EAF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-[#A7D344] dark:text-[#0f0f0f]">
          {saving ? "Saving…" : "Add item"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
      </div>
    </form>
  );
}

// ─── Section modal content ────────────────────────────────────────────────────

function SectionContent({ section, isAdmin, onRefresh }) {
  const [items, setItems] = useState([]);
  const [intro, setIntro] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [introText, setIntroText] = useState("");
  const [introSaving, setIntroSaving] = useState(false);

  const isAbout = section.isAboutPage || section.key === "about";
  const isLinks = section.key === "links" || section.key === "links_websites";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isAbout) {
        const { data } = await api.get("/company-content/about-page");
        setIntro(String(data?.intro || ""));
        setIntroText(String(data?.intro || ""));
        setItems(Array.isArray(data?.forms) ? data.forms : []);
      } else {
        const { data } = await api.get(`/company-content/section/${section.key}`);
        setItems(Array.isArray(data) ? data : []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [section.key, isAbout]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    await api.delete(`/company-content/admin/items/${id}`).catch(() => {});
    await load();
    onRefresh();
  };

  const handleSaveIntro = async () => {
    setIntroSaving(true);
    try {
      await api.put("/company-content/admin/about-intro", { intro: introText });
      setIntro(introText);
    } catch {}
    setIntroSaving(false);
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* About intro */}
      {isAbout && (
        isAdmin ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">About intro text</p>
            <textarea
              rows={3}
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSaveIntro}
              disabled={introSaving}
              className="mt-2 rounded-lg bg-[#0B3EAF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 dark:bg-[#A7D344] dark:text-[#0f0f0f]"
            >
              {introSaving ? "Saving…" : "Save intro"}
            </button>
          </div>
        ) : intro ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{intro}</p>
          </div>
        ) : null
      )}

      {/* Document / link grid */}
      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <DocCard
              key={item.id}
              item={item}
              isLink={isLinks}
              onDelete={isAdmin ? handleDelete : null}
            />
          ))}
        </div>
      )}

      {items.length === 0 && !isAdmin && (
        <p className="text-sm text-slate-500">No items published yet.</p>
      )}

      {/* Admin upload */}
      {isAdmin && (
        addOpen ? (
          <AddItemForm
            section={section}
            onSaved={async () => { setAddOpen(false); await load(); onRefresh(); }}
            onCancel={() => setAddOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-600 dark:text-slate-300"
          >
            <span className="text-base leading-none">+</span>
            {isLinks ? "Add link" : "Upload document"}
          </button>
        )
      )}
    </div>
  );
}

// ─── Company Resources modal content ─────────────────────────────────────────

function ResourcesContent({ isResourceAdmin }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ category: CATEGORIES[0]?.key || "finance", title: "", file_url: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        CATEGORIES.map((cat) =>
          api.get(`/resources/facility/AGC/category/${cat.key}/documents`)
        )
      );
      const all = results.flatMap((r) =>
        r.status === "fulfilled" && Array.isArray(r.value?.data?.documents)
          ? r.value.data.documents
          : []
      );
      setDocs(all);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError("");
    try {
      const result = await uploadResourceDocumentFile(file);
      setForm((p) => ({ ...p, file_url: result?.file_url || "" }));
    } catch (err) {
      setFormError(friendlyErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.file_url) { setFormError("Please upload a file first."); return; }
    setSaving(true);
    setFormError("");
    try {
      await api.post("/resources/documents", {
        business_unit: "AGC",
        category: form.category,
        title: form.title.trim(),
        file_url: form.file_url,
      });
      setForm({ category: CATEGORIES[0]?.key || "finance", title: "", file_url: "" });
      if (fileRef.current) fileRef.current.value = "";
      setAddOpen(false);
      await load();
    } catch (err) {
      setFormError(friendlyErrorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await api.delete(`/resources/documents/${docId}`);
      await load();
    } catch {}
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Admin upload form */}
      {isResourceAdmin && addOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40"
        >
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Upload document</p>
          {formError ? <p className="mb-2 text-xs text-[#E02B20]">{formError}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Title <span className="text-[#E02B20]">*</span></label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Email Signatures"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">Category</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3EAF] focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key}>{cat.label || cat.key}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">File <span className="text-[#E02B20]">*</span></label>
              {form.file_url ? (
                <p className="mb-1 text-xs text-slate-500">
                  ✓ Uploaded —{" "}
                  <a href={resolvePublicMediaUrl(form.file_url)} target="_blank" rel="noopener noreferrer" className="text-[#0B3EAF] underline dark:text-[#A7D344]">preview</a>
                  {" "}<button type="button" className="text-[#E02B20] underline" onClick={() => { setForm((p) => ({ ...p, file_url: "" })); if (fileRef.current) fileRef.current.value = ""; }}>remove</button>
                </p>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                onChange={handleFile}
                disabled={uploading}
                className="text-xs text-slate-700 dark:text-slate-300"
              />
              {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={saving || uploading} className="rounded-lg bg-[#0B3EAF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-[#A7D344] dark:text-[#0f0f0f]">
              {saving ? "Saving…" : "Add document"}
            </button>
            <button type="button" onClick={() => { setAddOpen(false); setFormError(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {docs.length === 0 && !isResourceAdmin && (
        <p className="text-sm text-slate-500">No documents published yet.</p>
      )}

      {docs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              item={{
                id: doc.id,
                title: doc.title,
                file_url: doc.url,
                created_at: doc.added_at,
              }}
              isLink={false}
              onDelete={isResourceAdmin ? () => handleDelete(doc.docId) : null}
            />
          ))}
        </div>
      )}

      {isResourceAdmin && !addOpen && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#0B3EAF] hover:text-[#0B3EAF] dark:border-slate-600 dark:text-slate-300"
        >
          <span className="text-base leading-none">+</span>
          Upload document
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgcHubPage() {
  const { user } = useAuth();
  const isAdmin =
    user?.role === "Admin" ||
    (Array.isArray(user?.adminGrants) && user.adminGrants.includes(ADMIN_GRANT_KEYS.COMPANY_CONTENT));
  const isResourceAdmin =
    user?.role === "Admin" ||
    (Array.isArray(user?.adminGrants) && user.adminGrants.includes(ADMIN_GRANT_KEYS.LEARNING_ADMIN));

  // openModal: null | section.key | "resources"
  const [openModal, setOpenModal] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const close = () => setOpenModal(null);

  const activeSection = COMPANY_CONTENT_SECTIONS.find((s) => s.key === openModal) ?? null;
  const activeCfg = activeSection
    ? (TILE_CONFIG[activeSection.key] ?? { bg: "#0B3EAF", text: "#ffffff" })
    : RESOURCES_CFG;

  return (
    <main className={PAGE_SHELL}>
      {/* Tile grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {COMPANY_CONTENT_SECTIONS.map((section) => {
          const cfg = TILE_CONFIG[section.key] ?? { bg: "#0B3EAF", text: "#ffffff" };
          const Icon = section.navIcon || IconBuilding;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setOpenModal(section.key)}
              className="flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition select-none hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
              style={{ backgroundColor: cfg.bg, color: cfg.text }}
            >
              <Icon className="h-5 w-5 shrink-0 opacity-90" style={{ color: cfg.text }} />
              <span className="text-sm font-bold leading-snug" style={{ color: cfg.text }}>{section.label}</span>
            </button>
          );
        })}
        {/* Company Resources tile */}
        <button
          type="button"
          onClick={() => setOpenModal("resources")}
          className="flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition select-none hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: RESOURCES_CFG.bg, color: RESOURCES_CFG.text }}
        >
          <IconBuilding className="h-5 w-5 shrink-0 opacity-90" style={{ color: RESOURCES_CFG.text }} />
          <span className="text-sm font-bold leading-snug" style={{ color: RESOURCES_CFG.text }}>Company Resources</span>
        </button>
      </div>

      {/* Section modals */}
      {COMPANY_CONTENT_SECTIONS.map((section) => {
        const cfg = TILE_CONFIG[section.key] ?? { bg: "#0B3EAF", text: "#ffffff" };
        const Icon = section.navIcon || IconBuilding;
        return (
          <Modal
            key={section.key}
            open={openModal === section.key}
            onClose={close}
            title={section.pageTitle || section.label}
            headerBg={cfg.bg}
            headerText={cfg.text}
            Icon={Icon}
          >
            <SectionContent
              section={section}
              isAdmin={isAdmin}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </Modal>
        );
      })}

      {/* Company Resources modal */}
      <Modal
        open={openModal === "resources"}
        onClose={close}
        title="Company Resources"
        headerBg={RESOURCES_CFG.bg}
        headerText={RESOURCES_CFG.text}
        Icon={IconBuilding}
      >
        <ResourcesContent isResourceAdmin={isResourceAdmin} />
      </Modal>
    </main>
  );
}
