// ─── Gate 1 launch scorecard — client-side mirror of
// backend/src/services/npdScoring.js ───────────────────────────────────────
// Used ONLY for an instant preview as someone fills in the form — the
// server always recomputes authoritatively on save and that's what actually
// gets stored, so a mismatch here is a cosmetic preview glitch, never a data
// integrity issue. Keep this in sync with the backend module if the Scoring
// Guide's thresholds or weights ever change.

function toFiniteNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toManualScore(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function scoreVolume(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  if (n < 100000) return 1;
  if (n < 250000) return 2;
  if (n < 500000) return 3;
  if (n < 1000000) return 4;
  return 5;
}

function scoreRevenue(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  if (n < 500000) return 1;
  if (n < 1000000) return 2;
  if (n < 2000000) return 3;
  if (n < 3000000) return 4;
  return 5;
}

function scoreGpDollars(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  if (n < 100000) return 1;
  if (n < 250000) return 2;
  if (n < 500000) return 3;
  if (n < 750000) return 4;
  return 5;
}

// Accepts either a decimal fraction (0.11) or a plain percentage (11) —
// matches the normalization the backend applies when it saves this field.
function scoreGpPercent(v) {
  let n = toFiniteNumber(v);
  if (n === null) return null;
  if (n > 1) n = n / 100;
  if (n < 0.06) return 1;
  if (n < 0.07) return 2;
  if (n <= 0.12) return 3;
  if (n < 0.15) return 4;
  return 5;
}

const WEIGHTS = {
  volumeScore: 15,
  revenueScore: 15,
  gpDollarScore: 25,
  gpPercentScore: 10,
  strategicFitScore: 10,
  customerMarketValueScore: 5,
  complexityScore: 10,
  speedToMarketScore: 10,
};

function computeWeightedScore(scores) {
  let total = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const s = scores[key];
    if (typeof s !== "number" || !Number.isFinite(s) || s < 1 || s > 5) return null;
    total += (s / 5) * WEIGHTS[key];
  }
  return Math.round(total * 10) / 10;
}

function classifyPriority(weightedScore) {
  if (typeof weightedScore !== "number" || !Number.isFinite(weightedScore)) return null;
  if (weightedScore >= 80) return "Priority 1";
  if (weightedScore >= 65) return "Priority 2";
  if (weightedScore >= 50) return "Review";
  return "Hold";
}

// Takes the same raw field names used throughout the app (annual_volume_kg,
// annual_revenue, ...) and returns a live preview: the 4 auto-scores, the
// weighted score (or null until all 8 metrics are in), and the priority tier.
export function previewScorecard(fields = {}) {
  const volumeScore = scoreVolume(fields.annual_volume_kg);
  const revenueScore = scoreRevenue(fields.annual_revenue);
  const gpDollarScore = scoreGpDollars(fields.annual_gp_dollars);
  const gpPercentScore = scoreGpPercent(fields.gp_percent);
  const strategicFitScore = toManualScore(fields.strategic_fit_score);
  const customerMarketValueScore = toManualScore(fields.customer_market_value_score);
  const complexityScore = toManualScore(fields.complexity_score);
  const speedToMarketScore = toManualScore(fields.speed_to_market_score);

  const weightedScore = computeWeightedScore({
    volumeScore,
    revenueScore,
    gpDollarScore,
    gpPercentScore,
    strategicFitScore,
    customerMarketValueScore,
    complexityScore,
    speedToMarketScore,
  });

  return {
    volumeScore,
    revenueScore,
    gpDollarScore,
    gpPercentScore,
    weightedScore,
    priorityTier: classifyPriority(weightedScore),
  };
}

export const NPD_PRIORITY_TIERS = ["Priority 1", "Priority 2", "Review", "Hold"];

export function npdPriorityBadgeClass(tier) {
  switch (tier) {
    case "Priority 1":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "Priority 2":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "Review":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "Hold":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    default:
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}
