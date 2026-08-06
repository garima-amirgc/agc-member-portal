import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant } from "../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../constants/adminGrants";

const EMPTY_FORM = {
  name: "",
  asset_tag: "",
  category: "Other",
  business_unit: "AGC",
  status: "available",
  condition: "good",
  assigned_to: "",
  serial_number: "",
  location: "",
  purchase_date: "",
  purchase_cost: "",
  notes: "",
};

const FALLBACK_CATEGORIES = ["Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Vehicle", "Tool", "Machinery", "Furniture", "Other"];
const FALLBACK_BUSINESS_UNITS = ["AGC", "AQM", "SCF", "ASP"];
const FALLBACK_STATUSES = ["available", "assigned", "maintenance", "retired"];
const FALLBACK_CONDITIONS = ["new", "good", "fair", "poor"];

function statusBadgeClass(status) {
  switch (status) {
    case "assigned":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "maintenance":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "retired":
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
  }
}

function statusLabel(status) {
  const map = { available: "Available", assigned: "Assigned", maintenance: "Maintenance", retired: "Retired" };
  return map[status] || status;
}

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const FIELD_SM = "rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900";

export default function AssetsPage() {
  const { user } = useAuth();
  const canManage = hasAdminGrant(user, ADMIN_GRANT_KEYS.ASSET_TRACKER);

  const [myAssets, setMyAssets] = useState([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const [allAssets, setAllAssets] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadingAll, setLoadingAll] = useState(canManage);

  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterBu, setFilterBu] = useState("");
  const [query, setQuery] = useState("");

  const loadMine = async () => {
    setLoadingMine(true);
    try {
      const { data } = await api.get("/assets/me");
      setMyAssets(Array.isArray(data) ? data : []);
    } catch {
      setMyAssets([]);
    } finally {
      setLoadingMine(false);
    }
  };

  const loadAll = async () => {
    if (!canManage) return;
    setLoadingAll(true);
    try {
      const [assetsRes, usersRes, metaRes] = await Promise.all([
        api.get("/assets"),
        api.get("/assets/assignable-users"),
        api.get("/assets/meta"),
      ]);
      setAllAssets(Array.isArray(assetsRes.data) ? assetsRes.data : []);
      setAssignableUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setMeta(metaRes.data || null);
    } catch {
      setAllAssets([]);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    void loadMine();
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = meta?.categories?.length ? meta.categories : FALLBACK_CATEGORIES;
  const businessUnits = meta?.business_units?.length ? meta.business_units : FALLBACK_BUSINESS_UNITS;
  const statuses = meta?.statuses?.length ? meta.statuses : FALLBACK_STATUSES;
  const conditions = meta?.conditions?.length ? meta.conditions : FALLBACK_CONDITIONS;

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAssets.filter((a) => {
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterBu && a.business_unit !== filterBu) return false;
      if (!q) return true;
      return (
        String(a.name || "").toLowerCase().includes(q) ||
        String(a.asset_tag || "").toLowerCase().includes(q) ||
        String(a.serial_number || "").toLowerCase().includes(q) ||
        String(a.assigned_to_name || "").toLowerCase().includes(q)
      );
    });
  }, [allAssets, filterStatus, filterBu, query]);

  const resetForm = () => setForm(EMPTY_FORM);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Asset name is required.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/assets", {
        ...form,
        asset_tag: form.asset_tag.trim() || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        purchase_cost: form.purchase_cost !== "" ? Number(form.purchase_cost) : null,
      });
      resetForm();
      await Promise.all([loadAll(), loadMine()]);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not create asset."));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (asset) => {
    setEditingId(asset.id);
    setEditForm({
      ...asset,
      assigned_to: asset.assigned_to != null ? String(asset.assigned_to) : "",
      purchase_cost: asset.purchase_cost != null ? String(asset.purchase_cost) : "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setError("");
    setSavingId(editForm.id);
    try {
      await api.put(`/assets/${editForm.id}`, {
        name: editForm.name,
        asset_tag: editForm.asset_tag?.trim() || null,
        category: editForm.category,
        business_unit: editForm.business_unit,
        status: editForm.status,
        condition: editForm.condition,
        assigned_to: editForm.assigned_to ? Number(editForm.assigned_to) : null,
        serial_number: editForm.serial_number,
        location: editForm.location,
        purchase_date: editForm.purchase_date,
        purchase_cost: editForm.purchase_cost !== "" ? Number(editForm.purchase_cost) : null,
        notes: editForm.notes,
      });
      cancelEdit();
      await Promise.all([loadAll(), loadMine()]);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not update asset."));
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (asset) => {
    if (!window.confirm(`Remove "${asset.name}" from the asset tracker? This cannot be undone.`)) return;
    setError("");
    setSavingId(asset.id);
    try {
      await api.delete(`/assets/${asset.id}`);
      await Promise.all([loadAll(), loadMine()]);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete asset."));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Asset Tracker"
        subtitle="Company equipment assigned to you, and — for administrators — the full inventory."
      />

      <section className="card p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold text-[#000000] dark:text-white">My assets</h2>
        {loadingMine ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : myAssets.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No equipment is currently assigned to you.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Asset tag</th>
                  <th className="py-2 pr-4">Serial #</th>
                  <th className="py-2 pr-4">Condition</th>
                  <th className="py-2 pr-4">Location</th>
                </tr>
              </thead>
              <tbody>
                {myAssets.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">{a.name}</td>
                    <td className="py-2 pr-4">{a.category}</td>
                    <td className="py-2 pr-4">{a.asset_tag || "—"}</td>
                    <td className="py-2 pr-4">{a.serial_number || "—"}</td>
                    <td className="py-2 pr-4 capitalize">{a.condition}</td>
                    <td className="py-2 pr-4">{a.location || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage ? (
        <section className="card p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-[#000000] dark:text-white">Manage inventory</h2>

          {error ? (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <form onSubmit={create} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              className={FIELD}
              placeholder="Asset name (e.g. Dell Latitude 5420)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              className={FIELD}
              placeholder="Asset tag (optional)"
              value={form.asset_tag}
              onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
            />
            <input
              className={FIELD}
              placeholder="Serial number (optional)"
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
            <select className={FIELD} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className={FIELD}
              value={form.business_unit}
              onChange={(e) => setForm({ ...form, business_unit: e.target.value })}
            >
              {businessUnits.map((bu) => (
                <option key={bu} value={bu}>
                  {bu}
                </option>
              ))}
            </select>
            <select className={FIELD} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              {conditions.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
            <select
              className={FIELD}
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <input
              className={FIELD}
              placeholder="Location (optional)"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <input
              type="date"
              className={FIELD}
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={FIELD}
              placeholder="Purchase cost (optional)"
              value={form.purchase_cost}
              onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })}
            />
            <textarea
              className={`${FIELD} sm:col-span-2 lg:col-span-3`}
              placeholder="Notes (optional)"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:col-span-2 lg:col-span-1"
            >
              {creating ? "Adding…" : "Add asset"}
            </button>
          </form>

          <div className="mb-4 flex flex-wrap gap-2">
            <input
              className={FIELD}
              placeholder="Search name, tag, serial, assignee…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className={FIELD} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select className={FIELD} value={filterBu} onChange={(e) => setFilterBu(e.target.value)}>
              <option value="">All business units</option>
              {businessUnits.map((bu) => (
                <option key={bu} value={bu}>
                  {bu}
                </option>
              ))}
            </select>
          </div>

          {loadingAll ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No assets match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Tag</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">BU</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Assigned to</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) =>
                    editingId === a.id ? (
                      <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-4">
                          <input
                            className={`w-32 ${FIELD_SM}`}
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className={`w-24 ${FIELD_SM}`}
                            value={editForm.asset_tag || ""}
                            onChange={(e) => setEditForm({ ...editForm, asset_tag: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className={FIELD_SM}
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className={FIELD_SM}
                            value={editForm.business_unit}
                            onChange={(e) => setEditForm({ ...editForm, business_unit: e.target.value })}
                          >
                            {businessUnits.map((bu) => (
                              <option key={bu} value={bu}>
                                {bu}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className={FIELD_SM}
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          >
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className={FIELD_SM}
                            value={editForm.assigned_to}
                            onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}
                          >
                            <option value="">Unassigned</option>
                            {assignableUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={savingId === a.id}
                            className="mr-2 rounded bg-[#0B3EAF] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {savingId === a.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">{a.name}</td>
                        <td className="py-2 pr-4">{a.asset_tag || "—"}</td>
                        <td className="py-2 pr-4">{a.category}</td>
                        <td className="py-2 pr-4">{a.business_unit}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(a.status)}`}>
                            {statusLabel(a.status)}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{a.assigned_to_name || "—"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            className="mr-2 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(a)}
                            disabled={savingId === a.id}
                            className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
