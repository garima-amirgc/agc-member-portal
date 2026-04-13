export const CATEGORIES = [
  { key: "finance", label: "Finance" },
  { key: "sales", label: "Sales" },
  { key: "hr", label: "HR" },
  { key: "safety", label: "Safety" },
  { key: "production", label: "Production" },
];

/** @param {string} facilityCode uppercase e.g. AGC */
export function storageKey(userId, categoryKey, facilityCode) {
  const f = facilityCode || "AGC";
  return `resources_progress_v2:${userId || "anon"}:${f}:${categoryKey}`;
}

/** No placeholder rows — only LMS/API content is shown (see mergeLmsResourceItems). */
export function seedItems(_categoryKey) {
  return { videos: [], docs: [] };
}

/** Merge LMS items from the API (videos + documents uploaded in admin). */
export function mergeLmsResourceItems(seedBlock, lmsVideos, lmsDocs) {
  const extraV = Array.isArray(lmsVideos) ? lmsVideos : [];
  const extraD = Array.isArray(lmsDocs) ? lmsDocs : [];
  return {
    videos: [...(seedBlock?.videos || []), ...extraV],
    docs: [...(seedBlock?.docs || []), ...extraD],
  };
}

export function computeProgress({ items, completedSet }) {
  const all = [...(items?.videos || []), ...(items?.docs || [])];
  const totalCount = all.length;
  const completedCount = all.filter((x) => completedSet?.has(x.id)).length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return { totalCount, completedCount, progress };
}
