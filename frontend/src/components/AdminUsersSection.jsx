import { useEffect, useMemo, useRef, useState } from "react";
import api, { postUsersResendInvite, putUserSave } from "../services/api";
import { DEPARTMENTS } from "../constants/departments";
import { formatDepartments } from "../utils/userDepts";
import { useAuth } from "../context/AuthContext";
import { ADMIN_GRANT_OPTIONS } from "../constants/adminGrants";
import { canManageAdminGrants } from "../utils/adminAccess";

/** Match backend `canonicalRole` so grant payloads use the correct Admin branch even if API casing/labels vary. */
function isAdminRole(role) {
  const sl = String(role || "").trim().toLowerCase();
  return sl === "admin" || sl === "administrator" || sl === "superadmin" || sl === "super admin";
}

const FACILITIES = ["AGC", "AQM", "SCF", "ASP"];
const EMPTY_USER = {
  name: "",
  email: "",
  password: "",
  role: "Employee",
  business_units: ["AGC"],
  manager_id: "",
  designation: "",
  departments: ["Production"],
  admin_full_access: false,
  admin_grants: [],
};

export default function AdminUsersSection({ className = "card" }) {
  const { user: me, refreshMe } = useAuth();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [editing, setEditing] = useState(null); // { id, name, email, role, manager_id, facilities, password }
  /** Always latest editing object for Save (avoids rare stale closure). */
  const editingRef = useRef(null);
  editingRef.current = editing;
  /**
   * Checkbox grant selections updated synchronously in handlers — `editingRef` can lag one frame behind
   * after toggling, which produced PUT bodies with empty admin_grants even when boxes appeared checked.
   */
  const editGrantsSnapshotRef = useRef([]);
  const formGrantsSnapshotRef = useRef([]);
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
    () =>
      users.filter((u) => {
        const r = String(u.role || "").trim().toLowerCase();
        return r === "manager" || isAdminRole(u.role);
      }),
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
      let actor = me;
      try {
        actor = await refreshMe();
      } catch {
        /* use cached me */
      }
      if (canManageAdminGrants(me) && !canManageAdminGrants(actor)) {
        window.alert(
          "Your administrator permissions could not be confirmed with the server. Refresh this page and try again, or sign in with a full administrator account."
        );
        return;
      }
      const canGrant = canManageAdminGrants(actor);

      const mid = form.manager_id ? Number(form.manager_id) : null;
      const pw = form.password.trim();
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        business_units: form.business_units,
        manager_id: mid != null && Number.isFinite(mid) && mid > 0 ? mid : null,
        designation: String(form.designation || "").trim(),
        departments: form.departments,
      };
      if (pw) payload.password = pw;
      if (canGrant) {
        if (isAdminRole(form.role)) {
          if (!form.admin_full_access) {
            const keys = formGrantsSnapshotRef.current.filter(Boolean);
            if (keys.length === 0) {
              window.alert("Choose at least one administration area, or enable full administration access.");
              return;
            }
            payload.admin_grants = keys;
          }
        } else {
          const keys = formGrantsSnapshotRef.current.filter(Boolean);
          if (keys.length) payload.admin_grants = keys;
        }
      }
      const { data } = await api.post("/users", payload);
      formGrantsSnapshotRef.current = [];
      setForm({ ...EMPTY_USER });
      if (data?.invite && data?.setup_url) {
        setInviteBanner({
          setup_url: data.setup_url,
          email_sent: Boolean(data.email_sent),
          email_error: data.email_error || null,
        });
      }
      await load();
    } catch (err) {
      const st = err.response?.status;
      const d = err.response?.data;
      const msg = d?.message || err.message;
      const detail = d?.detail ? ` ${d.detail}` : "";
      window.alert(st ? `Create failed (HTTP ${st}): ${msg}${detail}` : `${msg}${detail}`);
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
    if (nextRole === "Admin" && !canManageAdminGrants(me)) {
      window.alert("Only a full administrator can assign the administrator role.");
      return;
    }
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

  const normalizeGrantsFromApi = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === "string") {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
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
      const roleResolved = data.role ?? u.role ?? "Employee";
      const grantsResolved = normalizeGrantsFromApi(data.admin_grants);
      editGrantsSnapshotRef.current = [...grantsResolved];
      setEditing({
        id: u.id,
        name: data.name ?? u.name ?? "",
        email: data.email ?? u.email ?? "",
        role: roleResolved,
        manager_id: managerIdStr,
        designation: String(data.designation ?? u.designation ?? ""),
        facilities: Array.isArray(data.facilities)
          ? data.facilities
          : [data.business_unit ?? u.business_unit ?? "AGC"].filter(Boolean),
        departments: deptState,
        password: "",
        admin_full_access: isAdminRole(roleResolved) && grantsResolved.length === 0,
        admin_grants: grantsResolved,
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
    const edBase = editingRef.current;
    if (!edBase) return;
    const ed = { ...edBase, admin_grants: [...editGrantsSnapshotRef.current] };
    if (!ed.name.trim() || !ed.email.trim()) {
      window.alert("Name and email are required.");
      return;
    }
    setUpdatingId(ed.id);
    try {
      let actor = me;
      try {
        actor = await refreshMe();
      } catch {
        /* use cached me */
      }
      if (canManageAdminGrants(me) && !canManageAdminGrants(actor)) {
        window.alert(
          "Your administrator permissions could not be confirmed with the server. Refresh this page and try again, or sign in with a full administrator account."
        );
        setUpdatingId(null);
        return;
      }
      const canGrant = canManageAdminGrants(actor);

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

      const body = {
        name: ed.name.trim(),
        email: ed.email.trim(),
        role: ed.role,
        manager_id,
        designation: String(ed.designation || "").trim(),
        business_units:
          Array.isArray(ed.facilities) && ed.facilities.length > 0 ? ed.facilities : undefined,
        departments: deptPayload,
        password: ed.password?.trim() ? ed.password.trim() : undefined,
      };
      if (canGrant) {
        if (isAdminRole(ed.role)) {
          if (ed.admin_full_access) {
            body.admin_grants = null;
          } else {
            const keys = Array.isArray(ed.admin_grants) ? ed.admin_grants.filter(Boolean) : [];
            if (keys.length === 0) {
              window.alert("Choose at least one administration area, or enable full administration access.");
              setUpdatingId(null);
              return;
            }
            body.admin_grants = keys;
          }
        } else {
          const keys = Array.isArray(ed.admin_grants) ? ed.admin_grants.filter(Boolean) : [];
          body.admin_grants = keys.length ? keys : null;
        }
      }
      const res = await putUserSave(ed.id, body);
      editGrantsSnapshotRef.current = [];
      setEditing(null);
      const savedList = res.data?.user?.departments ?? deptPayload;
      const sg = res.data?.user?.admin_grants;
      const sent = body.admin_grants;
      const sentLabel = Array.isArray(sent) ? sent.join(", ") : sent === null ? "null" : String(sent);
      const permMsg =
        canGrant && Object.prototype.hasOwnProperty.call(body, "admin_grants")
          ? Array.isArray(sg) && sg.length > 0
            ? ` Permissions: ${sg.join(", ")}.`
            : ` Permissions: (none — sent: ${sentLabel}; server returned null/empty).`
          : "";
      setSaveNotice(`Saved ${ed.name.trim()}. Departments: ${savedList.join(", ")}.${permMsg}`);
      setTimeout(() => setSaveNotice(null), 6000);
      await load();
      if (me?.id != null && Number(me.id) === Number(ed.id)) {
        try {
          await refreshMe();
        } catch {
          /* ignore */
        }
      }
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
                {inviteBanner.email_error ? (
                  <span className="text-amber-800 dark:text-amber-200">
                    Email was not sent: {inviteBanner.email_error} — copy the link above or fix SMTP on the API service.
                  </span>
                ) : inviteBanner.email_sent ? (
                  "We emailed this link to the user."
                ) : (
                  "SMTP not configured — share the link manually, or set SMTP on the API service (Render → agc-member-portal → Environment)."
                )}
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
              placeholder="Designation (optional)"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
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
              onChange={(e) => {
                const r = e.target.value;
                setForm((prev) => {
                  const next = {
                    ...prev,
                    role: r,
                    admin_full_access: r === "Admin",
                  };
                  if (r === "Admin") {
                    next.admin_grants = [];
                  } else if (isAdminRole(prev.role)) {
                    next.admin_grants = [];
                  }
                  formGrantsSnapshotRef.current = [...(next.admin_grants || [])];
                  return next;
                });
              }}
            >
              <option value="Admin" disabled={!canManageAdminGrants(me)}>
                Admin
              </option>
              <option value="Manager">Manager</option>
              <option value="Employee">Employee</option>
            </select>

            {isAdminRole(form.role) && canManageAdminGrants(me) ? (
              <div className="rounded border border-slate-200 p-3 dark:border-slate-600">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.admin_full_access}
                    onChange={(e) => {
                      const nextGrants = e.target.checked ? [] : form.admin_grants;
                      formGrantsSnapshotRef.current = [...(nextGrants || [])];
                      setForm({
                        ...form,
                        admin_full_access: e.target.checked,
                        admin_grants: nextGrants,
                      });
                    }}
                  />
                  <span>
                    <span className="font-medium">Full administration access</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                      Can use every administration area. Uncheck to allow only selected options below.
                    </span>
                  </span>
                </label>
                {!form.admin_full_access ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Administration areas
                    </p>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {ADMIN_GRANT_OPTIONS.map((opt) => {
                        const checked = (form.admin_grants || []).includes(opt.key);
                        return (
                          <label key={opt.key} className="flex cursor-pointer items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={() => {
                                setForm((prev) => {
                                  const s = new Set(prev.admin_grants || []);
                                  if (s.has(opt.key)) s.delete(opt.key);
                                  else s.add(opt.key);
                                  const next = Array.from(s);
                                  formGrantsSnapshotRef.current = [...next];
                                  return { ...prev, admin_grants: next };
                                });
                              }}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isAdminRole(form.role) && canManageAdminGrants(me) ? (
              <div className="rounded border border-slate-200 p-3 dark:border-slate-600">
                <p className="text-sm font-medium">Optional administration access</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Grant this user permission to manage specific areas (for example upcoming events) without changing
                  their role to administrator.
                </p>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {ADMIN_GRANT_OPTIONS.map((opt) => {
                    const checked = (form.admin_grants || []).includes(opt.key);
                    return (
                      <label key={opt.key} className="flex cursor-pointer items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => {
                            setForm((prev) => {
                              const s = new Set(prev.admin_grants || []);
                              if (s.has(opt.key)) s.delete(opt.key);
                              else s.add(opt.key);
                              const next = Array.from(s);
                              formGrantsSnapshotRef.current = [...next];
                              return { ...prev, admin_grants: next };
                            });
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

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
              <div className="mb-2 text-sm font-medium">Sites</div>
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
                      {Array.isArray(u.admin_grants) && u.admin_grants.length > 0 ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
                          {isAdminRole(u.role) ? "Scoped admin" : "Admin areas"}
                        </span>
                      ) : null}
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
                      disabled={
                        updatingId === u.id ||
                        deletingId === u.id ||
                        (isAdminRole(u.role) && !canManageAdminGrants(me))
                      }
                      onChange={(e) => updateUserRole(u, e.target.value)}
                    >
                      <option value="Admin" disabled={!canManageAdminGrants(me)}>
                        Admin
                      </option>
                      <option value="Manager">Manager</option>
                      <option value="Employee">Employee</option>
                    </select>
                    <button
                      type="button"
                      disabled={
                        loadingEdit ||
                        updatingId === u.id ||
                        deletingId === u.id ||
                        (isAdminRole(u.role) && !canManageAdminGrants(me))
                      }
                      onClick={() => openEdit(u)}
                      className="btn-outline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={
                        updatingId === u.id ||
                        deletingId === u.id ||
                        (isAdminRole(u.role) && !canManageAdminGrants(me))
                      }
                      onClick={() => resendInvite(u)}
                      className="btn-secondary text-xs"
                      title="Send a new password-setup link"
                    >
                      Resend invite
                    </button>
                    <button
                      type="button"
                      disabled={
                        deletingId === u.id ||
                        updatingId === u.id ||
                        (isAdminRole(u.role) && !canManageAdminGrants(me))
                      }
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
              <button
                type="button"
                onClick={() => {
                  editGrantsSnapshotRef.current = [];
                  setEditing(null);
                }}
                className="btn-secondary"
              >
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
                    onChange={(e) => {
                      const r = e.target.value;
                      if (r === "Admin") {
                        editGrantsSnapshotRef.current = [];
                        setEditing({
                          ...editing,
                          role: r,
                          admin_full_access: true,
                          admin_grants: [],
                        });
                      } else {
                        const fromAdmin = isAdminRole(editing.role);
                        const nextGrants = fromAdmin ? [] : [...(editing.admin_grants || [])];
                        editGrantsSnapshotRef.current = [...nextGrants];
                        setEditing({
                          ...editing,
                          role: r,
                          admin_full_access: false,
                          admin_grants: nextGrants,
                        });
                      }
                    }}
                  >
                    <option value="Admin" disabled={!canManageAdminGrants(me)}>
                      Admin
                    </option>
                    <option value="Manager">Manager</option>
                    <option value="Employee">Employee</option>
                  </select>
                </div>
              </div>

              {isAdminRole(editing.role) && canManageAdminGrants(me) ? (
                <div className="rounded border border-slate-200 p-3 dark:border-slate-600">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={editing.admin_full_access}
                      onChange={(e) => {
                        const nextGrants = e.target.checked ? [] : editing.admin_grants;
                        editGrantsSnapshotRef.current = [...(nextGrants || [])];
                        setEditing({
                          ...editing,
                          admin_full_access: e.target.checked,
                          admin_grants: nextGrants,
                        });
                      }}
                    />
                    <span>
                      <span className="font-medium">Full administration access</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        Uncheck to limit this account to selected areas only.
                      </span>
                    </span>
                  </label>
                  {!editing.admin_full_access ? (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                      <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Administration areas
                      </p>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {ADMIN_GRANT_OPTIONS.map((opt) => {
                          const checked = (editing.admin_grants || []).includes(opt.key);
                          return (
                            <label key={opt.key} className="flex cursor-pointer items-start gap-2 text-xs">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                onChange={() => {
                                  setEditing((prev) => {
                                    if (!prev) return prev;
                                    const s = new Set(prev.admin_grants || []);
                                    if (s.has(opt.key)) s.delete(opt.key);
                                    else s.add(opt.key);
                                    return { ...prev, admin_grants: Array.from(s) };
                                  });
                                }}
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!isAdminRole(editing.role) && canManageAdminGrants(me) ? (
                <div className="rounded border border-slate-200 p-3 dark:border-slate-600">
                  <p className="text-sm font-medium">Optional administration access</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Selected areas can be managed from this account without administrator role.
                  </p>
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                    {ADMIN_GRANT_OPTIONS.map((opt) => {
                      const checked = (editing.admin_grants || []).includes(opt.key);
                      return (
                        <label key={opt.key} className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => {
                              setEditing((prev) => {
                                if (!prev) return prev;
                                const s = new Set(prev.admin_grants || []);
                                if (s.has(opt.key)) s.delete(opt.key);
                                else s.add(opt.key);
                                const next = Array.from(s);
                                editGrantsSnapshotRef.current = [...next];
                                return { ...prev, admin_grants: next };
                              });
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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
                  Designation
                </div>
                <input
                  className="w-full rounded border p-2 dark:bg-slate-700"
                  placeholder="Optional"
                  value={editing.designation ?? ""}
                  onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
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
                <div className="mb-2 text-sm font-medium">Sites</div>
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
              <button
                type="button"
                onClick={() => {
                  editGrantsSnapshotRef.current = [];
                  setEditing(null);
                }}
                className="btn-secondary"
              >
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

