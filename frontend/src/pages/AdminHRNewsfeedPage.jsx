import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
const DEPARTMENTS = [
  "HR", "Social Committee", "IT", "Finance",
  "Safety", "Production", "FSQA", "Management", "Other",
];
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;

const fieldLabelClass =
  "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";
const fieldInputClass =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15 dark:border-slate-600 dark:bg-slate-800 dark:placeholder:text-slate-500";

function emptyForm() {
  return { title: "", body: "", image_url: "", facilities: ["AGC"], department: "", published: true };
}

export default function AdminHRNewsfeedPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [uploadingAdd, setUploadingAdd] = useState(false);
  const [uploadingEdit, setUploadingEdit] = useState(false);
  const addImgRef = useRef(null);
  const editImgRef = useRef(null);
  const savingRef = useRef(false);
  const editSavingRef = useRef(false);

  const load = () =>
    api
      .get("/hr-newsfeed")
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setItems([]));

  useEffect(() => { load(); }, []);

  const toggleFacility = (code, isEdit) => {
    if (isEdit) {
      setEditing((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.facilities || []);
        if (next.has(code)) { if (next.size <= 1) return prev; next.delete(code); }
        else next.add(code);
        return { ...prev, facilities: FACILITIES.filter((f) => next.has(f)) };
      });
    } else {
      setForm((prev) => {
        const next = new Set(prev.facilities || []);
        if (next.has(code)) { if (next.size <= 1) return prev; next.delete(code); }
        else next.add(code);
        return { ...prev, facilities: FACILITIES.filter((f) => next.has(f)) };
      });
    }
  };

  const handleImgUpload = async (file, isEdit) => {
    if (!file) return;
    isEdit ? setUploadingEdit(true) : setUploadingAdd(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await api.post("/upload/upcoming-image", fd, { timeout: UPLOAD_TIMEOUT_MS });
      const url = r.data?.image_url;
      if (!url) { window.alert("Upload finished but no URL returned."); return; }
      if (isEdit) setEditing((s) => s ? { ...s, image_url: url } : s);
      else setForm((s) => ({ ...s, image_url: url }));
    } catch (err) {
      window.alert(err.response?.data?.message || err.message || "Upload failed.");
    } finally {
      isEdit ? setUploadingEdit(false) : setUploadingAdd(false);
      if (isEdit && editImgRef.current) editImgRef.current.value = "";
      if (!isEdit && addImgRef.current) addImgRef.current.value = "";
    }
  };

  const onAdd = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!form.title.trim()) { window.alert("Title is required."); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await api.post("/hr-newsfeed", {
        title: form.title.trim(),
        body: form.body.trim() || undefined,
        image_url: form.image_url || undefined,
        facilities: form.facilities,
        department: form.department || undefined,
        published: form.published,
      });
      setForm(emptyForm());
      await load();
    } catch (err) {
      window.alert(err.response?.data?.message || err.message || "Save failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (editSavingRef.current) return;
    if (!String(editing.title || "").trim()) { window.alert("Title is required."); return; }
    editSavingRef.current = true;
    setEditSaving(true);
    try {
      await api.put(`/hr-newsfeed/${editing.id}`, {
        title: String(editing.title).trim(),
        body: String(editing.body || "").trim() || null,
        image_url: editing.image_url || null,
        facilities: editing.facilities,
        department: editing.department || null,
        published: editing.published,
      });
      setEditing(null);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.message || err.message || "Save failed.");
    } finally {
      editSavingRef.current = false;
      setEditSaving(false);
    }
  };

  const onRemove = async (id) => {
    if (!window.confirm("Remove this news item?")) return;
    setRemovingId(id);
    try {
      await api.delete(`/hr-newsfeed/${id}`);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.message || err.message || "Delete failed.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:px-8 lg:py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">HR News Feed</h1>

      {/* Add form */}
      <div className="card rounded-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Add news item</h2>
        <form onSubmit={onAdd} className="space-y-4">
          {/* Facilities */}
          <div>
            <label className={fieldLabelClass}>Facilities</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {FACILITIES.map((f) => (
                <label key={f} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-brand-blue"
                    checked={(form.facilities || []).includes(f)}
                    onChange={() => toggleFacility(f, false)}
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className={fieldLabelClass}>Title *</label>
            <input
              className={fieldInputClass}
              placeholder="Headline for the news item"
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            />
          </div>

          {/* Body */}
          <div>
            <label className={fieldLabelClass}>Body / Details</label>
            <textarea
              className={`${fieldInputClass} resize-none`}
              rows={3}
              placeholder="Optional description…"
              value={form.body}
              onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
            />
          </div>

          {/* Department */}
          <div>
            <label className={fieldLabelClass}>Department</label>
            <select
              className={fieldInputClass}
              value={form.department}
              onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))}
            >
              <option value="">— Select (optional) —</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Image */}
          <div>
            <label className={fieldLabelClass}>Image (optional)</label>
            <div className="flex items-start gap-3">
              {form.image_url && (
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
                  <img src={resolvePublicMediaUrl(form.image_url)} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  ref={addImgRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  disabled={uploadingAdd || saving}
                  onChange={(e) => handleImgUpload(e.target.files?.[0], false)}
                  className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-blue dark:file:bg-white/10 dark:file:text-brand-green"
                />
                {uploadingAdd && <p className="text-xs font-medium text-brand-blue dark:text-brand-green">Uploading…</p>}
                {form.image_url && (
                  <button type="button" className="btn-outline self-start text-xs" onClick={() => setForm((s) => ({ ...s, image_url: "" }))}>
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Published */}
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((s) => ({ ...s, published: e.target.checked }))}
              className="rounded border-slate-300 text-brand-blue"
            />
            Published (visible on home page)
          </label>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Publish news item"}
          </button>
        </form>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No news items yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/50 p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/30">
              <div className="flex min-w-0 flex-1 gap-3">
                {item.image_url && (
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
                    <img src={resolvePublicMediaUrl(item.image_url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {Array.isArray(item.facilities) && item.facilities.map((f) => (
                      <span key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-slate-700">{f}</span>
                    ))}
                    {item.department && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">{item.department}</span>
                    )}
                    {item.published ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">Published</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Draft</span>
                    )}
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.body}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn-outline shrink-0" onClick={() => setEditing({ ...item, facilities: Array.isArray(item.facilities) ? item.facilities : [] })}>Edit</button>
                <button type="button" disabled={removingId === item.id} className="btn-danger shrink-0" onClick={() => onRemove(item.id)}>
                  {removingId === item.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Edit news item</h3>
              <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(null)}>Close</button>
            </div>

            <div className="space-y-3">
              {/* Facilities */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Facilities</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {FACILITIES.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-brand-blue"
                        checked={(editing.facilities || []).includes(f)}
                        onChange={() => toggleFacility(f, true)}
                      />
                      {f}
                    </label>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Title *</div>
                <input className="w-full rounded border p-2 text-sm dark:bg-slate-700" value={editing.title || ""} onChange={(e) => setEditing((s) => s ? { ...s, title: e.target.value } : null)} />
              </div>

              {/* Body */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Body</div>
                <textarea className="w-full resize-none rounded border p-2 text-sm dark:bg-slate-700" rows={3} value={editing.body || ""} onChange={(e) => setEditing((s) => s ? { ...s, body: e.target.value } : null)} />
              </div>

              {/* Department */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Department</div>
                <select className="w-full rounded border p-2 text-sm dark:bg-slate-700" value={editing.department || ""} onChange={(e) => setEditing((s) => s ? { ...s, department: e.target.value } : null)}>
                  <option value="">— Select (optional) —</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Image */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Image</div>
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-600">
                  {editing.image_url && (
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
                      <img src={resolvePublicMediaUrl(editing.image_url)} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={editImgRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      disabled={editSaving || uploadingEdit}
                      onChange={(e) => handleImgUpload(e.target.files?.[0], true)}
                      className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-blue dark:file:bg-white/10 dark:file:text-brand-green"
                    />
                    {uploadingEdit && <p className="text-xs font-medium text-brand-blue dark:text-brand-green">Uploading…</p>}
                    {editing.image_url && (
                      <button type="button" className="btn-outline self-start text-xs" onClick={() => setEditing((s) => s ? { ...s, image_url: "" } : null)}>Remove image</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Published */}
              <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 p-2.5 text-sm font-medium dark:border-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(editing.published)}
                  onChange={(e) => setEditing((s) => s ? { ...s, published: e.target.checked } : null)}
                  className="rounded border-slate-300 text-brand-blue"
                />
                Published
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={editSaving} onClick={onSaveEdit}>
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
