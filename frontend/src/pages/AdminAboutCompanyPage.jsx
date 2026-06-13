import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import { PAGE_SHELL } from "../constants/pageLayout";
import { COMPANY_CONTENT_ADMIN_SECTIONS } from "../constants/companyContentConfig";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { uploadResourceDocumentFile } from "../services/directUpload";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const fieldLabel = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";
const fieldInput =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-brand-green dark:focus:ring-brand-green/20";

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
      </div>

      {tabMeta.aboutIntroTab ? (
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

      <form onSubmit={onSave} className="card mb-6 p-4 sm:p-5">
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
      </form>

      <div className="card overflow-hidden">
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
      </div>
    </div>
  );
}
