export const ADMIN_GRANT_KEYS = Object.freeze({
  ENGAGEMENT_CALENDAR: "engagement_calendar",
  UPCOMING: "upcoming",
  UPCOMING_EVENTS: "upcoming_events",
  EMPLOYEE_OF_MONTH: "employee_of_month",
  LEADERSHIP_UPDATES: "leadership_updates",
  NEW_HIRES: "new_hires",
  CUSTOMER_WINS: "customer_wins",
  COMMUNITY_INVOLVEMENT: "community_involvement",
  USERS: "users",
  LEARNING_ADMIN: "learning_admin",
  REPORTS: "reports",
  SYSTEM: "system",
  FEEDBACK_POLLS: "feedback_polls",
  COMPANY_CONTENT: "company_content",
  IT_TICKETS: "it_tickets",
});

export const SPOTLIGHT_ADMIN_GRANT_KEYS = Object.freeze([
  ADMIN_GRANT_KEYS.EMPLOYEE_OF_MONTH,
  ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES,
  ADMIN_GRANT_KEYS.NEW_HIRES,
  ADMIN_GRANT_KEYS.CUSTOMER_WINS,
  ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT,
]);

export const ADMIN_GRANT_OPTION_GROUPS = Object.freeze([
  {
    groupKey: "hr",
    label: "HR",
    options: [
      { key: ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR, label: "Calendar (add holidays / activities)" },
      { key: ADMIN_GRANT_KEYS.EMPLOYEE_OF_MONTH, label: "Employee of the Month" },
      { key: ADMIN_GRANT_KEYS.LEADERSHIP_UPDATES, label: "Leadership updates" },
      { key: ADMIN_GRANT_KEYS.NEW_HIRES, label: "New hires" },
      { key: ADMIN_GRANT_KEYS.COMMUNITY_INVOLVEMENT, label: "Community involvement" },
      { key: ADMIN_GRANT_KEYS.COMPANY_CONTENT, label: "About Company (policies, forms, links)" },
      { key: ADMIN_GRANT_KEYS.FEEDBACK_POLLS, label: "Feedback & polls (popup surveys)" },
    ],
  },
  {
    groupKey: "social",
    label: "Social Committee",
    options: [{ key: ADMIN_GRANT_KEYS.UPCOMING_EVENTS, label: "Manage upcoming events" }],
  },
  {
    groupKey: "sales",
    label: "Sales",
    options: [{ key: ADMIN_GRANT_KEYS.CUSTOMER_WINS, label: "Customer wins" }],
  },
  {
    groupKey: "it",
    label: "IT",
    options: [
      { key: ADMIN_GRANT_KEYS.USERS, label: "Users (create, edit, invites)" },
      { key: ADMIN_GRANT_KEYS.REPORTS, label: "Manage Power BI reports" },
      { key: ADMIN_GRANT_KEYS.SYSTEM, label: "System status" },
      { key: ADMIN_GRANT_KEYS.IT_TICKETS, label: "IT Tickets — view all tickets (full visibility)" },
    ],
  },
  {
    groupKey: "uofagc",
    label: "UofAGC",
    options: [
      {
        key: ADMIN_GRANT_KEYS.LEARNING_ADMIN,
        label: "Learning admin (courses, videos, assignments, resource docs)",
      },
    ],
  },
]);

export const ADMIN_GRANT_OPTIONS = Object.freeze(
  ADMIN_GRANT_OPTION_GROUPS.flatMap((group) => group.options)
);

export function adminGrantLabel(key) {
  if (key === ADMIN_GRANT_KEYS.UPCOMING) {
    return "Manage upcoming events";
  }
  const found = ADMIN_GRANT_OPTIONS.find((o) => o.key === key);
  return found?.label || String(key || "");
}

export function normalizeAdminGrantsForUi(grants) {
  const out = [];
  const seen = new Set();
  for (const raw of grants || []) {
    let k = String(raw || "").trim();
    if (k === ADMIN_GRANT_KEYS.UPCOMING) k = ADMIN_GRANT_KEYS.UPCOMING_EVENTS;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.sort();
}
