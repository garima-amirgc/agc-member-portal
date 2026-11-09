import { FACILITY_CODES } from "./facilities";

// The real production plants (Garima: "there are 3 plants AQM, SCF, ASP").
// Reuses the app's existing FACILITY_CODES list rather than a separate
// hardcoded one, minus "AGC" — that's the parent company code, not a plant.
export const NPD_PLANT_OPTIONS = FACILITY_CODES.filter((c) => c !== "AGC").map((c) => ({ value: c, label: c }));

// Shared 1–5 option list for the Gate 1 scorecard's manual scores. 1/3/5 are
// anchored to the source workbook's own Scoring Guide wording; 2 and 4 get
// their own short in-between labels (not invented Excel content — just a
// plain-language midpoint) so every option looks filled in and consistent,
// rather than mixing worded options with bare numbers.
export function NPD_SCORE_OPTIONS(label1, label2, label3, label4, label5) {
  return [
    { value: "1", label: `1 — ${label1}` },
    { value: "2", label: `2 — ${label2}` },
    { value: "3", label: `3 — ${label3}` },
    { value: "4", label: `4 — ${label4}` },
    { value: "5", label: `5 — ${label5}` },
  ];
}

// The 4 manually-scored Gate 1 metrics — shared by NpdScorecardForm (used by
// both the New Request page and the request detail page's edit mode) so the
// anchor wording only has to be written once.
export const NPD_SCORECARD_METRIC_DEFS = [
  {
    key: "strategic_fit_score",
    label: "Strategic Fit",
    options: NPD_SCORE_OPTIONS(
      "Weak / opportunistic",
      "Limited strategic value",
      "Supports an established strategic priority",
      "Strong strategic fit",
      "Critical to a major strategic priority"
    ),
  },
  {
    key: "customer_market_value_score",
    label: "Customer / Market Value",
    options: NPD_SCORE_OPTIONS(
      "Small/niche opportunity",
      "Modest customer or market value",
      "Meaningful customer or market growth",
      "Significant customer or market growth",
      "Major customer, market entry or scalable platform"
    ),
  },
  {
    key: "complexity_score",
    label: "Complexity (easy to execute scores HIGH)",
    options: NPD_SCORE_OPTIONS(
      "Very complex / major changes",
      "Fairly complex",
      "Moderate complexity",
      "Mostly straightforward",
      "Fits current capabilities / simple execution"
    ),
  },
  {
    key: "speed_to_market_score",
    label: "Speed to Market (fast scores HIGH)",
    options: NPD_SCORE_OPTIONS("More than 9 months", "6–9 months", "3–6 months", "90 days – 3 months", "Less than 90 days"),
  },
];

// Channel values as actually used across the Launch Scorecard workbook's
// real rows (Co-man, Retail, Foodservice, Industrial Sales — one entry had
// a typo, "Industial Sales", normalized here). The workbook itself left this
// column as free text with no dropdown, but a fixed list keeps new entries
// consistent going forward.
export const NPD_CHANNEL_OPTIONS = [
  { value: "Co-man", label: "Co-man" },
  { value: "Retail", label: "Retail" },
  { value: "Foodservice", label: "Foodservice" },
  { value: "Industrial Sales", label: "Industrial Sales" },
];
