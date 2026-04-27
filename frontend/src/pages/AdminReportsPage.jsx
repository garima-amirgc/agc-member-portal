import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];

const EMPTY = {
  title: "",
  description: "",
  business_units: ["AGC"],
  iframe_code: "",
  sort_order: 0,
  allowed_user_ids: [],
};

function extractSrcPreview(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) && !s.includes("<")) return s;
  const m = /src\s*=\s*["']([^"']+)["']/i.exec(s);
  return m?.[1] ? String(m[1]).trim() : "";
}

function normalizeFacilities(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const cleaned = list.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean);
  const uniq = [...new Set(cleaned)].filter((x) => FACILITIES.includes(x));
  return uniq.length ? uniq : ["AGC"];
}

function normalizeUserIds(arr) {
  const raw = Array.isArray(arr) ? arr : [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // { ...row, iframe_code }
  const [savingId, setSavingId] = useState(null);
  const [userQuery, setUserQuery] = useState("");
  const [editUserQuery, setEditUserQuery] = useState("");

  const load = () => {
    setLoading(true);
    return Promise.all([api.get("/reports/admin/all"), api.get("/users")])
      .then(([reportsRes, usersRes]) => {
        setRows(Array.isArray(reportsRes.data) ? reportsRes.data : []);
        setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      })
      .catch(() => {
        setRows([]);
        setUsers([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const previewSrc = useMemo(() => extractSrcPreview(form.iframe_code), [form.iframe_code]);
  const editPreviewSrc = useMemo(
    () => (editing ? extractSrcPreview(editing.iframe_code) || editing.embed_src || "" : ""),
    [editing]
  );

  const create = async (e) => {
    e.preventDefault();
    if (!String(form.title || "").trim()) {
      window.alert("Title is required.");
      return;
    }
    if (!Array.isArray(form.allowed_user_ids) || form.allowed_user_ids.length === 0) {
      window.alert("Select at least one user under Access control.");
      return;
    }
    if (!extractSrcPreview(form.iframe_code)) {
      window.alert("Paste a Power BI iframe embed code or a direct embed URL.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/reports", {
        title: form.title.trim(),
        description: form.description ?? "",
        business_units: normalizeFacilities(form.business_units),
        iframe_code: form.iframe_code,
        sort_order: Number(form.sort_order) || 0,
        allowed_user_ids: normalizeUserIds(form.allowed_user_ids),
      });
      setForm(EMPTY);
      await load();
      window.alert("Report added.");
    } catch (err) {
      const st = err.response?.status;
      const msg = friendlyErrorMessage(err, "Create failed.");
      window.alert(st ? `Create failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (r) => {
    setEditing({
      ...r,
      business_units: normalizeFacilities(r.business_units),
      iframe_code: r.embed_src || "",
      sort_order: Number(r.sort_order) || 0,
      allowed_user_ids: normalizeUserIds(r.allowed_user_ids),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!String(editing.title || "").trim()) {
      window.alert("Title is required.");
      return;
    }
    if (!Array.isArray(editing.allowed_user_ids) || editing.allowed_user_ids.length === 0) {
      window.alert("Select at least one user under Access control.");
      return;
    }
    const src = extractSrcPreview(editing.iframe_code) || String(editing.embed_src || "").trim();
    if (!src) {
      window.alert("Paste a Power BI iframe embed code or URL.");
      return;
    }
    setSavingId(editing.id);
    try {
      await api.put(`/reports/${editing.id}`, {
        title: editing.title.trim(),
        description: editing.description ?? "",
        business_units: normalizeFacilities(editing.business_units),
        iframe_code: editing.iframe_code,
        sort_order: Number(editing.sort_order) || 0,
        allowed_user_ids: normalizeUserIds(editing.allowed_user_ids),
      });
      setEditing(null);
      await load();
      window.alert("Saved.");
    } catch (err) {
      const st = err.response?.status;
      const msg = friendlyErrorMessage(err, "Save failed.");
      window.alert(st ? `Save failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete report "${r.title}"?`)) return;
    setSavingId(r.id);
    try {
      await api.delete(`/reports/${r.id}`);
      await load();
    } catch (err) {
      const st = err.response?.status;
      const msg = friendlyErrorMessage(err, "Delete failed.");
      window.alert(st ? `Delete failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = String(userQuery || "").trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name || ""} ${u.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, userQuery]);

  const filteredEditUsers = useMemo(() => {
    const q = String(editUserQuery || "").trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name || ""} ${u.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, editUserQuery]);

  return (
    <>
      <PageHeader
        title="Manage reports"
        subtitle="Add Power BI embed links and control which facilities can see them."
      />
      <main className={PAGE_SHELL}>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-2 text-lg font-semibold">Add report</h2>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Paste the <strong className="font-semibold">iframe embed code</strong> from Power BI (or just the embed URL). We store only the iframe <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">src</code> for safety.
            </p>
            <form className="agc-form space-y-3" onSubmit={create}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title</label>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  disabled={creating}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Description (optional)</label>
                <textarea
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={creating}
                />
              </div>
              <div className="rounded border p-3 dark:border-slate-700">
                <div className="mb-2 text-sm font-medium">Visible to facilities</div>
                <div className="flex flex-wrap gap-3">
                  {FACILITIES.map((f) => {
                    const checked = (form.business_units || []).includes(f);
                    return (
                      <label key={f} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = new Set(form.business_units || []);
                            if (current.has(f)) current.delete(f);
                            else current.add(f);
                            setForm({ ...form, business_units: Array.from(current) });
                          }}
                          disabled={creating}
                        />
                        {f}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Users only see reports that match their facility access.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sort order</label>
                  <input
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    disabled={creating}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Detected embed src</label>
                  <input
                    className="w-full rounded border p-2 text-xs dark:bg-slate-700"
                    value={previewSrc}
                    readOnly
                  />
                </div>
              </div>

              <div className="rounded border p-3 dark:border-slate-700">
                <div className="mb-1 text-sm font-medium">Access control (required)</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select at least one user. Until a user is assigned, this report will be <strong className="font-semibold">hidden</strong> in the portal.
                  Facility selection above only controls where the report appears.
                </p>
                <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">Search users</label>
                <input
                  className="mt-1 w-full rounded border p-2 text-sm dark:bg-slate-700"
                  placeholder="Search by name or email…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  disabled={creating}
                />
                <div className="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-white/50 p-2 dark:border-slate-700 dark:bg-slate-900/20">
                  {filteredUsers.length === 0 ? (
                    <div className="p-2 text-xs text-slate-500 dark:text-slate-400">No users match.</div>
                  ) : (
                    <div className="space-y-1">
                      {filteredUsers.map((u) => {
                        const checked = (form.allowed_user_ids || []).includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/70 dark:hover:bg-white/5"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const current = new Set(form.allowed_user_ids || []);
                                if (current.has(u.id)) current.delete(u.id);
                                else current.add(u.id);
                                setForm({ ...form, allowed_user_ids: Array.from(current) });
                              }}
                              disabled={creating}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900 dark:text-white">{u.name}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Selected: <span className="font-semibold">{(form.allowed_user_ids || []).length}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Power BI iframe code or URL</label>
                <textarea
                  className="w-full rounded border p-2 font-mono text-xs dark:bg-slate-700"
                  rows={6}
                  placeholder={'<iframe title="..." width="..." height="..." src="https://app.powerbi.com/..." frameborder="0" allowFullScreen="true"></iframe>'}
                  value={form.iframe_code}
                  onChange={(e) => setForm({ ...form, iframe_code: e.target.value })}
                  disabled={creating}
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={creating}>
                {creating ? "Adding…" : "Add report"}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Existing reports</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  These show up under <strong className="font-semibold">Reports</strong> in the left nav.
                </p>
              </div>
              <button type="button" className="btn-outline" onClick={load} disabled={loading}>
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">No reports yet.</div>
            ) : (
              <div className="mt-4 space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-portal border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/20">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{r.title}</div>
                        {r.description ? (
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{r.description}</div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(Array.isArray(r.business_units) ? r.business_units : []).map((bu) => (
                            <span
                              key={bu}
                              className="rounded-full bg-brand-blue-soft px-2 py-0.5 text-[11px] font-bold text-brand-blue dark:bg-white/10 dark:text-brand-green"
                            >
                              {bu}
                            </span>
                          ))}
                          {Array.isArray(r.allowed_user_ids) && r.allowed_user_ids.length > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                              Restricted
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {r.embed_src}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <button type="button" className="btn-outline px-3 py-1 text-xs" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-danger px-3 py-1 text-xs"
                          disabled={savingId === r.id}
                          onClick={() => remove(r)}
                        >
                          {savingId === r.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
            <div className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-700">
                <div>
                  <h3 className="text-lg font-semibold">Edit report</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">ID: {editing.id}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title</label>
                      <input
                        className="w-full rounded border p-2 dark:bg-slate-700"
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
                      <textarea
                        className="w-full rounded border p-2 dark:bg-slate-700"
                        rows={3}
                        value={editing.description || ""}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      />
                    </div>
                    <div className="rounded border p-3 dark:border-slate-700">
                      <div className="mb-2 text-sm font-medium">Visible to facilities</div>
                      <div className="flex flex-wrap gap-3">
                        {FACILITIES.map((f) => {
                          const checked = (editing.business_units || []).includes(f);
                          return (
                            <label key={f} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const current = new Set(editing.business_units || []);
                                  if (current.has(f)) current.delete(f);
                                  else current.add(f);
                                  setEditing({ ...editing, business_units: Array.from(current) });
                                }}
                              />
                              {f}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sort order</label>
                        <input
                          className="w-full rounded border p-2 dark:bg-slate-700"
                          type="number"
                          value={editing.sort_order}
                          onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Detected embed src</label>
                        <input
                          className="w-full rounded border p-2 text-xs dark:bg-slate-700"
                          value={editPreviewSrc}
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="rounded border p-3 dark:border-slate-700">
                      <div className="mb-1 text-sm font-medium">Access control (required)</div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Select at least one user. Until a user is assigned, this report will be <strong className="font-semibold">hidden</strong> in the portal.
                        Facility selection only controls where the report appears.
                      </p>
                      <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">Search users</label>
                      <input
                        className="mt-1 w-full rounded border p-2 text-sm dark:bg-slate-700"
                        placeholder="Search by name or email…"
                        value={editUserQuery}
                        onChange={(e) => setEditUserQuery(e.target.value)}
                      />
                      <div className="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-white/50 p-2 dark:border-slate-700 dark:bg-slate-900/20">
                        {filteredEditUsers.length === 0 ? (
                          <div className="p-2 text-xs text-slate-500 dark:text-slate-400">No users match.</div>
                        ) : (
                          <div className="space-y-1">
                            {filteredEditUsers.map((u) => {
                              const checked = (editing.allowed_user_ids || []).includes(u.id);
                              return (
                                <label
                                  key={u.id}
                                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/70 dark:hover:bg-white/5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const current = new Set(editing.allowed_user_ids || []);
                                      if (current.has(u.id)) current.delete(u.id);
                                      else current.add(u.id);
                                      setEditing({ ...editing, allowed_user_ids: Array.from(current) });
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-slate-900 dark:text-white">{u.name}</span>
                                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        Selected: <span className="font-semibold">{(editing.allowed_user_ids || []).length}</span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Power BI iframe code or URL</label>
                      <textarea
                        className="w-full rounded border p-2 font-mono text-xs dark:bg-slate-700"
                        rows={7}
                        value={editing.iframe_code || ""}
                        onChange={(e) => setEditing({ ...editing, iframe_code: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Preview
                    </div>
                    <div className="overflow-hidden rounded-portal border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                      <div className="aspect-[16/9] w-full">
                        {editPreviewSrc ? (
                          <iframe
                            title={String(editing.title || "Report")}
                            src={editPreviewSrc}
                            className="h-full w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            allowFullScreen
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center p-4 text-sm text-slate-600 dark:text-slate-300">
                            Paste an iframe code or URL to preview.
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      If preview is blank, Power BI embed may require permissions or a different link type.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/40">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={savingId === editing.id}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={saveEdit}
                  disabled={savingId === editing.id}
                >
                  {savingId === editing.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

