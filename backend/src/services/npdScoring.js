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

function toFiniteNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 1–5 manual scores (Strategic Fit, Customer/Market Value, Complexity, Speed
// to Market) are anchored at 1/3/5 in the Scoring Guide but real usage in
// the source workbook also uses 2 and 4 — so any integer 1–5 is valid, not
// just the three anchor values.
function toManualScore(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

// Annual Volume (kg): <100,000=1, <250,000=2, <500,000=3, <1,000,000=4, else 5.
function scoreVolume(annualVolumeKg) {
  const v = toFiniteNumber(annualVolumeKg);
  if (v === null) return null;
  if (v < 100000) return 1;
  if (v < 250000) return 2;
  if (v < 500000) return 3;
  if (v < 1000000) return 4;
  return 5;
}

// Annual Revenue: <$500K=1, <$1.0M=2, <$2.0M=3, <$3.0M=4, else 5.
function scoreRevenue(annualRevenue) {
  const v = toFiniteNumber(annualRevenue);
  if (v === null) return null;
  if (v < 500000) return 1;
  if (v < 1000000) return 2;
  if (v < 2000000) return 3;
  if (v < 3000000) return 4;
  return 5;
}

// Annual GP$: <$100K=1, <$250K=2, <$500K=3, <$750K=4, else 5.
function scoreGpDollars(annualGpDollars) {
  const v = toFiniteNumber(annualGpDollars);
  if (v === null) return null;
  if (v < 100000) return 1;
  if (v < 250000) return 2;
  if (v < 500000) return 3;
  if (v < 750000) return 4;
  return 5;
}

// GP% (as a decimal fraction, e.g. 0.11 for 11%): <6%=1, <7%=2, <=12%=3,
// <15%=4, else 5. The <=12% boundary (rather than <12%) matches the source
// workbook's formula exactly.
function scoreGpPercent(gpPercent) {
  const v = toFiniteNumber(gpPercent);
  if (v === null) return null;
  if (v < 0.06) return 1;
  if (v < 0.07) return 2;
  if (v <= 0.12) return 3;
  if (v < 0.15) return 4;
  return 5;
}

const WEIGHTS = Object.freeze({
  volumeScore: 15,
  revenueScore: 15,
  gpDollarScore: 25,
  gpPercentScore: 10,
  strategicFitScore: 10,
  customerMarketValueScore: 5,
  complexityScore: 10,
  speedToMarketScore: 10,
});

// Weighted Score = ROUND(sum of (score/5 * weight) across all 8 metrics, 1).
// The source workbook blanks the score until all 8 inputs are present
// (COUNT(...)<8 => ""); this does the same — returns null, not a partial
// score, until every one of the 8 is a valid 1–5 number.
function computeWeightedScore(scores) {
  const keys = Object.keys(WEIGHTS);
  let total = 0;
  for (const key of keys) {
    const s = scores[key];
    if (typeof s !== "number" || !Number.isFinite(s) || s < 1 || s > 5) return null;
    total += (s / 5) * WEIGHTS[key];
  }
  return Math.round(total * 10) / 10;
}

// 80–100 = Priority 1, 65–79.9 = Priority 2, 50–64.9 = Review, <50 = Hold.
function classifyPriority(weightedScore) {
  if (typeof weightedScore !== "number" || !Number.isFinite(weightedScore)) return null;
  if (weightedScore >= 80) return "Priority 1";
  if (weightedScore >= 65) return "Priority 2";
  if (weightedScore >= 50) return "Review";
  return "Hold";
}

// Top-level entry point: takes the raw fields a requester enters and returns
// every computed column that gets persisted on npd_requests. Manual scores
// that are missing or out of range come back as null (and so does anything
// downstream of them) rather than throwing — a request can be saved
// partially scored, exactly like the source workbook shows a blank
// Weighted Score/Priority until every input is filled in.
function computeScorecard(fields = {}) {
  const volumeScore = scoreVolume(fields.annualVolumeKg);
  const revenueScore = scoreRevenue(fields.annualRevenue);
  const gpDollarScore = scoreGpDollars(fields.annualGpDollars);
  const gpPercentScore = scoreGpPercent(fields.gpPercent);
  const strategicFitScore = toManualScore(fields.strategicFitScore);
  const customerMarketValueScore = toManualScore(fields.customerMarketValueScore);
  const complexityScore = toManualScore(fields.complexityScore);
  const speedToMarketScore = toManualScore(fields.speedToMarketScore);

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
  const priorityTier = classifyPriority(weightedScore);

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
