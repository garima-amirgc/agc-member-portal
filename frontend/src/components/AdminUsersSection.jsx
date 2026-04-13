import { useEffect, useMemo, useRef, useState } from "react";
import api, { postUsersResendInvite } from "../services/api";
import { DEPARTMENTS } from "../constants/departments";
import { formatDepartments } from "../utils/userDepts";

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
const EMPTY_USER = {
  name: "",
  email: "",
  password: "",
  role: "Employee",
  business_units: ["AGC"],
  manager_id: "",
  departments: ["Production"],
};

export default function AdminUsersSection({ className = "card" }) {
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [editing, setEditing] = useState(null); // { id, name, email, role, manager_id, facilities, password }
  /** Always latest editing object for Save (avoids rare stale closure). */
  const editingRef = useRef(null);
  editingRef.current = editing;
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [inviteBanner, setInviteBanner] = useState(null);

  const load = () =>
    api
      .get("/users")
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : []))
      .catch((err) => {
        console.warn("Load users failed:", err.response?.status ?? err.message);
        setUsers([]);
      });

  useEffect(() => {
    load();
  }, []);

  const managers = useMemo(
    () => users.filter((u) => u.role === "Manager" || u.role === "Admin"),
    [users]
  );

  /** Edit modal: include current manager even if their role isn't Manager/Admin (legacy data). */
  const editManagerOptions = useMemo(() => {
    const picks = managers;
    if (!editing) return picks;
    const mid =
      editing.manager_id === "" || editing.manager_id == null ? null : Number(editing.manager_id);
    if (mid != null && Number.isFinite(mid) && mid > 0 && !picks.some((p) => p.id === mid)) {
      const extra = users.find((u) => u.id === mid);
      if (extra) return [...picks, extra];
    }
    return picks;
  }, [managers, users, editing]);

  const createUser = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setCreating(true);
    setInviteBanner(null);
    try {
      const mid = form.manager_id ? Number(form.manager_id) : null;
      const pw = form.password.trim();
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        business_units: form.business_units,
        manager_id: mid != null && Number.isFinite(mid) && mid > 0 ? mid : null,
        departments: form.departments,
      };
      if (pw) payload.password = pw;
      const { data } = await api.post("/users", payload);
      setForm(EMPTY_USER);
      if (data?.invite && data?.setup_url) {
        setInviteBanner({ setup_url: data.setup_url, email_sent: Boolean(data.email_sent) });
      }
      await load();
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Create failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setCreating(false);
    }
  };

  const resendInvite = async (u) => {
    if (
      !window.confirm(
        "Send a new setup link? This invalidates any previous link and the user’s current password until they finish setup."
      )
    ) {
      return;
    }
    setUpdatingId(u.id);
    try {
      const data = await postUsersResendInvite(u.id);
      const lines = [
        data?.setup_url || "(no link)",
        data?.email_sent ? "Invitation email was sent." : "Email is not configured — copy the link above or set SMTP in the server .env.",
      ];
      window.alert(lines.join("\n\n"));
      await load();
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Resend failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const updateUserRole = async (u, nextRole) => {
    setUpdatingId(u.id);
    try {
      await api.put(`/users/${u.id}`, {
        name: u.name,
        email: u.email,
        role: nextRole,
        manager_id: u.manager_id,
        business_units: Array.isArray(u.facilities) && u.facilities.length ? u.facilities : [u.business_unit].filter(Boolean),
        // Omit departments so the server keeps current values (list row can be stale after modal edits).
      });
      await load();
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Update failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = async (u) => {
    setLoadingEdit(true);
    try {
      const res = await api.get(`/users/${u.id}`);
      const data = res.data || {};
      const rawMgr = data.manager_id ?? u.manager_id;
      const managerIdStr =
        rawMgr != null && rawMgr !== "" ? String(rawMgr) : "";
      const deptState = (() => {
        if (Array.isArray(data.departments) && data.departments.length > 0) {
          return data.departments.filter((d) => DEPARTMENTS.includes(d)).sort();
        }
        const one = data.department ?? u.department ?? "Production";
        const d = String(one).trim();
        return [DEPARTMENTS.includes(d) ? d : "Production"];
      })();
      setEditing({
        id: u.id,
        name: data.name ?? u.name ?? "",
        email: data.email ?? u.email ?? "",
        role: data.role ?? u.role ?? "Employee",
        manager_id: managerIdStr,
        facilities: Array.isArray(data.facilities)
          ? data.facilities
          : [data.business_unit ?? u.business_unit ?? "AGC"].filter(Boolean),
        departments: deptState,
        password: "",
      });
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Load user failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setLoadingEdit(false);
    }
  };

  const saveEdit = async () => {
    const ed = editingRef.current;
    if (!ed) return;
    if (!ed.name.trim() || !ed.email.trim()) {
      window.alert("Name and email are required.");
      return;
    }
    setUpdatingId(ed.id);
    try {
      const mid =
        ed.manager_id === "" || ed.manager_id == null ? null : Number(ed.manager_id);
      const manager_id = mid != null && Number.isFinite(mid) && mid > 0 ? mid : null;

      const departments = (Array.isArray(ed.departments) ? ed.departments : [])
        .map((x) => String(x ?? "").trim())
        .filter((d) => DEPARTMENTS.includes(d));
      if (departments.length === 0) {
        window.alert("Select at least one department.");
        setUpdatingId(null);
        return;
      }
      const deptPayload = [...new Set(departments)].sort();

      const res = await api.put(`/users/${ed.id}`, {
        name: ed.name.trim(),
        email: ed.email.trim(),
        role: ed.role,
        manager_id,
        business_units:
          Array.isArray(ed.facilities) && ed.facilities.length > 0 ? ed.facilities : undefined,
        departments: deptPayload,
        password: ed.password?.trim() ? ed.password.trim() : undefined,
      });
      setEditing(null);
      const savedList = res.data?.user?.departments ?? deptPayload;
      setSaveNotice(`Saved ${ed.name.trim()}. Departments: ${savedList.join(", ")}.`);
      setTimeout(() => setSaveNotice(null), 6000);
      await load();
    } catch (err) {
      const st = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      window.alert(st ? `Save failed (HTTP ${st}): ${msg}` : msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete user ${u.name} (${u.email})?`)) return;
    setDeletingId(u.id);
    try {
      await api.delete(`/users/${u.id}`);
      await load();
    } catch (err) {
      const st = err.response?.status;
      const data = err.response?.data;
      const msg = data?.message || err.message;
      const pg = [data?.detail, data?.constraint].filter(Boolean).join(" — ");
      window.alert(
        st ? `Delete failed (HTTP ${st}): ${msg}${pg ? `\n\n${pg}` : ""}` : `${msg}${pg ? `\n\n${pg}` : ""}`
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Create users, assign roles, and remove users.
          </p>
          {saveNotice ? (
            <p className="mt-2 rounded-portal border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              {saveNotice}
            </p>
          ) : null}
          {inviteBanner ? (
            <div className="mt-3 rounded-portal border border-[#0B3EAF]/25 bg-[#eef2fb] px-3 py-3 text-sm text-[#082d82] dark:border-brand-green/30 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-semibold">Invite created — user must open this link to set their password</p>
              <p className="mt-2 break-all font-mono text-xs leading-relaxed">{inviteBanner.setup_url}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-outline px-3 py-1 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteBanner.setup_url);
                  }}
                >
                  Copy link
                </button>
                <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setInviteBanner(null)}>
                  Dismiss
                </button>
              </div>
              <p className="mt-2 text-xs opacity-90">
                {inviteBanner.email_sent
                  ? "We also emailed this link to the user (if SMTP is configured)."
                  : "SMTP not configured — share the link manually, or set SMTP_HOST / EMAIL_FROM in the backend .env."}
              </p>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={load} className="btn-outline">
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white/70 p-4 ring-1 ring-slate-200/70 dark:border-slate-700 dark:bg-slate-800/40 dark:ring-slate-700/70">
          <h3 className="mb-3 text-sm font-semibold">Create user</h3>
          <form className="agc-form space-y-2" onSubmit={createUser}>
            <input
              className="w-full rounded border p-2 dark:bg-slate-700"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="w-full rounded border p-2 dark:bg-slate-700"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="w-full rounded border p-2 dark:bg-slate-700"
              placeholder="Password (optional)"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Leave blank to send an <strong className="font-semibold">invite link</strong> — the user sets their own
              password (10+ characters, letters and numbers). Or enter a password here to activate the account
              immediately.
            </p>
            <select
              className="w-full rounded border p-2 dark:bg-slate-700"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option>Admin</option>
              <option>Manager</option>
              <option>Employee</option>
            </select>

            <div className="rounded border p-3 dark:border-slate-700">
              <div className="mb-2 text-sm font-medium">Departments</div>
              <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                Select one or more. IT is used for ticket routing. At least one is required.
              </p>
              <div className="flex flex-wrap gap-3">
                {DEPARTMENTS.map((d) => {
                  const checked = (form.departments || []).includes(d);
                  return (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const current = new Set(form.departments || []);
                          if (current.has(d)) {
                            if (current.size <= 1) return;
                            current.delete(d);
                          } else {
                            current.add(d);
                          }
                          setForm({ ...form, departments: Array.from(current).sort() });
                        }}
                      />
                      {d}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded border p-3 dark:border-slate-700">
              <div className="mb-2 text-sm font-medium">Facilities</div>
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
                      />
                      {f}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Manager (for leave requests)</div>
              <select
                className="w-full rounded border p-2 dark:bg-slate-700"
                value={form.manager_id}
                onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
              >
                <option value="">No manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Assign a manager so this user can submit leave from Dashboard → Leave.
              </p>
            </div>

            <button type="submit" disabled={creating} className="btn-primary w-full">
              {creating ? "Creating…" : "Create user"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border bg-white/70 p-4 ring-1 ring-slate-200/70 dark:border-slate-700 dark:bg-slate-800/40 dark:ring-slate-700/70">
          <h3 className="mb-3 text-sm font-semibold">Manage users</h3>
          <div className="space-y-2">
            {users.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No users found.</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{u.name}</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{u.email}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Manager: {u.manager_name || "—"} · Dept: {formatDepartments(u)}
                      </span>
                      {u.invite_status === "active" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                          Setup pending
                        </span>
                      ) : null}
                      {u.invite_status === "expired" ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-800 dark:bg-slate-600 dark:text-slate-100">
                          Invite expired
                        </span>
                      ) : null}
                    </div>
                    {Array.isArray(u.facilities) && u.facilities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {u.facilities.map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-brand-blue-soft px-2 py-0.5 text-[11px] font-bold text-brand-blue dark:bg-white/10 dark:text-brand-green"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border p-2 text-sm dark:bg-slate-700"
                      value={u.role}
                      disabled={updatingId === u.id || deletingId === u.id}
                      onChange={(e) => updateUserRole(u, e.target.value)}
                    >
                      <option>Admin</option>
                      <option>Manager</option>
                      <option>Employee</option>
                    </select>
                    <button
                      type="button"
                      disabled={loadingEdit || updatingId === u.id || deletingId === u.id}
                      onClick={() => openEdit(u)}
                      className="btn-outline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === u.id || deletingId === u.id}
                      onClick={() => resendInvite(u)}
                      className="btn-secondary text-xs"
                      title="Send a new password-setup link"
                    >
                      Resend invite
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === u.id || updatingId === u.id}
                      onClick={() => deleteUser(u)}
                      className="btn-danger"
                    >
                      {deletingId === u.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <div className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-700">
              <div>
                <h3 id="edit-user-title" className="text-lg font-semibold">
                  Edit user
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{editing.email}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Name
                  </div>
                  <input
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Role
                  </div>
                  <select
                    className="w-full rounded border p-2 dark:bg-slate-700"
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  >
                    <option>Admin</option>
                    <option>Manager</option>
                    <option>Employee</option>
                  </select>
                </div>
              </div>

              <div className="rounded border p-3 dark:border-slate-700">
                <div className="mb-2 text-sm font-medium">Departments</div>
                <div className="flex flex-wrap gap-3">
                  {DEPARTMENTS.map((d) => {
                    const checked = (editing.departments || []).includes(d);
                    return (
                      <label key={d} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = new Set(editing.departments || []);
                            if (current.has(d)) {
                              if (current.size <= 1) return;
                              current.delete(d);
                            } else {
                              current.add(d);
                            }
                            setEditing({
                              ...editing,
                              departments: Array.from(current).sort(),
                            });
                          }}
                        />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Email
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Manager
                </div>
                <select
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  value={editing.manager_id === "" || editing.manager_id == null ? "" : String(editing.manager_id)}
                  onChange={(e) => setEditing({ ...editing, manager_id: e.target.value })}
                >
                  <option value="">No Manager</option>
                  {editManagerOptions.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded border p-3 dark:border-slate-700">
                <div className="mb-2 text-sm font-medium">Facilities</div>
                <div className="flex flex-wrap gap-3">
                  {FACILITIES.map((f) => {
                    const checked = (editing.facilities || []).includes(f);
                    return (
                      <label key={f} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = new Set(editing.facilities || []);
                            if (current.has(f)) current.delete(f);
                            else current.add(f);
                            setEditing({ ...editing, facilities: Array.from(current) });
                          }}
                        />
                        {f}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Reset password (optional)
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current password"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Min. 10 characters with letters and numbers. Clears a pending invite when set.
                </p>
              </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/40">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={updatingId === editing.id}
                className="btn-primary"
              >
                {updatingId === editing.id ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

