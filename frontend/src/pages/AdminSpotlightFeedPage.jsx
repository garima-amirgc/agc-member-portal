import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import { PAGE_SHELL } from "../constants/pageLayout";
import { ADMIN_FIELD_INPUT, ADMIN_FIELD_LABEL } from "../constants/adminFormStyles";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import HomeSpotlightOrderPanel from "../components/HomeSpotlightOrderPanel";

const UPLOAD_IMAGE_TIMEOUT_MS = 3 * 60 * 1000;

const fieldLabel = ADMIN_FIELD_LABEL;
const fieldInput = ADMIN_FIELD_INPUT;

function emptyForm() {
  return {
    title: "",
    description: "",
    link_url: "",
    image_url: "",
    published: true,
  };
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminSpotlightFeedPage({ feed }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);
  const formId = feed.apiBase.replace(/\W+/g, "-");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(feed.apiBase);
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, `Could not load ${feed.pageTitle.toLowerCase()}.`));
    } finally {
      setLoading(false);
    }
  }, [feed.apiBase, feed.pageTitle]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
  };

  const startEdit = (entry) => {
    setEditId(entry.id);
    setForm({
      title: entry.title || "",
      description: entry.description || "",
      link_url: entry.link_url || "",
      image_url: entry.image_url || "",
      published: entry.published !== false,
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post("/upload/upcoming-image", fd, { timeout: UPLOAD_IMAGE_TIMEOUT_MS });
      const url = data?.image_url;
      if (url) setForm((f) => ({ ...f, image_url: url }));
      else window.alert("Upload finished but no image URL was returned.");
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Image upload failed."));
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      window.alert(`Please enter a ${feed.titleFieldLabel.toLowerCase()}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        link_url: form.link_url?.trim() || null,
        image_url: form.image_url?.trim() || null,
        published: form.published,
      };
      if (editId) {
        await api.put(`${feed.apiBase}/${editId}`, payload);
      } else {
        await api.post(feed.apiBase, payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save entry."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (entry) => {
    if (!window.confirm(`Remove "${entry.title}"?`)) return;
    try {
      await api.delete(`${feed.apiBase}/${entry.id}`);
      if (editId === entry.id) resetForm();
      await load();
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not delete entry."));
    }
  };

  const onMove = async (entry, direction) => {
    try {
      const { data } = await api.post(`${feed.apiBase}/${entry.id}/move`, { direction });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not reorder entry."));
    }
  };

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title={feed.pageTitle} />
      <DashboardAssignmentNotice user={user} />

      <HomeSpotlightOrderPanel />

      <div className="card mt-6 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{feed.adminIntro}</p>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="md:col-span-2">
            <label className={fieldLabel} htmlFor={`${formId}-title`}>
              {feed.titleFieldLabel}
            </label>
            <input
              id={`${formId}-title`}
              type="text"
              className={fieldInput}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={feed.titlePlaceholder}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel} htmlFor={`${formId}-description`}>
              {feed.messageFieldLabel}
            </label>
            <textarea
              id={`${formId}-description`}
              className={`${fieldInput} min-h-[96px]`}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={feed.messagePlaceholder}
            />
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel} htmlFor={`${formId}-link`}>
              {feed.linkFieldLabel}
            </label>
            <input
              id={`${formId}-link`}
              type="url"
              className={fieldInput}
              value={form.link_url}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://…"
            />
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel}>{feed.imageFieldLabel}</label>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 sm:h-32 sm:w-32 sm:shrink-0">
                {form.image_url ? (
                  <img src={resolvePublicMediaUrl(form.image_url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                    No photo uploaded
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                  disabled={uploadingImage || saving}
                  onChange={handleImageChange}
                  className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-blue hover:file:bg-brand-surface dark:file:bg-white/10 dark:file:text-brand-green"
                />
                {uploadingImage ? (
                  <p className="text-sm font-medium text-brand-blue dark:text-brand-green">Uploading…</p>
                ) : null}
                {form.image_url ? (
                  <button
                    type="button"
                    className="btn-outline self-start"
                    disabled={saving || uploadingImage}
                    onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
            />
            {feed.publishLabel}
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : editId ? feed.adminSaveEditLabel : feed.adminSaveNewLabel}
            </button>
            {editId ? (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card mt-6">
        <h2 className="text-lg font-semibold">Previous entries</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No entries yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="px-2 py-2">Sort</th>
                  <th className="px-2 py-2">{feed.tableDateHeader}</th>
                  <th className="px-2 py-2">{feed.tableTitleHeader}</th>
                  <th className="px-2 py-2">Published</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
                          disabled={index === 0}
                          onClick={() => onMove(entry, "up")}
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
                          disabled={index === entries.length - 1}
                          onClick={() => onMove(entry, "down")}
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-3 font-medium">{formatDate(entry.created_at)}</td>
                    <td className="px-2 py-3">{entry.title || "—"}</td>
                    <td className="px-2 py-3">{entry.published ? "Yes" : "No"}</td>
                    <td className="px-2 py-3 text-right">
                      <button type="button" className="mr-3 text-brand-blue dark:text-brand-green" onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button type="button" className="text-red-600 dark:text-red-400" onClick={() => onDelete(entry)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
