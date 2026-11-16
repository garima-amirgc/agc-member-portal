import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { friendlyErrorMessage } from "../../services/friendlyError";
import { useAuth } from "../../context/AuthContext";
import {
  NPD_GATE2_TASK_STATUS_OPTIONS,
  NPD_GATE2_TASK_PRIORITY_OPTIONS,
  NPD_GATE2_DECISION_OPTIONS,
  npdGate2TaskStatusBadgeClass,
  npdGate2TaskPriorityBadgeClass,
  npdGate2TaskBarColor,
  npdGate2DecisionBadge,
} from "../../constants/npd";

const FIELD = "rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";
const COMMON_DEPARTMENTS = ["Planning", "Production", "Finance", "Sales", "FSQA", "Packaging / Supply Chain", "Logistics", "Regulatory", "Quality"];

// Gate 2 — Action Tracker. Lives as its own tab on the request detail page,
// fetched/managed independently of the `request` object the other tabs
// share (tasks live in their own table, not on npd_requests itself — see
// GET/POST/PUT/DELETE /npd/requests/:id/gate2*). This REPLACES the earlier
// fixed 8-item readiness checklist with a flexible task list — any number
// of tasks, each with a free-text owner/department, status, priority,
// dates, progress %, a dependency on other tasks (enforced server-side:
// a task can't move to In Progress/Completed while a task it depends on
// isn't Completed), and a milestone flag — plus a simple Gantt-style
// timeline, mirroring the source workbook's "Gantt View" tab. The final
// leadership sign-off section below is unchanged from the first Gate 2
// build (same Approve/Conditional Approval/Rework/Hold/Reject vocabulary,
// same reused SLT roster) — only its gating condition changed, from "all 8
// items Ready/N/A" to "every active task Completed".
export default function NpdGate2Panel({ requestId, onRequestChanged }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [edits, setEdits] = useState({}); // taskId -> local field overrides
  const [newTitle, setNewTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [sltOptions, setSltOptions] = useState([]);
  const [pickedApprovers, setPickedApprovers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [decidingBusy, setDecidingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: gate2 } = await api.get(`/npd/requests/${requestId}/gate2`);
      setData(gate2);
      setEdits({});
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load Gate 2."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    api.get("/npd/slt-users").then(({ data }) => setSltOptions(Array.isArray(data) ? data : [])).catch(() => setSltOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const refreshRequestToo = async () => {
    try {
      const { data: req } = await api.get(`/npd/requests/${requestId}`);
      onRequestChanged?.(req);
    } catch {
      // non-fatal — the Gate 2 panel's own state already has what it needs
    }
  };

  const setEdit = (taskId, field, value) => setEdits((prev) => ({ ...prev, [taskId]: { ...prev[taskId], [field]: value } }));
  const editValue = (task, field) => (edits[task.id] && Object.prototype.hasOwnProperty.call(edits[task.id], field) ? edits[task.id][field] : task[field] ?? "");

  const saveTask = async (taskId, body) => {
    setSavingTaskId(taskId);
    setError("");
    try {
      const { data: gate2 } = await api.put(`/npd/requests/${requestId}/gate2/tasks/${taskId}`, body);
      setData(gate2);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save that task."));
      await load(); // the field may have snapped back (e.g. a blocked status change) — reload to show the real state
    } finally {
      setSavingTaskId(null);
    }
  };

  const saveDependencies = async (taskId, dependsOnTaskIds) => {
    setSavingTaskId(taskId);
    setError("");
    try {
      const { data: gate2 } = await api.put(`/npd/requests/${requestId}/gate2/tasks/${taskId}/dependencies`, { depends_on_task_ids: dependsOnTaskIds });
      setData(gate2);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not update that task's dependencies."));
    } finally {
      setSavingTaskId(null);
    }
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAddingTask(true);
    setError("");
    try {
      const { data: gate2 } = await api.post(`/npd/requests/${requestId}/gate2/tasks`, { title });
      setData(gate2);
      setNewTitle("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not add that task."));
    } finally {
      setAddingTask(false);
    }
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Remove task ${task.task_code} (${task.title})? Any other task depending on it will be unblocked.`)) return;
    setSavingTaskId(task.id);
    setError("");
    try {
      const { data: gate2 } = await api.delete(`/npd/requests/${requestId}/gate2/tasks/${task.id}`);
      setData(gate2);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not delete that task."));
    } finally {
      setSavingTaskId(null);
    }
  };

  const toggleApprover = (id) =>
    setPickedApprovers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submitForReview = async () => {
    if (pickedApprovers.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: gate2 } = await api.post(`/npd/requests/${requestId}/gate2/submit-for-review`, {
        approver_user_ids: pickedApprovers,
      });
      setData(gate2);
      setPickedApprovers([]);
      window.dispatchEvent(new Event("agc-npd-changed"));
      await refreshRequestToo();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not submit for Gate 2 review."));
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (decision) => {
    setDecidingBusy(true);
    setError("");
    try {
      const { data: gate2 } = await api.post(`/npd/requests/${requestId}/gate2/decision`, { decision });
      setData(gate2);
      window.dispatchEvent(new Event("agc-npd-changed"));
      await refreshRequestToo();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not record that decision."));
    } finally {
      setDecidingBusy(false);
    }
  };

  const departmentSuggestions = useMemo(() => {
    const used = (data?.tasks || []).map((t) => t.department).filter(Boolean);
    return [...new Set([...COMMON_DEPARTMENTS, ...used])];
  }, [data]);
  const ownerSuggestions = useMemo(() => [...new Set((data?.tasks || []).map((t) => t.owner_name).filter(Boolean))], [data]);

  const gantt = useMemo(() => {
    const tasks = (data?.tasks || []).filter((t) => t.start_date && t.end_date);
    if (tasks.length === 0) return null;
    const starts = tasks.map((t) => new Date(`${t.start_date}T00:00:00Z`).getTime());
    const ends = tasks.map((t) => new Date(`${t.end_date}T00:00:00Z`).getTime());
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const totalMs = Math.max(max - min, 86400000); // at least 1 day wide
    return {
      tasks: tasks.map((t) => {
        const s = new Date(`${t.start_date}T00:00:00Z`).getTime();
        const e = new Date(`${t.end_date}T00:00:00Z`).getTime();
        return {
          ...t,
          leftPct: ((s - min) / totalMs) * 100,
          widthPct: Math.max(((e - s + 86400000) / totalMs) * 100, 1.5),
        };
      }),
      undatedCount: (data?.tasks || []).length - tasks.length,
    };
  }, [data]);

  if (loading) return <section className="card p-4 sm:p-6"><p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p></section>;

  if (error && !data) {
    return (
      <section className="card p-4 sm:p-6">
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">{error}</div>
      </section>
    );
  }
  if (!data) return null;

  if (data.locked) {
    return (
      <section className="card p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-[#000000] dark:text-white">Gate 2 — Action Tracker</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gate 2 unlocks once this request's Gate 1 scorecard has been <strong>Approved</strong> by SLT review. Submit it for SLT
          review on the Overview tab first.
        </p>
      </section>
    );
  }

  const [decisionLabel, decisionBadgeClass] = npdGate2DecisionBadge(data.gate2_status);
  const myPendingApproval = (data.approvers || []).find((a) => !a.decided_at && Number(a.user_id) === Number(user?.id));
  const { totalTasks, completedCount, averageProgress } = data.summary || { totalTasks: 0, completedCount: 0, averageProgress: 0 };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">{error}</div>
      ) : null}

      <section className="card p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#000000] dark:text-white">Gate 2 — Action Tracker</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClass}`}>{decisionLabel}</span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold tabular-nums text-[#0B3EAF] dark:text-[#A7D344]">{totalTasks}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Tasks</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold tabular-nums text-[#0B3EAF] dark:text-[#A7D344]">{completedCount}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold tabular-nums text-[#0B3EAF] dark:text-[#A7D344]">{averageProgress}%</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Average Progress</div>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Anyone with NPD access can add, edit, or reassign a task. A task depending on another can't move to In Progress or
          Completed until that other task is Completed — set dependencies in the "Depends on" column.
        </p>

        <div className="space-y-3">
          {(data.tasks || []).map((task) => {
            const blockingCodes = (task.depends_on || []).filter((d) => d.status !== "completed").map((d) => d.task_code);
            const otherTasks = (data.tasks || []).filter((t) => t.id !== task.id);
            return (
              <div key={task.id} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {task.task_code}
                    </span>
                    {task.is_milestone ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                        Milestone
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${npdGate2TaskPriorityBadgeClass(task.priority)}`}>
                      {NPD_GATE2_TASK_PRIORITY_OPTIONS.find((o) => o.value === task.priority)?.label || task.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${npdGate2TaskStatusBadgeClass(task.status)}`}>
                      {NPD_GATE2_TASK_STATUS_OPTIONS.find((o) => o.value === task.status)?.label || task.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteTask(task)}
                      disabled={savingTaskId === task.id}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <label className="mb-2 block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">Task description</span>
                  <input
                    type="text"
                    className={FIELD + " w-full"}
                    value={editValue(task, "title")}
                    onChange={(e) => setEdit(task.id, "title", e.target.value)}
                    onBlur={(e) => e.target.value.trim() && saveTask(task.id, { title: e.target.value.trim() })}
                  />
                </label>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">Owner</span>
                    <input
                      list={`owners-${requestId}`}
                      type="text"
                      className={FIELD + " w-full"}
                      placeholder="Who's doing this?"
                      value={editValue(task, "owner_name")}
                      onChange={(e) => setEdit(task.id, "owner_name", e.target.value)}
                      onBlur={(e) => saveTask(task.id, { owner_name: e.target.value })}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">Department</span>
                    <input
                      list={`departments-${requestId}`}
                      type="text"
                      className={FIELD + " w-full"}
                      value={editValue(task, "department")}
                      onChange={(e) => setEdit(task.id, "department", e.target.value)}
                      onBlur={(e) => saveTask(task.id, { department: e.target.value })}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">Priority</span>
                    <select
                      className={FIELD + " w-full"}
                      value={task.priority}
                      onChange={(e) => saveTask(task.id, { priority: e.target.value })}
                    >
                      {NPD_GATE2_TASK_PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">
                      Status{blockingCodes.length > 0 ? ` (blocked by ${blockingCodes.join(", ")})` : ""}
                    </span>
                    <select
                      className={FIELD + " w-full"}
                      value={task.status}
                      onChange={(e) => saveTask(task.id, { status: e.target.value })}
                    >
                      {NPD_GATE2_TASK_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">Start date</span>
                    <input
                      type="date"
                      className={FIELD + " w-full"}
                      value={editValue(task, "start_date")}
                      onChange={(e) => setEdit(task.id, "start_date", e.target.value)}
                      onBlur={(e) => saveTask(task.id, { start_date: e.target.value || null })}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">End date</span>
                    <input
                      type="date"
                      className={FIELD + " w-full"}
                      value={editValue(task, "end_date")}
                      onChange={(e) => setEdit(task.id, "end_date", e.target.value)}
                      onBlur={(e) => saveTask(task.id, { end_date: e.target.value || null })}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-slate-500 dark:text-slate-400">
                      Duration {task.duration_days ? `(${task.duration_days}d)` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className={FIELD + " w-full"}
                        value={editValue(task, "progress_percent")}
                        onChange={(e) => setEdit(task.id, "progress_percent", e.target.value)}
                        onBlur={(e) => saveTask(task.id, { progress_percent: Number(e.target.value) || 0 })}
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </label>
                  <label className="flex items-end gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={!!task.is_milestone}
                      onChange={(e) => saveTask(task.id, { is_milestone: e.target.checked })}
                    />
                    <span className="text-slate-500 dark:text-slate-400">Milestone</span>
                  </label>
                </div>

                <label className="mt-2 block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">Depends on</span>
                  <select
                    multiple
                    className={FIELD + " h-20 w-full"}
                    value={(task.depends_on || []).map((d) => String(d.id))}
                    onChange={(e) => saveDependencies(task.id, Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
                  >
                    {otherTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.task_code} — {t.title.slice(0, 60)}</option>
                    ))}
                  </select>
                </label>

                <label className="mt-2 block text-xs">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">Notes</span>
                  <input
                    type="text"
                    className={FIELD + " w-full"}
                    value={editValue(task, "notes")}
                    onChange={(e) => setEdit(task.id, "notes", e.target.value)}
                    onBlur={(e) => saveTask(task.id, { notes: e.target.value })}
                  />
                </label>

                {savingTaskId === task.id ? <p className="mt-1 text-xs text-slate-400">Saving…</p> : null}
              </div>
            );
          })}
        </div>

        <datalist id={`departments-${requestId}`}>
          {departmentSuggestions.map((d) => <option key={d} value={d} />)}
        </datalist>
        <datalist id={`owners-${requestId}`}>
          {ownerSuggestions.map((o) => <option key={o} value={o} />)}
        </datalist>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            type="text"
            className={FIELD + " flex-1"}
            placeholder="Add a task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <button
            type="button"
            disabled={addingTask || !newTitle.trim()}
            onClick={addTask}
            className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {addingTask ? "Adding…" : "+ Add Task"}
          </button>
        </div>
      </section>

      {gantt ? (
        <section className="card p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-[#000000] dark:text-white">Timeline</h2>
          <div className="space-y-2">
            {gantt.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">{t.task_code}</span>
                <div className="relative h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="absolute top-0 h-5 rounded"
                    style={{ left: `${t.leftPct}%`, width: `${t.widthPct}%`, backgroundColor: npdGate2TaskBarColor(t.status) }}
                    title={`${t.title} (${t.start_date} → ${t.end_date})`}
                  />
                </div>
                <span className="w-28 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400" title={t.title}>{t.title}</span>
              </div>
            ))}
          </div>
          {gantt.undatedCount > 0 ? (
            <p className="mt-2 text-xs italic text-slate-400">{gantt.undatedCount} task{gantt.undatedCount === 1 ? "" : "s"} without both a start and end date aren't shown here.</p>
          ) : null}
        </section>
      ) : null}

      <section className="card p-4 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Gate 2 Sign-Off</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Once every task above is Completed, send this to leadership for a formal Gate 2 decision — any one of them deciding
          settles it for everyone, same as the Gate 1 SLT review.
        </p>

        {(data.approvers || []).length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm">
            {data.approvers.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 dark:border-slate-800">
                <span>{a.name} <span className="text-slate-500 dark:text-slate-400">({a.email})</span></span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{a.decided_at ? "Responded" : "Awaiting response"}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {myPendingApproval ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {NPD_GATE2_DECISION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={decidingBusy}
                onClick={() => decide(opt.value)}
                className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-60 ${opt.className}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        {totalTasks === 0 ? (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">Add at least one task above before this can be submitted.</p>
        ) : !data.allCompleted ? (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">All tasks above must be Completed before this can be submitted.</p>
        ) : data.gate2_status === "pending_review" ? (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">Already submitted — awaiting a decision.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {sltOptions.map((u) => (
                <label key={u.user_id} className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">
                  <input type="checkbox" checked={pickedApprovers.includes(u.user_id)} onChange={() => toggleApprover(u.user_id)} />
                  {u.name}
                </label>
              ))}
              {sltOptions.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No one is on the SLT roster yet.</p> : null}
            </div>
            <button
              type="button"
              disabled={submitting || pickedApprovers.length === 0}
              onClick={submitForReview}
              className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit for Gate 2 sign-off"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
