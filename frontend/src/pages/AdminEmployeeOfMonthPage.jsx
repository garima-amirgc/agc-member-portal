import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";
import { PAGE_SHELL } from "../constants/pageLayout";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

const UPLOAD_IMAGE_TIMEOUT_MS = 3 * 60 * 1000;
const OTHER_EMPLOYEE_VALUE = "other";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const fieldLabel = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";
const fieldInput =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-brand-green dark:focus:ring-brand-green/20";

function emptyForm() {
  const now = new Date();
  return {
    user_id: "",
    manual_name: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    citation: "",
    image_url: "",
    published: true,
  };
}

export default function AdminEmployeeOfMonthPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, entriesRes] = await Promise.all([
        api.get("/employee-of-month/user-picker"),
        api.get("/employee-of-month"),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load Employee of the Month."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [users]
  );

  const isManualEmployee = form.user_id === OTHER_EMPLOYEE_VALUE;

  const periodGroups = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const key = `${entry.year}-${entry.month}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    for (const group of map.values()) {
      group.sort(
        (a, b) =>
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
          Number(b.id) - Number(a.id)
      );
    }
    return map;
  }, [entries]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
  };

  const startEdit = (entry) => {
    const manual = entry.is_manual || !entry.user_id;
    setEditId(entry.id);
    setForm({
      user_id: manual ? OTHER_EMPLOYEE_VALUE : String(entry.user_id || ""),
      manual_name: manual ? entry.manual_name || entry.employee?.name || "" : "",
      year: Number(entry.year) || new Date().getFullYear(),
      month: Number(entry.month) || new Date().getMonth() + 1,
      citation: entry.citation || "",
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
    if (isManualEmployee) {
      if (!String(form.manual_name || "").trim()) {
        window.alert("Please enter the employee name.");
        return;
      }
    } else if (!form.user_id) {
      window.alert("Please select an employee.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        user_id: isManualEmployee ? OTHER_EMPLOYEE_VALUE : Number(form.user_id),
        manual_name: isManualEmployee ? String(form.manual_name || "").trim() : null,
        year: Number(form.year),
        month: Number(form.month),
        citation: form.citation,
        image_url: form.image_url?.trim() || null,
        published: form.published,
      };
      if (editId) {
        await api.put(`/employee-of-month/${editId}`, payload);
      } else {
        await api.post("/employee-of-month", payload);
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
    if (!window.confirm(`Remove ${entry.period_label} — ${entry.employee?.name || "employee"}?`)) return;
    try {
      await api.delete(`/employee-of-month/${entry.id}`);
      if (editId === entry.id) resetForm();
      await load();
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not delete entry."));
    }
  };

  const onMove = async (entry, direction) => {
    try {
      const { data } = await api.post(`/employee-of-month/${entry.id}/move`, { direction });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      window.alert(friendlyErrorMessage(err, "Could not reorder entry."));
    }
  };

  const periodSiblings = (entry) => periodGroups.get(`${entry.year}-${entry.month}`) || [];
  const periodIndex = (entry) => periodSiblings(entry).findIndex((item) => item.id === entry.id);

  return (
    <main className={PAGE_SHELL}>
      <PageHeader title="Employee of the Month" />
      <DashboardAssignmentNotice user={user} />

      <div className="card space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="md:col-span-2">
            <label className={fieldLabel} htmlFor="eom-user">
              Employee
            </label>
            <select
              id="eom-user"
              className={fieldInput}
              value={form.user_id}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({
                  ...f,
                  user_id: value,
                  manual_name: value === OTHER_EMPLOYEE_VALUE ? f.manual_name : "",
                }));
              }}
            >
              <option value="">Select employee…</option>
              <option value={OTHER_EMPLOYEE_VALUE}>Other (not in portal)</option>
              {sortedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {isManualEmployee ? (
            <div className="md:col-span-2">
              <label className={fieldLabel} htmlFor="eom-manual-name">
                Employee name
              </label>
              <input
                id="eom-manual-name"
                type="text"
                className={fieldInput}
                value={form.manual_name}
                onChange={(e) => setForm((f) => ({ ...f, manual_name: e.target.value }))}
                placeholder="Full name…"
                required
              />
            </div>
          ) : null}

          <div>
            <label className={fieldLabel} htmlFor="eom-year">
              Year
            </label>
            <input
              id="eom-year"
              type="number"
              min={2000}
              max={2100}
              className={fieldInput}
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="eom-month">
              Month
            </label>
            <select
              id="eom-month"
              className={fieldInput}
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
              required
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel}>Photo</label>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {isManualEmployee
                ? "Upload a spotlight photo for the home page."
                : "Upload a spotlight photo for the home page. If omitted, their profile photo is used."}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 sm:h-32 sm:w-32 sm:shrink-0">
                {form.image_url ? (
                  <img
                    src={resolvePublicMediaUrl(form.image_url)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
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

          <div className="md:col-span-2">
            <label className={fieldLabel} htmlFor="eom-citation">
              Recognition note (optional)
            </label>
            <textarea
              id="eom-citation"
              className={`${fieldInput} min-h-[96px]`}
              value={form.citation}
              onChange={(e) => setForm((f) => ({ ...f, citation: e.target.value }))}
              placeholder="Why this person was recognized…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
            />
            Published on home page
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : editId ? "Update entry" : "Add Employee of the Month"}
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
                  <th className="px-2 py-2">Period</th>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Published</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const siblings = periodSiblings(entry);
                  const indexInPeriod = periodIndex(entry);
                  const canSort = siblings.length > 1;
                  return (
                  <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-3">
                      {canSort ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
                            disabled={indexInPeriod === 0}
                            onClick={() => onMove(entry, "up")}
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
                            disabled={indexInPeriod >= siblings.length - 1}
                            onClick={() => onMove(entry, "down")}
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 font-medium">{entry.period_label}</td>
                    <td className="px-2 py-3">
                      {entry.employee?.name || "—"}
                      {entry.is_manual ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Other
                        </span>
                      ) : null}
                    </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
