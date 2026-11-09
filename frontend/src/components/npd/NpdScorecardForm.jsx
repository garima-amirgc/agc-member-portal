import { useMemo } from "react";
import { NPD_SCORECARD_METRIC_DEFS, NPD_CHANNEL_OPTIONS, NPD_PLANT_OPTIONS } from "../../constants/npd";
import { previewScorecard, npdPriorityBadgeClass } from "../../utils/npdScoring";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const LABEL = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

// The Gate 1 — Launch Scorecard form. Field set and order mirror the source
// "New Product Launch Scorecard" workbook's own columns (Product/SKU,
// Customer, Channel, Plant, Start Date, Target Launch Date, then economics,
// auto/manual scores, and commercial detail). Shared by NpdNewRequestPage
// (create) and NpdRequestDetailPage (edit) so the one real implementation —
// and the live weighted-score preview — only exists in one place.
export default function NpdScorecardForm({ form, onChange, submitting = false, sltOptions = [] }) {
  const preview = useMemo(() => previewScorecard(form), [form]);
  const update = (key) => (e) => onChange(key, e.target.value);
  const updateSltApprovers = (e) => {
    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
    onChange("slt_approver_ids", ids);
  };

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#000000] dark:text-white">Gate 1 — Launch Scorecard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fill in all 8 metrics for an automatic Weighted Score and Priority. You can save with this partially filled in and finish it later.
          </p>
        </div>
        <ScorecardPreviewBadge preview={preview} />
      </div>

      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Project details</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className={FIELD}
          placeholder="Customer *"
          value={form.customer_name}
          onChange={update("customer_name")}
          disabled={submitting}
          required
        />
        <input
          className={FIELD}
          placeholder="Product / SKU *"
          value={form.product_name}
          onChange={update("product_name")}
          disabled={submitting}
          required
        />
        <div>
          <label className={LABEL}>Channel</label>
          <select className={`${FIELD} w-full`} value={form.channel} onChange={update("channel")} disabled={submitting}>
            <option value="">Select…</option>
            {NPD_CHANNEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Plant</label>
          <select className={`${FIELD} w-full`} value={form.plant} onChange={update("plant")} disabled={submitting}>
            <option value="">Select…</option>
            {NPD_PLANT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Start date</label>
          <input type="date" className={`${FIELD} w-full`} value={form.start_date} onChange={update("start_date")} disabled={submitting} />
        </div>
        <div>
          <label className={LABEL}>Target launch date</label>
          <input
            type="date"
            className={`${FIELD} w-full`}
            value={form.requested_launch_date}
            onChange={update("requested_launch_date")}
            disabled={submitting}
          />
        </div>
      </div>

      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Economics (auto-scored)</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={LABEL}>Annual Volume (kg)</label>
          <input
            type="number"
            step="any"
            className={`${FIELD} w-full`}
            value={form.annual_volume_kg}
            onChange={update("annual_volume_kg")}
            disabled={submitting}
          />
        </div>
        <div>
          <label className={LABEL}>Annual Revenue ($)</label>
          <input
            type="number"
            step="any"
            className={`${FIELD} w-full`}
            value={form.annual_revenue}
            onChange={update("annual_revenue")}
            disabled={submitting}
          />
        </div>
        <div>
          <label className={LABEL}>Annual GP$ ($)</label>
          <input
            type="number"
            step="any"
            className={`${FIELD} w-full`}
            value={form.annual_gp_dollars}
            onChange={update("annual_gp_dollars")}
            disabled={submitting}
          />
        </div>
        <div>
          <label className={LABEL}>GP% (e.g. 11 for 11%)</label>
          <input
            type="number"
            step="any"
            className={`${FIELD} w-full`}
            value={form.gp_percent}
            onChange={update("gp_percent")}
            disabled={submitting}
          />
        </div>
      </div>

      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qualitative scoring (manual, 1–5)</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {NPD_SCORECARD_METRIC_DEFS.map((m) => (
          <div key={m.key}>
            <label className={LABEL}>{m.label}</label>
            <select className={`${FIELD} w-full`} value={form[m.key]} onChange={update(m.key)} disabled={submitting}>
              <option value="">Select…</option>
              {m.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Commercial details</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>CapEx Required ($)</label>
          <input
            type="number"
            step="any"
            className={`${FIELD} w-full`}
            value={form.capex_required}
            onChange={update("capex_required")}
            disabled={submitting}
          />
        </div>
        <div>
          <label className={LABEL}>Customer Commitment</label>
          <input
            className={`${FIELD} w-full`}
            placeholder="e.g. Confirmed, RFP, Not Confirmed"
            value={form.customer_commitment}
            onChange={update("customer_commitment")}
            disabled={submitting}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Key Strategic Rationale</label>
          <textarea
            className={`${FIELD} w-full`}
            rows={2}
            value={form.key_strategic_rationale}
            onChange={update("key_strategic_rationale")}
            disabled={submitting}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Key Risks / Comments</label>
          <textarea
            className={`${FIELD} w-full`}
            rows={2}
            value={form.key_risks_comments}
            onChange={update("key_risks_comments")}
            disabled={submitting}
          />
        </div>
      </div>

      <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Send for SLT review</h3>
      <div>
        <label className={LABEL}>SLT approver(s) — hold Ctrl (Cmd on Mac) to pick more than one</label>
        <select
          multiple
          className={`${FIELD} w-full`}
          size={Math.min(5, Math.max(3, sltOptions.length))}
          value={form.slt_approver_ids || []}
          onChange={updateSltApprovers}
          disabled={submitting}
        >
          {sltOptions.map((u) => (
            <option key={u.user_id} value={String(u.user_id)}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {sltOptions.length === 0
            ? "No one is on the SLT list yet — an admin needs to add SLT members first (New Product Development → Administration)."
            : preview.weightedScore === null
            ? "Selecting someone here saves who to send it to, but it won't actually go out until all 8 scorecard metrics above are filled in."
            : "Whoever you select here gets this request to review as soon as you save. Any one of them approving moves it toward Gate 2."}
        </p>
      </div>
    </section>
  );
}

function ScorecardPreviewBadge({ preview }) {
  if (preview.weightedScore === null) {
    return (
      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Not yet scored
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{preview.weightedScore}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${npdPriorityBadgeClass(preview.priorityTier)}`}>{preview.priorityTier}</span>
    </div>
  );
}

export const NPD_EMPTY_SCORECARD_FORM = {
  customer_name: "",
  product_name: "",
  channel: "",
  plant: "",
  start_date: "",
  requested_launch_date: "",
  annual_volume_kg: "",
  annual_revenue: "",
  annual_gp_dollars: "",
  gp_percent: "",
  strategic_fit_score: "",
  customer_market_value_score: "",
  complexity_score: "",
  speed_to_market_score: "",
  capex_required: "",
  customer_commitment: "",
  key_strategic_rationale: "",
  key_risks_comments: "",
  decision: "",
  slt_approver_ids: [],
};

// Pulls just the scorecard-form fields back out of a saved request (as
// returned by GET /npd/requests/:id) so the edit form can be pre-filled.
// Numbers come back as native numbers from the API; inputs want strings.
export function npdRequestToForm(request) {
  const s = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    customer_name: s(request.customer_name),
    product_name: s(request.product_name),
    channel: s(request.channel),
    plant: s(request.plant),
    start_date: request.start_date ? String(request.start_date).slice(0, 10) : "",
    requested_launch_date: request.requested_launch_date ? String(request.requested_launch_date).slice(0, 10) : "",
    annual_volume_kg: s(request.annual_volume_kg),
    annual_revenue: s(request.annual_revenue),
    annual_gp_dollars: s(request.annual_gp_dollars),
    // gp_percent is stored as a decimal fraction (0.11); the form/preview
    // works in whichever shape the person types, so showing it back as a
    // plain percentage (11) is the more natural round-trip for editing.
    gp_percent: request.gp_percent === null || request.gp_percent === undefined ? "" : String(Number(request.gp_percent) * 100),
    strategic_fit_score: s(request.strategic_fit_score),
    customer_market_value_score: s(request.customer_market_value_score),
    complexity_score: s(request.complexity_score),
    speed_to_market_score: s(request.speed_to_market_score),
    capex_required: s(request.capex_required),
    customer_commitment: s(request.customer_commitment),
    key_strategic_rationale: s(request.key_strategic_rationale),
    key_risks_comments: s(request.key_risks_comments),
    decision: s(request.decision),
    // Pre-check whoever it's currently pending on (not people who already
    // responded), so re-saving without touching this list just leaves the
    // existing pending review as-is.
    slt_approver_ids: Array.isArray(request.approvers)
      ? request.approvers.filter((a) => !a.decided_at).map((a) => String(a.user_id))
      : [],
  };
}
