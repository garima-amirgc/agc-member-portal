import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export default function NpdAdminPage() {
  const [users, setUsers] = useState([]);
  const [accessUsers, setAccessUsers] = useState([]);
  const [deleteAccessUsers, setDeleteAccessUsers] = useState([]);
  const [sltUsers, setSltUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addAccessUserId, setAddAccessUserId] = useState("");
  const [addDeleteUserId, setAddDeleteUserId] = useState("");
  const [addSltUserId, setAddSltUserId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, accessRes, deleteAccessRes, sltRes] = await Promise.all([
        api.get("/npd/admin/assignable-users"),
        api.get("/npd/admin/access-users"),
        api.get("/npd/admin/delete-access-users"),
        api.get("/npd/admin/slt-users"),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setAccessUsers(Array.isArray(accessRes.data) ? accessRes.data : []);
      setDeleteAccessUsers(Array.isArray(deleteAccessRes.data) ? deleteAccessRes.data : []);
      setSltUsers(Array.isArray(sltRes.data) ? sltRes.data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load NPD administration data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grantAccess = async () => {
    if (!addAccessUserId) return;
    setError("");
    try {
      const { data } = await api.post("/npd/admin/access-users", { user_id: Number(addAccessUserId) });
      setAccessUsers(data);
      setAddAccessUserId("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not grant access."));
    }
  };

  const revokeAccess = async (userId) => {
    setError("");
    try {
      const { data } = await api.delete(`/npd/admin/access-users/${userId}`);
      setAccessUsers(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not revoke access."));
    }
  };

  const grantDeleteAccess = async () => {
    if (!addDeleteUserId) return;
    setError("");
    try {
      const { data } = await api.post("/npd/admin/delete-access-users", { user_id: Number(addDeleteUserId) });
      setDeleteAccessUsers(data);
      setAddDeleteUserId("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not grant delete access."));
    }
  };

  const revokeDeleteAccess = async (userId) => {
    setError("");
    try {
      const { data } = await api.delete(`/npd/admin/delete-access-users/${userId}`);
      setDeleteAccessUsers(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not revoke delete access."));
    }
  };

  const addSltMember = async () => {
    if (!addSltUserId) return;
    setError("");
    try {
      const { data } = await api.post("/npd/admin/slt-users", { user_id: Number(addSltUserId) });
      setSltUsers(data);
      setAddSltUserId("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not add SLT member."));
    }
  };

  const removeSltMember = async (userId) => {
    setError("");
    try {
      const { data } = await api.delete(`/npd/admin/slt-users/${userId}`);
      setSltUsers(data);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not remove SLT member."));
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="New Product Development — Administration"
        subtitle="Control who can access this module, who can delete requests, and who can be sent requests for SLT review."
      />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Who can access New Product Development</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Full admins always have access. Anyone else needs to be listed here to open this module.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <select className={FIELD} value={addAccessUserId} onChange={(e) => setAddAccessUserId(e.target.value)}>
                <option value="">Select a user to grant access…</option>
                {users
                  .filter((u) => !accessUsers.some((a) => a.user_id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={grantAccess}
                disabled={!addAccessUserId}
                className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Grant access
              </button>
            </div>
            {accessUsers.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">
                No one has been explicitly granted access yet — only full administrators can open this module.
              </p>
            ) : (
              <ul className="space-y-1">
                {accessUsers.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <span>
                      {u.name} <span className="text-slate-500 dark:text-slate-400">({u.email})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => revokeAccess(u.user_id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Who can delete requests</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Admins and anyone listed below can delete requests. No one else can.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <select className={FIELD} value={addDeleteUserId} onChange={(e) => setAddDeleteUserId(e.target.value)}>
                <option value="">Select a user to grant delete access…</option>
                {users
                  .filter((u) => !deleteAccessUsers.some((d) => d.user_id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={grantDeleteAccess}
                disabled={!addDeleteUserId}
                className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Grant delete access
              </button>
            </div>
            {deleteAccessUsers.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">
                No one has been explicitly granted delete access yet — only full administrators can delete requests.
              </p>
            ) : (
              <ul className="space-y-1">
                {deleteAccessUsers.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <span>
                      {u.name} <span className="text-slate-500 dark:text-slate-400">({u.email})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => revokeDeleteAccess(u.user_id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Who can be chosen as an SLT approver</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              When someone submits a Gate 1 request for review, they pick from this list who it gets sent to. Being
              listed here doesn't grant access to this module on its own — it just makes someone selectable.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <select className={FIELD} value={addSltUserId} onChange={(e) => setAddSltUserId(e.target.value)}>
                <option value="">Select a user to add as SLT…</option>
                {users
                  .filter((u) => !sltUsers.some((s) => s.user_id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={addSltMember}
                disabled={!addSltUserId}
                className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Add SLT member
              </button>
            </div>
            {sltUsers.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">
                No one is on the SLT list yet — requests can't be submitted for review until at least one person is
                added here.
              </p>
            ) : (
              <ul className="space-y-1">
                {sltUsers.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <span>
                      {u.name} <span className="text-slate-500 dark:text-slate-400">({u.email})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSltMember(u.user_id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
