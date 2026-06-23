export const ADMIN_NAV_GROUPS = Object.freeze([
  { key: "hr", label: "HR" },
  { key: "social", label: "Social Committee" },
  { key: "sales", label: "Sales" },
  { key: "it", label: "IT" },
  { key: "uofagc", label: "UofAGC" },
]);

const GROUP_LABEL_BY_KEY = Object.fromEntries(ADMIN_NAV_GROUPS.map((g) => [g.key, g.label]));

export function adminNavGroupLabel(groupKey) {
  return GROUP_LABEL_BY_KEY[groupKey] || "";
}

export function buildAdminNavGroups(items) {
  return ADMIN_NAV_GROUPS.map(({ key, label }) => ({
    key,
    label,
    items: items.filter((item) => item.group === key),
  })).filter((group) => group.items.length > 0);
}
