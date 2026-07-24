import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

const labelCls = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";
const inputCls =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15 dark:border-slate-600 dark:bg-slate-800 dark:placeholder:text-slate-500";

const TIERS = [
  { value: "Gold",   icon: "🥇", label: "Gold"   },
  { value: "Silver", icon: "🥈", label: "Silver" },
  { value: "Bronze", icon: "🥉", label: "Bronze" },
];
const TIER_ICON = { Gold: "🥇", Silver: "🥈", Bronze: "🥉" };

async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await api.post("/upload/upcoming-image", fd, { timeout: UPLOAD_TIMEOUT_MS });
  return data?.image_url ?? data?.url ?? null;
}

// ─── Tier picker ──────────────────────────────────────────────────────────────

function TierPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TIERS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(value === t.value ? "" : t.value)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
            value === t.value
              ? "border-[#0B3EAF] bg-[#0B3EAF] text-white dark:border-[#A7D344] dark:bg-[#A7D344] dark:text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          <span>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Images Section ───────────────────────────────────────────────────────────

function ImagesSection({ eventId, images, onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef(null);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImageFile(file);
      if (url) {
        await api.post(`/social/events/${eventId}/images`, { image_url: url });
        await onRefresh();
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (imgRef.current) imgRef.current.value = "";
    }
  }

  async function handleDelete(imgId) {
    if (!confirm("Remove this image from the gallery?")) return;
    try {
      await api.delete(`/social/events/${eventId}/images/${imgId}`);
      await onRefresh();
    } catch {}
  }

  const newImages  = images.filter((img) => img.id > 0);
  const legacyImgs = images.filter((img) => img.id < 0);

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        📸 Gallery Images
      </p>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {newImages.map((img) => (
          <div key={img.id} className="group relative shrink-0">
            <img
              src={resolvePublicMediaUrl(img.image_url)}
              alt=""
              className="h-20 w-28 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
            />
            <button
              type="button"
              onClick={() => handleDelete(img.id)}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow group-hover:flex"
            >
              ✕
            </button>
          </div>
        ))}

        {newImages.length === 0 && legacyImgs.map((img) => (
          <div key={img.id} className="relative shrink-0">
            <img
              src={resolvePublicMediaUrl(img.image_url)}
              alt=""
              className="h-20 w-28 rounded-lg border border-dashed border-amber-300 object-cover opacity-70"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
              Legacy
            </span>
          </div>
        ))}

        <button
          type="button"
          onClick={() => imgRef.current?.click()}
          disabled={uploading}
          className="flex h-20 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 hover:text-slate-500 disabled:opacity-60 dark:border-slate-600 dark:text-slate-500"
        >
          {uploading ? (
            <span className="text-xs">Uploading…</span>
          ) : (
            <>
              <span className="text-xl leading-none">+</span>
              <span className="text-[10px] font-medium">Add image</span>
            </>
          )}
        </button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>
      {newImages.length === 0 && legacyImgs.length > 0 && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          Legacy image shown — upload new images above to add more slides.
        </p>
      )}
    </div>
  );
}

// ─── Video Section ────────────────────────────────────────────────────────────

function VideoSection({ event, onRefresh }) {
  const [url, setUrl] = useState(event.video_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);

  useEffect(() => { setUrl(event.video_url || ""); }, [event.id]);

  async function saveUrl() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/social/events/${event.id}`, { video_url: url || "" });
      await onRefresh();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  async function handleVideoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("video", file);
      const { data } = await api.post("/upload/", fd, { timeout: VIDEO_TIMEOUT_MS });
      const videoUrl = data?.video_url ?? null;
      if (videoUrl) {
        setUrl(videoUrl);
        await api.put(`/social/events/${event.id}`, { video_url: videoUrl });
        await onRefresh();
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Video upload failed.");
    } finally {
      setUploading(false);
      if (videoRef.current) videoRef.current.value = "";
    }
  }

  async function removeVideo() {
    setUrl("");
    try {
      await api.put(`/social/events/${event.id}`, { video_url: "" });
      await onRefresh();
    } catch {}
  }

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        📹 Video
      </p>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube link or paste a video URL"
        />
        <button type="button" onClick={saveUrl} disabled={saving} className="btn-primary shrink-0 px-4 py-2 text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-400">or upload a video file:</span>
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          disabled={uploading}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {uploading ? "Uploading…" : "Upload video file"}
        </button>
        {url && (
          <button type="button" onClick={removeVideo} className="text-xs text-red-500 hover:underline">
            Remove video
          </button>
        )}
      </div>
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
    </div>
  );
}

// ─── Winners Section ──────────────────────────────────────────────────────────

function WinnersSection({ eventId, eventTitle, winners, onRefresh }) {
  const [form, setForm] = useState({ name: "", award: "", tier: "", active: true, image_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef(null);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [editError, setEditError] = useState("");
  const editImgRef = useRef(null);

  function startEdit(w) {
    setEditingId(w.id);
    setEditForm({ name: w.name || "", award: w.award || "", tier: w.tier || "", active: !!w.active, image_url: w.image_url || "" });
    setEditError("");
  }

  function cancelEdit() { setEditingId(null); setEditError(""); }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImageFile(file);
      if (url) setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Photo upload failed.");
    } finally { setUploading(false); if (imgRef.current) imgRef.current.value = ""; }
  }

  async function handleEditPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploading(true);
    setEditError("");
    try {
      const url = await uploadImageFile(file);
      if (url) setEditForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      setEditError(err?.response?.data?.message || err?.message || "Photo upload failed.");
    } finally { setEditUploading(false); if (editImgRef.current) editImgRef.current.value = ""; }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    if (!editForm.name.trim()) { setEditError("Name is required."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      await api.put(`/social/winners/${editingId}`, editForm);
      setEditingId(null);
      await onRefresh();
    } catch (err) {
      setEditError(err?.response?.data?.message || "Failed to save.");
    } finally { setEditSaving(false); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/social/winners", {
        ...form,
        social_event_id: eventId,
        event_name: eventTitle,
      });
      setForm({ name: "", award: "", tier: "", active: true, image_url: "" });
      await onRefresh();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to add winner.");
    } finally { setSaving(false); }
  }

  async function handleDelete(winnerId) {
    if (!confirm("Delete this winner?")) return;
    try { await api.delete(`/social/winners/${winnerId}`); await onRefresh(); } catch {}
  }

  const sortedWinners = [...(winners || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  async function handleMove(index, direction) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sortedWinners.length) return;
    const a = sortedWinners[index];
    const b = sortedWinners[swapIndex];
    // Use index positions directly so sort_order is always unique and meaningful
    try {
      await Promise.all([
        api.put(`/social/winners/${a.id}`, { sort_order: swapIndex }),
        api.put(`/social/winners/${b.id}`, { sort_order: index }),
      ]);
      await onRefresh();
    } catch {}
  }

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        🏆 Winners
      </p>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Winners list */}
      {sortedWinners.length > 0 && (
        <div className="mb-3 space-y-2">
          {sortedWinners.map((w, index) =>
            editingId === w.id ? (
              /* ── Inline edit form ── */
              <form
                key={w.id}
                onSubmit={handleEditSave}
                className="space-y-3 rounded-xl border border-[#0B3EAF]/30 bg-blue-50/40 p-3 dark:border-[#A7D344]/30 dark:bg-white/5"
              >
                {editError && <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>}

                {/* Photo row */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-amber-300 bg-slate-100 dark:bg-slate-800">
                    {resolvePublicMediaUrl(editForm.image_url) ? (
                      <img src={resolvePublicMediaUrl(editForm.image_url)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                        {editForm.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => editImgRef.current?.click()}
                    disabled={editUploading}
                    className="btn-secondary px-2.5 py-1 text-xs"
                  >
                    {editUploading ? "Uploading…" : "Change photo"}
                  </button>
                  {editForm.image_url && (
                    <button
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, image_url: "" }))}
                      className="text-xs text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                  <input ref={editImgRef} type="file" accept="image/*" className="hidden" onChange={handleEditPhotoUpload} />
                </div>

                {/* Name + Award */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Name *</label>
                    <input
                      className={inputCls}
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>What they won</label>
                    <input
                      className={inputCls}
                      value={editForm.award}
                      onChange={(e) => setEditForm((f) => ({ ...f, award: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Announce as <span className="font-normal text-slate-400">(optional)</span></label>
                  <TierPicker value={editForm.tier} onChange={(v) => setEditForm((f) => ({ ...f, tier: v }))} />
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={editForm.active}
                      onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                      className="h-4 w-4 rounded"
                    />
                    Show on portal
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={cancelEdit} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                    <button type="submit" disabled={editSaving || editUploading} className="btn-primary px-3 py-1.5 text-xs">
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              /* ── Winner row ── */
              <div
                key={w.id}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                  w.active
                    ? "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
                    : "border-dashed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/30"
                }`}
              >
                {/* Avatar */}
                <div className="relative h-10 w-10 shrink-0">
                  <div className="h-10 w-10 overflow-hidden rounded-full border border-amber-200 bg-slate-100 dark:bg-slate-800">
                    {resolvePublicMediaUrl(w.image_url) ? (
                      <img src={resolvePublicMediaUrl(w.image_url)} alt={w.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                        {w.name?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  {w.tier && (
                    <span className="absolute -bottom-1 -right-1 text-base leading-none">{TIER_ICON[w.tier]}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{w.name}</p>
                  <div className="flex items-center gap-1.5">
                    {w.tier && (
                      <span className="text-xs font-semibold text-[#0B3EAF] dark:text-[#A7D344]">
                        {TIER_ICON[w.tier]} {w.tier}
                      </span>
                    )}
                    {w.award && (
                      <span className="truncate text-xs text-slate-400">{w.tier ? "·" : ""} {w.award}</span>
                    )}
                  </div>
                </div>

                {!w.active && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">
                    Hidden
                  </span>
                )}
                {/* Move up/down */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:opacity-30 dark:border-slate-700"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === sortedWinners.length - 1}
                    className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:opacity-30 dark:border-slate-700"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(w)}
                  className="shrink-0 btn-secondary px-2.5 py-1 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(w.id)}
                  className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Add winner form */}
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Add winner
        </p>

        {/* Photo row */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-amber-300 bg-slate-100 dark:bg-slate-800">
            {resolvePublicMediaUrl(form.image_url) ? (
              <img src={resolvePublicMediaUrl(form.image_url)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base font-bold text-[#0B3EAF] dark:text-[#A7D344]">
                {form.name ? form.name[0].toUpperCase() : "?"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            disabled={uploading}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
          {form.image_url && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              Remove
            </button>
          )}
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </div>

        {/* Name + Award */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Winner name"
            />
          </div>
          <div>
            <label className={labelCls}>What they won</label>
            <input
              className={inputCls}
              value={form.award}
              onChange={(e) => setForm((f) => ({ ...f, award: e.target.value }))}
              placeholder="e.g. Best Chili, Most Creative…"
            />
          </div>
        </div>

        {/* Tier */}
        <div>
          <label className={labelCls}>Announce as <span className="font-normal text-slate-400">(optional)</span></label>
          <TierPicker value={form.tier} onChange={(v) => setForm((f) => ({ ...f, tier: v }))} />
        </div>

        {/* Active + Submit */}
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            Show on portal
          </label>
          <button
            type="submit"
            disabled={saving || uploading}
            className="btn-primary ml-auto px-4 py-2 text-sm"
          >
            {saving ? "Adding…" : "Add winner"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Event Card (always-expanded management) ──────────────────────────────────

function EventCard({ event, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    title:       event.title,
    event_date:  event.event_date  || "",
    description: event.description || "",
    published:   event.published,
  });
  const [saving, setSaving]     = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!editing) {
      setEditData({
        title:       event.title,
        event_date:  event.event_date  || "",
        description: event.description || "",
        published:   event.published,
      });
    }
  }, [event.title, event.event_date, event.description, event.published, editing]);

  async function handleDelete() {
    if (!confirm(`Delete "${event.title}"? All gallery images for this event will also be removed.`)) return;
    try { await api.delete(`/social/events/${event.id}`); await onRefresh(); } catch {}
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editData.title.trim()) { setEditError("Title is required."); return; }
    setSaving(true);
    setEditError("");
    try {
      await api.put(`/social/events/${event.id}`, editData);
      setEditing(false);
      await onRefresh();
    } catch (err) {
      setEditError(err?.response?.data?.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  const newImgCount  = (event.images  || []).filter((i) => i.id > 0).length;
  const winnerCount  = (event.winners || []).length;

  return (
    <div className="card divide-y divide-slate-100 dark:divide-slate-800">

      {/* ── Header / edit form ── */}
      <div className="pb-5">
        {editing ? (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Title *</label>
                <input
                  className={inputCls}
                  value={editData.title}
                  onChange={(e) => setEditData((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls}>Event date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={editData.event_date}
                  onChange={(e) => setEditData((d) => ({ ...d, event_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                className={`${inputCls} min-h-16 resize-y`}
                value={editData.description}
                onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={editData.published}
                  onChange={(e) => setEditData((d) => ({ ...d, published: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Published
              </label>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setEditError(""); }}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary px-3 py-1.5 text-xs">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-900 dark:text-white">{event.title}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    event.published
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {event.published ? "Published" : "Draft"}
                </span>
                {newImgCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                    🖼 {newImgCount} image{newImgCount !== 1 ? "s" : ""}
                  </span>
                )}
                {event.video_url && (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                    📹 Video
                  </span>
                )}
                {winnerCount > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                    🏆 {winnerCount} winner{winnerCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {event.event_date && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(event.event_date + "T12:00:00").toLocaleDateString(undefined, {
                    month: "long", day: "numeric", year: "numeric",
                  })}
                </p>
              )}
              {event.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                  {event.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className="btn-secondary px-2.5 py-1 text-xs">
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Always-visible management sections ── */}
      {!editing && (
        <div className="space-y-6 pt-5">
          <ImagesSection eventId={event.id} images={event.images || []} onRefresh={onRefresh} />
          <VideoSection  event={event} onRefresh={onRefresh} />
          <WinnersSection
            eventId={event.id}
            eventTitle={event.title}
            winners={event.winners || []}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

// ─── Create Event Form ────────────────────────────────────────────────────────

function CreateEventForm({ onCreated }) {
  const [form, setForm] = useState({ title: "", event_date: "", description: "", published: true });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/social/events", form);
      setForm({ title: "", event_date: "", description: "", published: true });
      await onCreated();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create event.");
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">+ Create New Event</h2>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Title *</label>
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Cook-Off 2025"
            />
          </div>
          <div>
            <label className={labelCls}>Event date</label>
            <input
              type="date"
              className={inputCls}
              value={form.event_date}
              onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea
            className={`${inputCls} min-h-14 resize-y`}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Brief description of the event…"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            Published
          </label>
          <button type="submit" disabled={saving} className="btn-primary ml-auto px-4 py-2 text-sm">
            {saving ? "Creating…" : "Create event"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSocialCommitteePage() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    try {
      const r = await api.get("/social/events");
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Social Committee Admin</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Create events and manage gallery photos, video, and winners (🥇🥈🥉) per event.
        </p>
      </div>

      <CreateEventForm onCreated={loadEvents} />

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="card py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No events yet — create one above.
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} onRefresh={loadEvents} />
          ))}
        </div>
      )}
    </main>
  );
}
