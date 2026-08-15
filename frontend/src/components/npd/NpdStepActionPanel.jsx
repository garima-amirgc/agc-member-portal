import { useState } from "react";
import api from "../../services/api";
import { friendlyErrorMessage } from "../../services/friendlyError";
import { hasAdminGrant } from "../../utils/adminAccess";
import { ADMIN_GRANT_KEYS } from "../../constants/adminGrants";
import { npdStepDef, NPD_STEP_FORM_FIELDS } from "../../constants/npd";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

function DynamicFields({ fields, values, onChange }) {
  if (!fields) {
    return (
      <textarea
        className={`${FIELD} w-full`}
        rows={3}
        placeholder="Notes (optional)"
        value={values.notes || ""}
        onChange={(e) => onChange({ ...values, notes: e.target.value })}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{f.label}</label>
          {f.type === "textarea" ? (
            <textarea
              className={`${FIELD} w-full`}
              rows={3}
              value={values[f.key] || ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          ) : f.type === "select" ? (
            <select
              className={`${FIELD} w-full`}
              value={values[f.key] || ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            >
              <option value="">Select…</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type}
              className={`${FIELD} w-full`}
              value={values[f.key] || ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Shown for a step that's already done — whether it finished normally or was
// skipped earlier and someone came back and completed it. Read-only: no
// action buttons, so it never gets mistaken for something still open.
function CompletedStepView({ request, step, stepDef }) {
  const stepApprovals = request.approvals.filter((a) => a.step_id === step.id);
  const fields = NPD_STEP_FORM_FIELDS[stepDef.key] || null;
  const dataEntries = step.data && typeof step.data === "object" ? Object.entries(step.data).filter(([, v]) => v) : [];

  const fieldLabel = (key) => fields?.find((f) => f.key === key)?.label || key;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {step.step_number}. {stepDef.name}
        </span>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
          Completed
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {step.completed_at ? `Completed ${new Date(step.completed_at).toLocaleString()}` : "Completed"}
        {step.assigned_to_name ? ` by ${step.assigned_to_name}` : ""}.
      </p>
      {stepDef.type === "submit" && dataEntries.length ? (
        <dl className="grid grid-cols-1 gap-3 rounded border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2">
          {dataEntries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{fieldLabel(k)}</dt>
              <dd className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {(stepDef.type === "approval" || stepDef.type === "multi_confirm") && stepApprovals.length ? (
        <ul className="space-y-1 text-sm">
          {stepApprovals.map((a) => (
            <li key={a.id} className="text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{a.approver_name}</span>
              {a.approval_type && a.approval_type.includes(":") ? ` (${a.approval_type.split(":")[1]})` : ""} — {a.action}
              {a.comments ? `: "${a.comments}"` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Shown for a step further down the line that the workflow hasn't reached
// yet — nothing to fill in until it becomes the active step (or gets
// skipped-to by its owner once it's actually current).
function LockedStepView({ step, stepDef }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {step.step_number}. {stepDef.name}
        </span>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Not started
        </span>
      </div>
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        This step hasn't started yet — it becomes active once the workflow reaches it.
      </p>
    </div>
  );
}

// Shown for a step that got sent back for changes but isn't the one
// currently open for editing — e.g. viewing step 2 (the approval that asked
// for changes) while the workflow is actually waiting on step 1 to be fixed.
function WaitingOnEarlierStepView({ step, stepDef, request }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {step.step_number}. {stepDef.name}
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Changes requested
        </span>
      </div>
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        This is on hold until step {request.current_step} is revised and resubmitted — it'll become active again once
        that happens.
      </p>
    </div>
  );
}

// Renders exactly ONE step at a time — whichever one the stepper list has
// selected (viewStepNumber), defaulting to the workflow's actual current
// step. A skipped step's fillable form only shows up here when someone
// deliberately clicks that step in the list; it never gets glued onto
// whatever step happens to be active. That's the whole point of "skip for
// now": the step stays parked exactly where it is until its owner comes
// back to it on their own terms.
export default function NpdStepActionPanel({ request, user, onUpdated, viewStepNumber }) {
  const isAdmin = hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);

  if (request.status === "completed") {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
        This request has completed all 13 steps. 🎉
      </div>
    );
  }
  if (request.status === "cancelled") {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        This request was cancelled.
      </div>
    );
  }
  if (request.status === "customer_rejected") {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        The workflow halted because the customer did not approve. An admin can reopen an earlier step to restart if
        needed.
        {isAdmin ? <ReopenBox request={request} user={user} onUpdated={onUpdated} /> : null}
      </div>
    );
  }
  if (request.status === "rejected") {
    const rejectedDef = npdStepDef(request.current_step);
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        This request was rejected at step {request.current_step} ("{rejectedDef?.name}").
        {isAdmin ? <ReopenBox request={request} user={user} onUpdated={onUpdated} /> : null}
      </div>
    );
  }

  const stepNumber = viewStepNumber || request.current_step;
  const step = request.steps.find((s) => Number(s.step_number) === Number(stepNumber));
  const stepDef = npdStepDef(stepNumber);

  if (!step || !stepDef) {
    return <p className="text-sm italic text-slate-500 dark:text-slate-400">Select a step from the list on the left.</p>;
  }

  const displayStatus = step.display_status || step.status;
  // Matches the backend's own "is this step active" check per type (see
  // submitStep / skipStep) — a submit-type step stays actionable through
  // "changes_requested" and "rejected" too, since that's exactly the state
  // it's in when it's been sent back for revision.
  const activeStatusesForType =
    stepDef.type === "submit" ? ["in_progress", "changes_requested", "rejected"] : ["in_progress", "waiting_approval"];
  const isCurrentActive = Number(stepNumber) === Number(request.current_step) && activeStatusesForType.includes(step.status);

  return (
    <div className="space-y-6">
      {displayStatus === "completed" ? (
        <CompletedStepView request={request} step={step} stepDef={stepDef} />
      ) : displayStatus === "skipped" ? (
        <div className="rounded-lg border border-red-200 p-3 dark:border-red-900/60">
          <StepActionBlock
            request={request}
            user={user}
            step={step}
            stepDef={stepDef}
            isAdmin={isAdmin}
            onUpdated={onUpdated}
            isCurrent={false}
          />
        </div>
      ) : isCurrentActive ? (
        <StepActionBlock
          request={request}
          user={user}
          step={step}
          stepDef={stepDef}
          isAdmin={isAdmin}
          onUpdated={onUpdated}
          isCurrent
        />
      ) : displayStatus === "changes_requested" ? (
        <WaitingOnEarlierStepView step={step} stepDef={stepDef} request={request} />
      ) : (
        <LockedStepView step={step} stepDef={stepDef} />
      )}

      {isAdmin ? <ReopenBox request={request} user={user} onUpdated={onUpdated} /> : null}
    </div>
  );
}

// Renders the submit / approval / multi-confirm UI for one step. Used both
// for the current active step and for any previously-skipped step someone
// is catching up on — `isCurrent` controls whether the "Skip for now"
// control is offered (skipping an already-skipped step makes no sense).
function StepActionBlock({ request, user, step, stepDef, isAdmin, onUpdated, isCurrent }) {
  // Prefill with whatever was submitted last time (e.g. the original request
  // fields on step 1) so resubmitting after "changes requested" means fixing
  // what's wrong, not retyping everything from scratch.
  const [values, setValues] = useState(() => step.data || {});
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await fn();
      onUpdated(data);
      window.dispatchEvent(new Event("agc-npd-changed"));
      setValues({});
      setComments("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not complete that action."));
    } finally {
      setBusy(false);
    }
  };

  const submitStep = () => run(() => api.post(`/npd/requests/${request.id}/steps/${step.step_number}/submit`, { data: values }));
  const decide = (action) => run(() => api.post(`/npd/requests/${request.id}/steps/${step.step_number}/decision`, { action, comments }));
  const verify = (confirmation_area, action) =>
    run(() => api.post(`/npd/requests/${request.id}/steps/${step.step_number}/verify`, { confirmation_area, action, comments }));

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-800 dark:text-slate-100">
        {step.step_number}. {stepDef.name}
      </span>
      {!isCurrent ? (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">
          Skipped
        </span>
      ) : null}
    </div>
  );
  const skipNote =
    !isCurrent && step.skip_reason ? (
      <p className="text-xs italic text-slate-500 dark:text-slate-400">Skip reason: {step.skip_reason}</p>
    ) : null;

  // If this step is back open because someone requested changes, surface
  // who asked and why so whoever's editing knows what to fix — instead of
  // just silently reopening a blank-looking form.
  const changeRequestNote =
    step.status === "changes_requested"
      ? [...request.approvals]
          .filter((a) => a.action === "changes_requested" && (!step.started_at || a.action_at >= step.started_at))
          .pop()
      : null;

  // ─── Submit-type step ─────────────────────────────────────────────────
  if (stepDef.type === "submit") {
    // Server-computed, so it correctly reflects department gating OR an
    // admin-configured per-step access list, without duplicating that
    // logic here. For the current step it's request.viewer_can_act_current_step;
    // for a skipped catch-up step it's the per-step viewer_can_act flag.
    const canAct = Boolean(isCurrent ? request.viewer_can_act_current_step : step.viewer_can_act);
    const fields = NPD_STEP_FORM_FIELDS[stepDef.key] || null;
    return (
      <div className="space-y-3">
        {header}
        {skipNote}
        {changeRequestNote ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">{changeRequestNote.approver_name}</span> requested changes
            {changeRequestNote.comments ? `: "${changeRequestNote.comments}"` : "."} Update the fields below and resubmit.
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Waiting on the person(s) assigned to <span className="font-medium">{Array.isArray(stepDef.department) ? stepDef.department.join(" / ") : stepDef.department}</span>
            {" "}to complete "{stepDef.name}".
          </p>
        )}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {canAct ? (
          <>
            <DynamicFields fields={fields} values={values} onChange={setValues} />
            <button
              type="button"
              onClick={submitStep}
              disabled={busy}
              className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit & advance workflow"}
            </button>
          </>
        ) : (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">
            You don't have permission to complete this step — only the specific person(s) assigned to it can. Ask an
            NPD admin to add you under <strong>Manage access &amp; approvers</strong> if this should be you.
          </p>
        )}
        {isCurrent && stepDef.skippable ? <SkipBox request={request} step={step} stepDef={stepDef} onUpdated={onUpdated} /> : null}
      </div>
    );
  }

  // ─── Approval-type step ───────────────────────────────────────────────
  if (stepDef.type === "approval") {
    const stepApprovals = request.approvals.filter((a) => a.step_id === step.id);
    // Only count decisions from the current round (since started_at resets
    // whenever the step is (re)activated) — mirrors the backend's own check,
    // so "already voted" here matches what the server will actually enforce.
    const thisRoundApprovals = stepApprovals.filter((a) => !step.started_at || a.action_at >= step.started_at);
    const myDecision = thisRoundApprovals.find((a) => a.approver_id === user.id);
    return (
      <div className="space-y-3">
        {header}
        {skipNote}
        <p className="text-sm text-slate-600 dark:text-slate-400">Any one of the configured approvers can approve this step to move it forward.</p>
        {stepApprovals.length ? (
          <ul className="space-y-1 text-sm">
            {stepApprovals.map((a) => (
              <li key={a.id} className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">{a.approver_name}</span> — {a.action}
                {a.comments ? `: "${a.comments}"` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-slate-500 dark:text-slate-400">No decisions recorded yet.</p>
        )}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {myDecision ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You recorded <span className="font-semibold">{myDecision.action}</span> for this step.
          </p>
        ) : (
          <>
            <textarea
              className={`${FIELD} w-full`}
              rows={2}
              placeholder="Comments (optional)"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => decide("approved")} className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                Approve
              </button>
              <button type="button" disabled={busy} onClick={() => decide("changes_requested")} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                Request changes
              </button>
              <button type="button" disabled={busy} onClick={() => decide("rejected")} className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                Reject
              </button>
            </div>
            <p className="text-xs italic text-slate-500 dark:text-slate-400">
              If you're not a configured approver for this step, the server will reject the action — ask an NPD admin
              to add you under Manage Approvers.
            </p>
          </>
        )}
        {isCurrent && stepDef.skippable ? <SkipBox request={request} step={step} stepDef={stepDef} onUpdated={onUpdated} /> : null}
      </div>
    );
  }

  // ─── Multi-department confirmation step ────────────────────────────────
  if (stepDef.type === "multi_confirm") {
    const stepApprovals = request.approvals.filter((a) => a.step_id === step.id);
    return (
      <div className="space-y-3">
        {header}
        {skipNote}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <textarea
          className={`${FIELD} w-full`}
          rows={2}
          placeholder="Comments (optional)"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <div className="space-y-2">
          {stepDef.confirmations.map((dept) => {
            const recorded = stepApprovals.find((a) => a.approval_type === `${stepDef.key}:${dept}`);
            // Server-computed (folds in any admin-configured allowlist for
            // this confirmation slot, narrowing it below "whole department")
            // — falls back to the plain department check if the server
            // hasn't sent it for some reason.
            // Assignment-only, same as the server — no department-wide fallback. The
            // department check only remains as a defensive default for the rare case
            // the server didn't send viewer_confirmable at all.
            const canConfirm = step.viewer_confirmable ? Boolean(step.viewer_confirmable[dept]) : isAdmin;
            return (
              <div key={dept} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2 dark:border-slate-800">
                <span className="w-24 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-200">{dept}</span>
                {recorded ? (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {recorded.approver_name}: {recorded.action}
                  </span>
                ) : canConfirm ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => verify(dept, "approved")} className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                      Confirm
                    </button>
                    <button type="button" disabled={busy} onClick={() => verify(dept, "rejected")} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                      Flag issue
                    </button>
                  </>
                ) : (
                  <span className="text-sm italic text-slate-500 dark:text-slate-400">
                    Waiting on the person(s) assigned to {dept}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {isCurrent && stepDef.skippable ? <SkipBox request={request} step={step} stepDef={stepDef} onUpdated={onUpdated} /> : null}
      </div>
    );
  }

  return null;
}

// "Skip for now" — lets whoever would normally act on a step defer it so
// later steps aren't blocked. The step keeps showing up (in red) until its
// real owner comes back and actually completes it.
function SkipBox({ request, step, stepDef, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-red-700 underline dark:text-red-300"
      >
        Not ready — skip for now
      </button>
    );
  }

  const skip = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/npd/requests/${request.id}/steps/${step.step_number}/skip`, { reason });
      onUpdated(data);
      window.dispatchEvent(new Event("agc-npd-changed"));
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not skip that step."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/30">
      <p className="mb-2 text-red-900 dark:text-red-200">
        This lets later steps proceed while "{stepDef.name}" waits. It'll show as <span className="font-semibold">Skipped</span> until
        someone actually completes it.
      </p>
      {error ? <p className="mb-2 text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${FIELD} flex-1`}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={skip}
          className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Skipping…" : "Confirm skip"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline dark:text-slate-400">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReopenBox({ request, user, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [stepNumber, setStepNumber] = useState(String(request.current_step || 1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]"
      >
        Admin: reopen a step
      </button>
    );
  }

  const reopen = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/npd/requests/${request.id}/steps/${stepNumber}/reopen`, { reason });
      onUpdated(data);
      window.dispatchEvent(new Event("agc-npd-changed"));
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not reopen that step."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
      <p className="mb-2 font-medium text-amber-900 dark:text-amber-100">
        Reopening resets this step (and every later step) back to not-started. Use this only to correct a mistake or
        get an unstuck workflow moving again.
      </p>
      {error ? <p className="mb-2 text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <select className={FIELD} value={stepNumber} onChange={(e) => setStepNumber(e.target.value)}>
          {request.steps.map((s) => (
            <option key={s.id} value={s.step_number}>
              {s.step_number}. {s.step_name}
            </option>
          ))}
        </select>
        <input
          className={`${FIELD} flex-1`}
          placeholder="Reason (recorded in activity log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={reopen}
          className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Reopening…" : "Reopen"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline dark:text-slate-400">
          Cancel
        </button>
      </div>
    </div>
  );
}
