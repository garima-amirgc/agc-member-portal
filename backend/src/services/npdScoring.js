// ─── Gate 1 launch scorecard — pure scoring logic ──────────────────────────
// Mirrors the formulas in "New_Product_Launch_Scorecard.xlsx" (Scoring Guide
// + Launch Scorecard tabs) exactly, so the numbers the app computes always
// match what Garima and the team already know from the spreadsheet. No DB
// access here on purpose — this is pure math so it's easy to unit-test and
// safe to call from both the create and update paths without worrying about
// side effects.
//
// Weights (sum to 100%): Annual Volume 15, Annual Revenue 15, Annual GP$ 25,
// GP% 10, Strategic Fit 10, Customer/Market Value 5, Complexity 10,
// Speed to Market 10.
//
// 2026-11-15 — Gate 1 scoring rules made configurable (per explicit request:
// whoever has NPD edit access can adjust the weights/thresholds/priority
// cutoffs going forward, without retroactively re-scoring already-saved
// requests). Every function below now takes an optional `config` argument
// shaped like DEFAULT_SCORING_CONFIG; omit it (or pass null/undefined) and
// you get the exact original hardcoded values, so every existing call site
// and every request scored before this change keeps behaving identically.
// The actual persisted/editable config lives in the npd_scoring_config_versions
// table and is read/written by npdWorkflow.service.js — this file never
// touches the database.

function toFiniteNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The exact values this module used before scoring became configurable.
// `thresholds` arrays are 4 ascending boundaries per auto-scored metric:
// below [0]=1, below [1]=2, below [2]=3, below [3]=4, else 5 — except
// gpPercentThresholds, where the 3rd boundary is inclusive (<=), matching
// the source workbook's own formula exactly (see scoreGpPercent below).
const DEFAULT_SCORING_CONFIG = Object.freeze({
  weights: Object.freeze({
    volumeScore: 15,
    revenueScore: 15,
    gpDollarScore: 25,
    gpPercentScore: 10,
    strategicFitScore: 10,
    customerMarketValueScore: 5,
    complexityScore: 10,
    speedToMarketScore: 10,
  }),
  // Annual Volume (kg): <100,000=1, <250,000=2, <500,000=3, <1,000,000=4, else 5.
  volumeThresholds: Object.freeze([100000, 250000, 500000, 1000000]),
  // Annual Revenue: <$500K=1, <$1.0M=2, <$2.0M=3, <$3.0M=4, else 5.
  revenueThresholds: Object.freeze([500000, 1000000, 2000000, 3000000]),
  // Annual GP$: <$100K=1, <$250K=2, <$500K=3, <$750K=4, else 5.
  gpDollarThresholds: Object.freeze([100000, 250000, 500000, 750000]),
  // GP% (decimal fraction, e.g. 0.11 for 11%): <6%=1, <7%=2, <=12%=3, <15%=4, else 5.
  gpPercentThresholds: Object.freeze([0.06, 0.07, 0.12, 0.15]),
  // 80–100 = Priority 1, 65–79.9 = Priority 2, 50–64.9 = Review, <50 = Hold.
  priorityCutoffs: Object.freeze({ priority1: 80, priority2: 65, review: 50 }),
});

// 1–5 manual scores (Strategic Fit, Customer/Market Value, Complexity, Speed
// to Market) are anchored at 1/3/5 in the Scoring Guide but real usage in
// the source workbook also uses 2 and 4 — so any integer 1–5 is valid, not
// just the three anchor values. Not configurable — these are fixed 1–5
// manual entries, only the auto-scored thresholds/weights/cutoffs are.
function toManualScore(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function scoreFromAscendingThresholds(v, thresholds, inclusiveThirdBoundary) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  const [t0, t1, t2, t3] = thresholds;
  if (n < t0) return 1;
  if (n < t1) return 2;
  if (inclusiveThirdBoundary ? n <= t2 : n < t2) return 3;
  if (n < t3) return 4;
  return 5;
}

function scoreVolume(annualVolumeKg, config = DEFAULT_SCORING_CONFIG) {
  return scoreFromAscendingThresholds(annualVolumeKg, config.volumeThresholds, false);
}

function scoreRevenue(annualRevenue, config = DEFAULT_SCORING_CONFIG) {
  return scoreFromAscendingThresholds(annualRevenue, config.revenueThresholds, false);
}

function scoreGpDollars(annualGpDollars, config = DEFAULT_SCORING_CONFIG) {
  return scoreFromAscendingThresholds(annualGpDollars, config.gpDollarThresholds, false);
}

// The <=12% boundary (rather than <12%) matches the source workbook's
// formula exactly — kept as a fixed shape of the rule even when the
// threshold values themselves are edited.
function scoreGpPercent(gpPercent, config = DEFAULT_SCORING_CONFIG) {
  return scoreFromAscendingThresholds(gpPercent, config.gpPercentThresholds, true);
}

// Backward-compatible named export some older call sites may still import
// directly — equal to DEFAULT_SCORING_CONFIG.weights.
const WEIGHTS = DEFAULT_SCORING_CONFIG.weights;

// Weighted Score = ROUND(sum of (score/5 * weight) across all 8 metrics, 1).
// The source workbook blanks the score until all 8 inputs are present
// (COUNT(...)<8 => ""); this does the same — returns null, not a partial
// score, until every one of the 8 is a valid 1–5 number.
function computeWeightedScore(scores, config = DEFAULT_SCORING_CONFIG) {
  const weights = config.weights || DEFAULT_SCORING_CONFIG.weights;
  const keys = Object.keys(DEFAULT_SCORING_CONFIG.weights);
  let total = 0;
  for (const key of keys) {
    const s = scores[key];
    if (typeof s !== "number" || !Number.isFinite(s) || s < 1 || s > 5) return null;
    const w = typeof weights[key] === "number" ? weights[key] : DEFAULT_SCORING_CONFIG.weights[key];
    total += (s / 5) * w;
  }
  return Math.round(total * 10) / 10;
}

function classifyPriority(weightedScore, config = DEFAULT_SCORING_CONFIG) {
  if (typeof weightedScore !== "number" || !Number.isFinite(weightedScore)) return null;
  const cutoffs = config.priorityCutoffs || DEFAULT_SCORING_CONFIG.priorityCutoffs;
  if (weightedScore >= cutoffs.priority1) return "Priority 1";
  if (weightedScore >= cutoffs.priority2) return "Priority 2";
  if (weightedScore >= cutoffs.review) return "Review";
  return "Hold";
}

// Top-level entry point: takes the raw fields a requester enters and returns
// every computed column that gets persisted on npd_requests. Manual scores
// that are missing or out of range come back as null (and so does anything
// downstream of them) rather than throwing — a request can be saved
// partially scored, exactly like the source workbook shows a blank
// Weighted Score/Priority until every input is filled in.
//
// `config` is the scoring-rules version this particular calculation should
// use — the caller (npdWorkflow.service.js) decides which one: the current
// active config for a brand-new request, or a request's own already-locked
// version when re-scoring on an edit. Omitting it falls back to the
// original hardcoded defaults.
function computeScorecard(fields = {}, config = DEFAULT_SCORING_CONFIG) {
  const volumeScore = scoreVolume(fields.annualVolumeKg, config);
  const revenueScore = scoreRevenue(fields.annualRevenue, config);
  const gpDollarScore = scoreGpDollars(fields.annualGpDollars, config);
  const gpPercentScore = scoreGpPercent(fields.gpPercent, config);
  const strategicFitScore = toManualScore(fields.strategicFitScore);
  const customerMarketValueScore = toManualScore(fields.customerMarketValueScore);
  const complexityScore = toManualScore(fields.complexityScore);
  const speedToMarketScore = toManualScore(fields.speedToMarketScore);

  const weightedScore = computeWeightedScore(
    {
      volumeScore,
      revenueScore,
      gpDollarScore,
      gpPercentScore,
      strategicFitScore,
      customerMarketValueScore,
      complexityScore,
      speedToMarketScore,
    },
    config
  );
  const priorityTier = classifyPriority(weightedScore, config);

  return {
    volumeScore,
    revenueScore,
    gpDollarScore,
    gpPercentScore,
    strategicFitScore,
    customerMarketValueScore,
    complexityScore,
    speedToMarketScore,
    weightedScore,
    priorityTier,
  };
}

module.exports = {
  WEIGHTS,
  DEFAULT_SCORING_CONFIG,
  toFiniteNumber,
  toManualScore,
  scoreVolume,
  scoreRevenue,
  scoreGpDollars,
  scoreGpPercent,
  computeWeightedScore,
  classifyPriority,
  computeScorecard,
};
