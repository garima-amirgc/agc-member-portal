import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function emptyQuestion() {
  return {
    id: `q_${Math.random().toString(16).slice(2, 10)}`,
    type: "radio", // radio | multiselect | text
    label: "",
    required: true,
    options: [
      { id: "opt_1", label: "Option 1" },
      { id: "opt_2", label: "Option 2" },
    ],
  };
}

function normalizeDefinition(def) {
  const d = def && typeof def === "object" ? def : {};
  const qs = Array.isArray(d.questions) ? d.questions : [];
  return {
    schema_version: 1,
    questions: qs
      .map((q) => ({
        id: String(q?.id || "").trim() || `q_${Math.random().toString(16).slice(2, 10)}`,
        type: q?.type === "multiselect" || q?.type === "text" ? q.type : "radio",
        label: String(q?.label || ""),
        required: q?.required !== false,
        options: Array.isArray(q?.options)
          ? q.options.map((o) => ({ id: String(o?.id || ""), label: String(o?.label || "") }))
          : [],
      }))
      .filter((q) => q.id),
  };
}

function toLocalDatetimeInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalDatetimeInputValue(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AdminPollsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null); // { id?, title, description, active, definition }
  const isEditingExisting = useMemo(() => Boolean(editing && editing.id), [editing]);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerFile, setBannerFile] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/admin/polls")
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(friendlyErrorMessage(e, "Could not load polls.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing({
      title: "New poll",
      description: "",
      active: true,
      start_at: "",
      end_at: "",
      banner_image_url: "",
      definition: { schema_version: 1, questions: [emptyQuestion()] },
    });
    setBannerFile(null);
  };

  const openEdit = async (id) => {
    setError("");
    try {
      const { data } = await api.get(`/admin/polls/${id}`);
      setEditing({
        id: data.id,
        title: data.title || "",
        description: data.description || "",
        active: Number(data.active) === 1,
        start_at: toLocalDatetimeInputValue(data.start_at),
        end_at: toLocalDatetimeInputValue(data.end_at),
        banner_image_url: data.banner_image_url || "",
        definition: normalizeDefinition(data.definition),
      });
      setBannerFile(null);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load poll."));
    }
  };

  const save = async () => {
    if (!editing) return;
    const title = String(editing.title || "").trim();
    if (!title) {
      window.alert("Title is required.");
      return;
    }
    const def = normalizeDefinition(editing.definition);
    for (const q of def.questions) {
      if (!String(q.label || "").trim()) {
        window.alert("Every question needs a label.");
        return;
      }
      if ((q.type === "radio" || q.type === "multiselect") && (!Array.isArray(q.options) || q.options.length < 2)) {
        window.alert("Radio / multiselect questions need at least 2 options.");
        return;
      }
      if (q.type === "radio" || q.type === "multiselect") {
        for (const o of q.options) {
          if (!String(o.label || "").trim()) {
            window.alert("Every option needs a label.");
            return;
          }
        }
      }
    }

    const payload = {
      title,
      description: editing.description || "",
      active: Boolean(editing.active),
      start_at: fromLocalDatetimeInputValue(editing.start_at),
      end_at: fromLocalDatetimeInputValue(editing.end_at),
      banner_image_url: String(editing.banner_image_url || "").trim() || null,
      definition: def,
    };
    try {
      if (isEditingExisting) {
        await api.put(`/admin/polls/${editing.id}`, payload);
      } else {
        await api.post("/admin/polls", payload);
      }
      setEditing(null);
      load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not save poll."));
    }
  };

  const uploadBanner = async () => {
    if (!bannerFile) {
      window.alert("Choose an image first.");
      return;
    }
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", bannerFile);
      const { data } = await api.post("/upload/poll-banner", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      const url = data?.image_url || "";
      if (!url) throw new Error("Upload did not return image_url.");
      setEditing((e) => (e ? { ...e, banner_image_url: url } : e));
      setBannerFile(null);
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not upload banner."));
    } finally {
      setBannerUploading(false);
    }
  };

  const activate = async (id) => {
    try {
      await api.post(`/admin/polls/${id}/activate`, {});
      load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not activate poll."));
    }
  };

  const reset = async (id) => {
    if (!window.confirm("Reset this poll for all users?\n\nThis will make the popup show again until each user submits.")) return;
    try {
      await api.post(`/admin/polls/${id}/reset`, {});
      load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not reset poll."));
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this poll?")) return;
    try {
      await api.delete(`/admin/polls/${id}`);
      load();
    } catch (e) {
      window.alert(friendlyErrorMessage(e, "Could not delete poll."));
    }
  };

  const exportSubmissionsExcel = async (pollId, title) => {
    try {
      const res = await api.get(`/admin/polls/${pollId}/submissions/export`, { responseType: "blob" });
      const blob = res.data;
      const ct = String(res.headers["content-type"] || "");
      if (ct.includes("application/json")) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          window.alert(j.message || "Export failed.");
        } catch {
          window.alert("Export failed.");
        }
        return;
      }
      let filename = `${String(title || "poll").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 72) || "poll"}_submissions.xlsx`;
      const cd = res.headers["content-disposition"];
      if (cd) {
        const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
        if (m) {
          const raw = decodeURIComponent(String(m[1] || m[2] || "").trim());
          if (raw) filename = raw;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      let msg = friendlyErrorMessage(e, "Could not export submissions.");
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text);
          if (j?.message) msg = j.message;
        } catch {
          /* keep msg */
        }
      }
      window.alert(msg);
    }
  };

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Feedback & polls" />
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Polls</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-outline" onClick={load} disabled={loading}>
                Refresh
              </button>
              <button type="button" className="btn-primary" onClick={openNew}>
                New poll
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-portal border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
          ) : list.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">No polls yet.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-portal border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/20"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{p.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {Number(p.active) === 1 ? "Active" : "Inactive"} · Updated{" "}
                      {p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}
                    </div>
                    {p.start_at || p.end_at ? (
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Window:{" "}
                        {p.start_at ? new Date(p.start_at).toLocaleString() : "now"} →{" "}
                        {p.end_at ? new Date(p.end_at).toLocaleString() : "no end"}
                      </div>
                    ) : null}
                    {p.banner_image_url ? (
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Banner: yes</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-outline" onClick={() => openEdit(p.id)}>
                      Edit
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => activate(p.id)} disabled={Number(p.active) === 1}>
                      Set active
                    </button>
                    <button type="button" className="btn-outline" onClick={() => reset(p.id)}>
                      Reset users
                    </button>
                    <button type="button" className="btn-outline" onClick={() => exportSubmissionsExcel(p.id, p.title)}>
                      Export Excel
                    </button>
                    <button type="button" className="btn-danger" onClick={() => remove(p.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editing ? (
          <div className="agc-form card mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {isEditingExisting ? "Edit poll" : "New poll"}
              </div>
              <div className="flex flex-wrap gap-2">
                {isEditingExisting ? (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => exportSubmissionsExcel(editing.id, editing.title)}
                  >
                    Export Excel
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                  Close
                </button>
                <button type="button" className="btn-primary" onClick={save}>
                  Save
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Title
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Description (optional)
                </div>
                <textarea
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  rows={3}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.active)}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Set active after save (multiple polls can be active at once)
              </label>

              <div className="rounded-portal border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Schedule popup (optional)</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Start date/time
                    </div>
                    <input
                      type="datetime-local"
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={editing.start_at || ""}
                      onChange={(e) => setEditing({ ...editing, start_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      End date/time
                    </div>
                    <input
                      type="datetime-local"
                      className="w-full rounded border p-2 dark:bg-slate-700"
                      value={editing.end_at || ""}
                      onChange={(e) => setEditing({ ...editing, end_at: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-portal border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Banner image (optional)</div>
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Image URL (https://… or /uploads/…)
                  </div>
                  <input
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    value={editing.banner_image_url || ""}
                    onChange={(e) => setEditing({ ...editing, banner_image_url: e.target.value })}
                    placeholder="https://… or /uploads/…"
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,auto] sm:items-end">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        Upload banner image
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        onChange={(e) => setBannerFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                        disabled={bannerUploading}
                        className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={uploadBanner}
                      disabled={bannerUploading || !bannerFile}
                    >
                      {bannerUploading ? "Uploading…" : "Upload"}
                    </button>
                  </div>

                  {editing.banner_image_url ? (
                    <div className="mt-3 overflow-hidden rounded-portal border border-slate-200 dark:border-slate-700">
                      <img
                        src={resolvePublicMediaUrl(editing.banner_image_url)}
                        alt=""
                        className="h-32 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-portal border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Questions</div>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      const next = normalizeDefinition(editing.definition);
                      next.questions.push(emptyQuestion());
                      setEditing({ ...editing, definition: next });
                    }}
                  >
                    Add question
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {normalizeDefinition(editing.definition).questions.map((q, idx) => (
                    <div key={q.id} className="rounded-portal border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">Q{idx + 1}</div>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => {
                            const next = normalizeDefinition(editing.definition);
                            next.questions = next.questions.filter((x) => x.id !== q.id);
                            setEditing({ ...editing, definition: next });
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            Label
                          </div>
                          <input
                            className="w-full rounded border p-2 dark:bg-slate-700"
                            value={q.label}
                            onChange={(e) => {
                              const next = normalizeDefinition(editing.definition);
                              next.questions = next.questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x));
                              setEditing({ ...editing, definition: next });
                            }}
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            Type
                          </div>
                          <select
                            className="w-full rounded border p-2 dark:bg-slate-700"
                            value={q.type}
                            onChange={(e) => {
                              const t = e.target.value;
                              const next = normalizeDefinition(editing.definition);
                              next.questions = next.questions.map((x) =>
                                x.id === q.id
                                  ? {
                                      ...x,
                                      type: t === "multiselect" || t === "text" ? t : "radio",
                                      options:
                                        t === "text"
                                          ? []
                                          : Array.isArray(x.options) && x.options.length >= 2
                                            ? x.options
                                            : [
                                                { id: "opt_1", label: "Option 1" },
                                                { id: "opt_2", label: "Option 2" },
                                              ],
                                    }
                                  : x
                              );
                              setEditing({ ...editing, definition: next });
                            }}
                          >
                            <option value="radio">Radio (single choice)</option>
                            <option value="multiselect">Multi-select</option>
                            <option value="text">Text</option>
                          </select>
                        </div>
                      </div>

                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={q.required !== false}
                          onChange={(e) => {
                            const next = normalizeDefinition(editing.definition);
                            next.questions = next.questions.map((x) => (x.id === q.id ? { ...x, required: e.target.checked } : x));
                            setEditing({ ...editing, definition: next });
                          }}
                        />
                        Required
                      </label>

                      {q.type === "radio" || q.type === "multiselect" ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                              Options
                            </div>
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => {
                                const next = normalizeDefinition(editing.definition);
                                next.questions = next.questions.map((x) =>
                                  x.id === q.id
                                    ? {
                                        ...x,
                                        options: [
                                          ...(Array.isArray(x.options) ? x.options : []),
                                          { id: `opt_${Date.now()}`, label: "New option" },
                                        ],
                                      }
                                    : x
                                );
                                setEditing({ ...editing, definition: next });
                              }}
                            >
                              Add option
                            </button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {(q.options || []).map((o) => (
                              <div key={o.id} className="flex items-center gap-2">
                                <input
                                  className="w-full rounded border p-2 text-sm dark:bg-slate-700"
                                  value={o.label}
                                  onChange={(e) => {
                                    const next = normalizeDefinition(editing.definition);
                                    next.questions = next.questions.map((x) =>
                                      x.id === q.id
                                        ? {
                                            ...x,
                                            options: (x.options || []).map((oo) =>
                                              oo.id === o.id ? { ...oo, label: e.target.value } : oo
                                            ),
                                          }
                                        : x
                                    );
                                    setEditing({ ...editing, definition: next });
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn-danger"
                                  onClick={() => {
                                    const next = normalizeDefinition(editing.definition);
                                    next.questions = next.questions.map((x) =>
                                      x.id === q.id ? { ...x, options: (x.options || []).filter((oo) => oo.id !== o.id) } : x
                                    );
                                    setEditing({ ...editing, definition: next });
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
    </main>
  );
}

