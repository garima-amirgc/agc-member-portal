import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

// ─── Gate 1 scoring rules — view / edit page ────────────────────────────────
// Exposes the weights/thresholds/priority cutoffs that used to be hardcoded
// in backend/src/services/npdScoring.js so they're visible from inside the
// NPD module, and editable by ANYONE with general NPD access (this route is
// gated by <ProtectedRoute npdAccess> in App.jsx, not adminGrant — see the
// comment there) — per explicit request: "who so ever are given edit access
// they should be able to edit those details too so futher calculation is
// also adjusted". The backend (npdWorkflow.service.js's updateScoringConfig/
// getActiveScoringConfig/getScoringConfigById) guarantees a change here only
// ever affects requests scored from that point forward — see the big
// disclaimer banner below, which states that in plain language for whoever
// is editing, per the other half of the same request ("make sure... admin
// is aware of it").

const FIELD = "rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const NUM_FIELD = FIELD + " w-full";

const WEIGHT_LABELS = {
  volumeScore: "Annual Volume",
  revenueScore: "Annual Revenue",
  gpDollarScore: "Annual GP$",
  gpPercentScore: "GP%",
  strategicFitScore: "Strategic Fit",
  customerMarketValueScore: "Customer / Market Value",
  complexityScore: "Complexity",
  speedToMarketScore: "Speed to Market",
};
const WEIGHT_KEYS = Object.keys(WEIGHT_LABELS);

// Each entry: the config key, a display label, a unit formatter for the 4
// threshold inputs, and whether the field stores a plain number (kg / $) or
// a GP% stored as a decimal fraction server-side but shown/edited here as
// whole percentage points (12 instead of 0.12) since that's how everyone
// actually thinks about it.
const THRESHOLD_METRICS = [
  { key: "volumeThresholds", label: "Annual Volume (kg)", isPercent: false },
  { key: "revenueThresholds", label: "Annual Revenue ($)", isPercent: false },
  { key: "gpDollarThresholds", label: "Annual GP$ ($)", isPercent: false },
  { key: "gpPercentThresholds", label: "GP%", isPercent: true },
];

function toDisplayThresholds(config) {
  const out = {};
  for (const { key, isPercent } of THRESHOLD_METRICS) {
    const arr = Array.isArray(config?.[key]) ? config[key] : [0, 0, 0, 0];
    out[key] = isPercent ? arr.map((n) => Math.round((Number(n) || 0) * 10000) / 100) : arr.map((n) => Number(n) || 0);
  }
  return out;
}

function fromDisplayThresholds(display) {
  const out = {};
  for (const { key, isPercent } of THRESHOLD_METRICS) {
    const arr = display[key] || [0, 0, 0, 0];
    out[key] = isPercent ? arr.map((n) => (Number(n) || 0) / 100) : arr.map((n) => Number(n) || 0);
  }
  return out;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function NpdScoringRulesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [meta, setMeta] = useState({ id: null, isDefault: true, created_by_name: null, created_at: null });
  const [weights, setWeights] = useState({});
  const [thresholds, setThresholds] = useState({});
  const [cutoffs, setCutoffs] = useState({ priority1: 80, priority2: 65, review: 50 });
  const [note, setNote] = useState("");
  const [history, setHistory] = useState([]);

  const applyConfig = (payload) => {
    setMeta({
      id: payload.id,
      isDefault: !!payload.isDefault,
      created_by_name: payload.created_by_name,
      created_at: payload.created_at,
    });
    setWeights({ ...payload.config.weights });
    setThresholds(toDisplayThresholds(payload.config));
    setCutoffs({ ...payload.config.priorityCutoffs });
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [activeRes, historyRes] = await Promise.all([
        api.get("/npd/scoring-config"),
        api.get("/npd/scoring-config/history"),
      ]);
      applyConfig(activeRes.data);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load the Gate 1 scoring rules."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const weightTotal = useMemo(
    () => WEIGHT_KEYS.reduce((sum, k) => sum + (Number(weights[k]) || 0), 0),
    [weights]
  );
  const weightTotalOk = Math.round(weightTotal * 100) / 100 === 100;

  const setWeight = (key, value) => setWeights((prev) => ({ ...prev, [key]: value }));
  const setThresholdAt = (metricKey, index, value) =>
    setThresholds((prev) => {
      const next = [...(prev[metricKey] || [0, 0, 0, 0])];
      next[index] = value;
      return { ...prev, [metricKey]: next };
    });
  const setCutoff = (key, value) => setCutoffs((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setError("");
    setSavedMessage("");
    setSaving(true);
    try {
      const body = {
        weights,
        thresholds: fromDisplayThresholds(thresholds),
        priorityCutoffs: cutoffs,
        note,
      };
      const { data } = await api.put("/npd/scoring-config", body);
      applyConfig(data);
      const [historyRes] = await Promise.all([api.get("/npd/scoring-config/history")]);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
      setNote("");
      setSavedMessage("Saved. Requests already scored are unaffected — only requests scored from now on use these new rules.");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save the scoring rules."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Gate 1 Scoring Rules"
        subtitle="The weights, thresholds, and priority cutoffs behind every Gate 1 Weighted Score and Priority."
      />

      <div className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <div>
          <p className="font-semibold">Changes here only apply going forward.</p>
          <p className="mt-1">
            Saving new rules never changes the score on a request that's already been saved — even if that request
            gets edited again later, it keeps being calculated with the rules that were in effect (or last in effect
            for it) when it was first scored. Only brand-new requests, and only from the moment you save, use the
            new numbers below.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {savedMessage ? (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
          {savedMessage}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Currently in effect</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {meta.isDefault
                ? "These are the app's original built-in rules — no one has customized them yet."
                : `Saved by ${meta.created_by_name || "—"} on ${formatDate(meta.created_at)}.`}
            </p>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Metric weights</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Each of the 8 metrics' 1–5 score is blended into the 0–100 Weighted Score by its weight below. The 8
              weights must add up to exactly 100.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {WEIGHT_KEYS.map((key) => (
                <label key={key} className="text-sm">
                  <span className="mb-1 block text-slate-600 dark:text-slate-300">{WEIGHT_LABELS[key]}</span>
                  <input
                    type="number"
                    className={NUM_FIELD}
                    value={weights[key] ?? ""}
                    onChange={(e) => setWeight(key, e.target.value)}
                    step="0.1"
                  />
                </label>
              ))}
            </div>
            <p className={`mt-3 text-sm font-semibold ${weightTotalOk ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              Total: {weightTotal} {weightTotalOk ? "✓" : "— must equal 100"}
            </p>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Auto-scored thresholds</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Annual Volume, Annual Revenue, Annual GP$ and GP% are scored 1–5 automatically from the boundaries
              below. Below the 1st number scores 1; at or above the 4th scores 5; each boundary must be bigger than
              the last.
            </p>
            <div className="space-y-4">
              {THRESHOLD_METRICS.map(({ key, label, isPercent }) => (
                <div key={key}>
                  <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <label key={i} className="text-xs">
                        <span className="mb-1 block text-slate-500 dark:text-slate-400">
                          Score {i + 2} starts at{isPercent ? " (%)" : ""}
                        </span>
                        <input
                          type="number"
                          className={NUM_FIELD}
                          value={(thresholds[key] || [])[i] ?? ""}
                          onChange={(e) => setThresholdAt(key, i, e.target.value)}
                          step={isPercent ? "0.1" : "1"}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Priority tiers</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              A Weighted Score at or above each cutoff gets that priority tier; below the lowest cutoff is Hold.
              Priority 1 must be higher than Priority 2, and Priority 2 higher than Review.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Priority 1 (score ≥)</span>
                <input type="number" className={NUM_FIELD} value={cutoffs.priority1 ?? ""} onChange={(e) => setCutoff("priority1", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Priority 2 (score ≥)</span>
                <input type="number" className={NUM_FIELD} value={cutoffs.priority2 ?? ""} onChange={(e) => setCutoff("priority2", e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600 dark:text-slate-300">Review (score ≥)</span>
                <input type="number" className={NUM_FIELD} value={cutoffs.review ?? ""} onChange={(e) => setCutoff("review", e.target.value)} />
              </label>
            </div>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">Save these rules</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Optional: note why you're changing this, for whoever looks at the history below later.
            </p>
            <textarea
              className={FIELD + " mb-3 w-full"}
              rows={2}
              placeholder="e.g. Updated Annual GP$ thresholds for FY27 targets"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              onClick={save}
              disabled={saving || !weightTotalOk}
              className="rounded bg-[#0B3EAF] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save new rules"}
            </button>
          </section>

          <section className="card p-4 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-[#000000] dark:text-white">History</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Every past version is kept — saving never overwrites an earlier one, which is what lets older requests
              keep the rules they were originally scored with.
            </p>
            {history.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">No changes have been saved yet — the built-in defaults are still in effect.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h.id} className="rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {formatDate(h.created_at)} — {h.created_by_name || "—"}
                      </span>
                      {h.id === meta.id ? (
                        <span className="rounded-full bg-[#0B3EAF]/10 px-2 py-0.5 text-xs font-semibold text-[#0B3EAF] dark:bg-[#A7D344]/10 dark:text-[#A7D344]">
                          Currently in effect
                        </span>
                      ) : null}
                    </div>
                    {h.note ? <div className="mt-1 text-slate-500 dark:text-slate-400">{h.note}</div> : null}
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
