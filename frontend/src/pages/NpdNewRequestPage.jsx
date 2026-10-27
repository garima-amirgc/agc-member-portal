import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { NPD_SCORECARD_METRIC_DEFS, NPD_CHANNEL_OPTIONS, NPD_PLANT_OPTIONS } from "../constants/npd";
import { previewScorecard, npdPriorityBadgeClass } from "../utils/npdScoring";

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const LABEL = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

// Field set and order mirror the original Launch Scorecard workbook's own
// columns (Product/SKU, Customer, Plant, Target Launch Date, then
// economics, auto/manual scores, and commercial detail) — this is the only
// form on this page; there is no separate "request details" section.
const EMPTY_FORM = {
  customer_name: "",
  product_name: "",
  channel: "",
  plant: "",
  start_date: "",
  requested_launch_date: "",
  // Gate 1 launch scorecard
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
};

export default function NpdNewRequestPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Preview only — the server recomputes this authoritatively on save, so a
  // mismatch here would only ever be cosmetic, never a data problem.
  const preview = useMemo(() => previewScorecard(form), [form]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim() || !form.product_name.trim()) {
      setError("Customer and Product / SKU are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/npd/requests", form);
      window.dispatchEvent(new Event("agc-npd-changed"));
      navigate(`/npd/requests/${data.id}`);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not create request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader title="New Product Request" subtitle="Step 1 of 13 — kicks off the workflow and routes to Management Approval." />

      <form onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

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
            <input className={FIELD} placeholder="Customer *" value={form.customer_name} onChange={update("customer_name")} required />
            <input className={FIELD} placeholder="Product / SKU *" value={form.product_name} onChange={update("product_name")} required />
            <div>
              <label className={LABEL}>Channel</label>
              <select className={`${FIELD} w-full`} value={form.channel} onChange={update("channel")}>
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
              <select className={`${FIELD} w-full`} value={form.plant} onChange={update("plant")}>
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
              <input type="date" className={`${FIELD} w-full`} value={form.start_date} onChange={update("start_date")} />
            </div>
            <div>
              <label className={LABEL}>Target launch date</label>
              <input type="date" className={`${FIELD} w-full`} value={form.requested_launch_date} onChange={update("requested_launch_date")} />
            </div>
          </div>

          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Economics (auto-scored)</h3>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={LABEL}>Annual Volume (kg)</label>
              <input type="number" step="any" className={`${FIELD} w-full`} value={form.annual_volume_kg} onChange={update("annual_volume_kg")} />
            </div>
            <div>
              <label className={LABEL}>Annual Revenue ($)</label>
              <input type="number" step="any" className={`${FIELD} w-full`} value={form.annual_revenue} onChange={update("annual_revenue")} />
            </div>
            <div>
              <label className={LABEL}>Annual GP$ ($)</label>
              <input type="number" step="any" className={`${FIELD} w-full`} value={form.annual_gp_dollars} onChange={update("annual_gp_dollars")} />
            </div>
            <div>
              <label className={LABEL}>GP% (e.g. 11 for 11%)</label>
              <input type="number" step="any" className={`${FIELD} w-full`} value={form.gp_percent} onChange={update("gp_percent")} />
            </div>
          </div>

          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Qualitative scoring (manual, 1–5)</h3>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {NPD_SCORECARD_METRIC_DEFS.map((m) => (
              <div key={m.key}>
                <label className={LABEL}>{m.label}</label>
                <select className={`${FIELD} w-full`} value={form[m.key]} onChange={update(m.key)}>
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
              <input type="number" step="any" className={`${FIELD} w-full`} value={form.capex_required} onChange={update("capex_required")} />
            </div>
            <div>
              <label className={LABEL}>Customer Commitment</label>
              <input className={`${FIELD} w-full`} placeholder="e.g. Confirmed, RFP, Not Confirmed" value={form.customer_commitment} onChange={update("customer_commitment")} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Key Strategic Rationale</label>
              <textarea className={`${FIELD} w-full`} rows={2} value={form.key_strategic_rationale} onChange={update("key_strategic_rationale")} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Key Risks / Comments</label>
              <textarea className={`${FIELD} w-full`} rows={2} value={form.key_risks_comments} onChange={update("key_risks_comments")} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>SLT Decision</label>
              <input
                className={`${FIELD} w-full`}
                placeholder="e.g. SLT Approved, Hold, Hold need more details"
                value={form.decision}
                onChange={update("decision")}
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create request & send to Management Approval"}
        </button>
      </form>
    </div>
  );
}

function ScorecardPreviewBadge({ preview }) {
  if (preview.weightedScore === null) {
    return <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Not yet scored</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{preview.weightedScore}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${npdPriorityBadgeClass(preview.priorityTier)}`}>{preview.priorityTier}</span>
    </div>
  );
}
