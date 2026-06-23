const DEFAULT_YEAR = 2026;
const DEFAULT_SUBTITLE =
  "Quick reference for the year — events are coordinated by HR/Leadership.";

const DEFAULT_MONTHS = [
  {
    name: "January",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [{ title: "New Year Month", meta: "" }],
    art: "fireworks",
  },
  {
    name: "February",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [
      { title: "Black History Week", meta: "" },
      { title: "Chinese New Year", meta: "17th" },
    ],
    art: "ribbon",
  },
  {
    name: "March",
    theme: { bar: "bg-[#6aa0b7]", accent: "text-[#24566a]" },
    items: [{ title: "International Women’s Day", meta: "8th" }],
    art: "women",
  },
  {
    name: "April",
    theme: { bar: "bg-[#4e7b5d]", accent: "text-[#2f5c3f]" },
    items: [{ title: "Earth Day (Tree Planting Day)", meta: "TBD · 22nd" }],
    art: "earth",
  },
  {
    name: "May",
    theme: { bar: "bg-[#d59aa2]", accent: "text-[#7a3a45]" },
    items: [{ title: "Mother’s Day", meta: "10th" }],
    art: "mother",
  },
  {
    name: "June",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [
      { title: "Father’s Day", meta: "21st" },
      { title: "National Donut Day", meta: "5th" },
    ],
    art: "donut",
  },
  {
    name: "July",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [{ title: "Canada Day", meta: "July 1st" }],
    art: "canada",
  },
  {
    name: "August",
    theme: { bar: "bg-[#6aa0b7]", accent: "text-[#24566a]" },
    items: [{ title: "Employee Appreciation BBQ Month", meta: "" }],
    art: "bbq",
  },
  {
    name: "September",
    theme: { bar: "bg-[#4e7b5d]", accent: "text-[#2f5c3f]" },
    items: [{ title: "National Day for Truth and Reconciliation", meta: "30th" }],
    art: "orange",
  },
  {
    name: "October",
    theme: { bar: "bg-[#d59aa2]", accent: "text-[#7a3a45]" },
    items: [{ title: "Thanksgiving potluck", meta: "23rd" }],
    art: "pumpkin",
  },
  {
    name: "November",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [{ title: "Remembrance Day", meta: "Nov 11" }],
    art: "poppy",
  },
  {
    name: "December",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [
      { title: "Year End Gala Party", meta: "" },
      { title: "Festive Fusion Week", meta: "" },
    ],
    art: "party",
  },
];

function defaultDataJson() {
  return JSON.stringify({ subtitle: DEFAULT_SUBTITLE, months: DEFAULT_MONTHS });
}

const ENGAGEMENT_ART_KINDS = [
  "fireworks",
  "ribbon",
  "women",
  "earth",
  "mother",
  "donut",
  "canada",
  "bbq",
  "orange",
  "pumpkin",
  "poppy",
  "party",
];
const ENGAGEMENT_ART_KIND_SET = new Set(ENGAGEMENT_ART_KINDS);

function normalizeEngagementMonths(monthsIn) {
  if (!Array.isArray(monthsIn) || monthsIn.length !== 12) return null;
  const out = [];
  for (let i = 0; i < 12; i += 1) {
    const m = monthsIn[i];
    const d = DEFAULT_MONTHS[i];
    const name =
      m && typeof m.name === "string" && m.name.trim() ? m.name.trim() : d.name;
    const t = m && m.theme && typeof m.theme === "object" ? m.theme : {};
    const theme = {
      bar: typeof t.bar === "string" ? t.bar.slice(0, 200) : d.theme.bar,
      accent: typeof t.accent === "string" ? t.accent.slice(0, 200) : d.theme.accent,
    };
    const art =
      m && typeof m.art === "string" && ENGAGEMENT_ART_KIND_SET.has(m.art) ? m.art : d.art;
    const rawItems = m && Array.isArray(m.items) ? m.items : [];
    const items = rawItems.map((it) => {
      const rawTitle = it && it.title != null ? String(it.title).trim() : "";
      const title = rawTitle || "New event";
      const meta = it && it.meta != null ? String(it.meta).slice(0, 500) : "";
      return { title, meta };
    });
    out.push({ name, theme, items, art });
  }
  return out;
}

module.exports = {
  DEFAULT_YEAR,
  DEFAULT_SUBTITLE,
  DEFAULT_MONTHS,
  defaultDataJson,
  ENGAGEMENT_ART_KINDS,
  ENGAGEMENT_ART_KIND_SET,
  normalizeEngagementMonths,
};
