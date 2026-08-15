import { NPD_STEP_STATUS_LABELS, npdStepStatusBadgeClass } from "../../constants/npd";

function ownerLabel(step) {
  if (step.step_key === "management_approval") return "Management";
  if (step.step_key === "finance_approval") return "Finance";
  if (step.step_key === "final_authorization") return "Management";
  if (step.step_key === "final_verification") return "FSQA / Production / Sales";
  return step.responsible_department || "—";
}

// Every step is clickable — selecting one shows *that* step's own details in
// the action panel next to this list. Nothing here auto-carries a skipped
// step's form forward onto whatever step you're currently viewing; the
// caller decides what "viewing step N" means and only step N's own block
// renders.
export default function NpdStepper({ steps, currentStep, selectedStep, onSelectStep }) {
  return (
    <ol className="space-y-2">
      {steps.map((step) => {
        const isCurrent = Number(step.step_number) === Number(currentStep);
        const isSelected = selectedStep != null && Number(step.step_number) === Number(selectedStep);
        const displayStatus = step.display_status || step.status;
        const isSkipped = displayStatus === "skipped";
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelectStep?.(step.step_number)}
              aria-current={isSelected ? "step" : undefined}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                isSkipped
                  ? "border-red-300 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20"
                  : isCurrent
                    ? "border-[#0B3EAF] bg-[#0B3EAF]/5 dark:border-[#A7D344] dark:bg-[#A7D344]/10"
                    : "border-slate-200 dark:border-slate-800"
              } ${
                isSelected
                  ? "ring-2 ring-[#0B3EAF] ring-offset-1 dark:ring-[#A7D344] dark:ring-offset-slate-900"
                  : "hover:border-[#0B3EAF]/50 dark:hover:border-[#A7D344]/50"
              }`}
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  displayStatus === "completed"
                    ? "bg-green-600 text-white"
                    : isSkipped
                      ? "bg-red-600 text-white"
                      : isCurrent
                        ? "bg-[#0B3EAF] text-white"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {displayStatus === "completed" ? "✓" : isSkipped ? "!" : step.step_number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {step.step_number}. {step.step_name}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${npdStepStatusBadgeClass(displayStatus)}`}>
                    {NPD_STEP_STATUS_LABELS[displayStatus] || displayStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ownerLabel(step)}
                  {step.assigned_to_name ? ` · Last touched by ${step.assigned_to_name}` : ""}
                  {step.completed_at ? ` · Completed ${new Date(step.completed_at).toLocaleDateString()}` : ""}
                  {isSkipped && step.skip_reason ? ` · Skip reason: ${step.skip_reason}` : ""}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
