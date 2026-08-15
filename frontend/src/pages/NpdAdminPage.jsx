import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { NPD_STEP_DEFS } from "../constants/npd";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export default function NpdAdminPage() {
  const [users, setUsers] = useState([]);
  const [approvers, setApprovers] = useState({});
  const [stepAssignees, setStepAssignees] = useState({});
  const [deleteAccessUsers, setDeleteAccessUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addApproverByType, setAddApproverByType] = useState({});
  const [addAssigneeByStep, setAddAssigneeByStep] = useState({});
  const [addDeleteUserId, setAddDeleteUserId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, approversRes, stepAssigneesRes, deleteAccessRes] = await Promise.all([
        api.get("/npd/admin/assignable-users"),
        api.get("/npd/admin/approvers"),
        api.get("/npd/admin/step-assignees"),
        api.get("/npd/admin/delete-access-users"),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setApprovers(approversRes.data || {});
      setStepAssignees(stepAssigneesRes.data || {});
      setDeleteAccessUsers(Array.isArray(deleteAccessRes.data) ? deleteAccessRes.data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load NPD administration data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const addApprover = async (approvalType) => {
    const userId = addApproverByType[approvalType];
    if (!userId) return;
    const current = (approvers[approvalType] || []).map((a) => a.user_id);
    if (current.includes(Number(userId))) return;
    const next = [...current, Number(userId)];
    setError("");
    try {
      const { data } = await api.put(`/npd/admin/approvers/${approvalType}`, { user_ids: next });
      setApprovers({ ...approvers, [approvalType]: data });
      setAddApproverByType({ ...addApproverByType, [approvalType]: "" });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save approvers."));
    }
  };

  const removeApprover = async (approvalType, userId) => {
    const next = (approvers[approvalType] || []).map((a) => a.user_id).filter((id) => id !== userId);
    setError("");
    try {
      const { data } = await api.put(`/npd/admin/approvers/${approvalType}`, { user_ids: next });
      setApprovers({ ...approvers, [approvalType]: data });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save approvers."));
    }
  };

  const addStepAssignee = async (stepKey) => {
    const userId = addAssigneeByStep[stepKey];
    if (!userId) return;
    const current = (stepAssignees[stepKey] || []).map((a) => a.user_id);
    if (current.includes(Number(userId))) return;
    const next = [...current, Number(userId)];
    setError("");
    try {
      const { data } = await api.put(`/npd/admin/step-assignees/${stepKey}`, { user_ids: next });
      setStepAssignees({ ...stepAssignees, [stepKey]: data });
      setAddAssigneeByStep({ ...addAssigneeByStep, [stepKey]: "" });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save step access."));
    }
  };

  const removeStepAssignee = async (stepKey, userId) => {
    const next = (stepAssignees[stepKey] || []).map((a) => a.user_id).filter((id) => id !== userId);
    setError("");
    try {
      const { data } = await api.put(`/npd/admin/step-assignees/${stepKey}`, { user_ids: next });
      setStepAssignees({ ...stepAssignees, [stepKey]: data });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save step access."));
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

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="New Product Development — Administration"
        subtitle="Control who can act on or approve each step of the workflow."
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
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Step approvers &amp; access</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Only people assigned below can act on a step. Approvals need everyone listed to approve.
            </p>
            <div className="space-y-5">
              {NPD_STEP_DEFS.map((step) => {
                if (step.type === "multi_confirm") {
                  return (
                    <div key={step.key} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 dark:border-slate-800">
                      <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {step.number}. {step.name}
                      </h3>
                      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                        Needs one confirmation from each of {step.confirmations.join(", ")} — assign who can confirm below.
                      </p>
                      <div className="space-y-3">
                        {step.confirmations.map((dept) => {
                          const listKey = `${step.key}:${dept}`;
                          const list = stepAssignees[listKey] || [];
                          const listIds = new Set(list.map((a) => a.user_id));
                          const pendingValue = addAssigneeByStep[listKey] || "";
                          return (
                            <div key={listKey} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{dept}</h4>
                              <div className="mb-2 flex flex-wrap gap-2">
                                <select
                                  className={FIELD}
                                  value={pendingValue}
                                  onChange={(e) => setAddAssigneeByStep({ ...addAssigneeByStep, [listKey]: e.target.value })}
                                >
                                  <option value="">Select a user to restrict {dept} confirmation to…</option>
                                  {users.filter((u) => !listIds.has(u.id)).map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name} ({u.email})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => addStepAssignee(listKey)}
                                  disabled={!pendingValue}
                                  className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                                >
                                  Add
                                </button>
                              </div>
                              {list.length === 0 ? (
                                <p className="text-xs italic text-slate-500 dark:text-slate-400">
                                  No one specific listed — open to the whole {dept} department.
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {list.map((a) => (
                                    <li key={a.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
                                      <span>
                                        {a.name} <span className="text-slate-500 dark:text-slate-400">({a.email})</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeStepAssignee(listKey, a.user_id)}
                                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
                                      >
                                        Remove
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const isApproval = step.type === "approval";
                const listKey = isApproval ? step.approvalType : step.key;
                const list = (isApproval ? approvers[listKey] : stepAssignees[listKey]) || [];
                const listIds = new Set(list.map((a) => a.user_id));
                const pendingValue = isApproval ? addApproverByType[listKey] || "" : addAssigneeByStep[listKey] || "";
                const setPendingValue = (value) =>
                  isApproval
                    ? setAddApproverByType({ ...addApproverByType, [listKey]: value })
                    : setAddAssigneeByStep({ ...addAssigneeByStep, [listKey]: value });
                const onAdd = () => (isApproval ? addApprover(listKey) : addStepAssignee(listKey));
                const onRemove = (userId) => (isApproval ? removeApprover(listKey, userId) : removeStepAssignee(listKey, userId));

                return (
                  <div key={step.key} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 dark:border-slate-800">
                    <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {step.number}. {step.name}
                    </h3>
                    <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                      {isApproval
                        ? "All listed people must approve before this step advances."
                        : `Default: anyone in ${Array.isArray(step.department) ? step.department.join(" / ") : step.department}`}
                    </p>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <select
                        className={FIELD}
                        value={pendingValue}
                        onChange={(e) => setPendingValue(e.target.value)}
                      >
                        <option value="">{isApproval ? "Select a user to add as approver…" : "Select a user to restrict this step to…"}</option>
                        {users.filter((u) => !listIds.has(u.id)).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={onAdd}
                        disabled={!pendingValue}
                        className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {isApproval ? "Add approver" : "Add"}
                      </button>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-xs italic text-slate-500 dark:text-slate-400">
                        {isApproval
                          ? "No approvers configured yet — this step cannot be approved until at least one is added."
                          : "No one specific listed — open to the whole department."}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {list.map((a) => (
                          <li key={a.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
                            <span>
                              {a.name} <span className="text-slate-500 dark:text-slate-400">({a.email})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemove(a.user_id)}
                              className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:text-red-300"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
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
        </>
      )}
    </div>
  );
}
