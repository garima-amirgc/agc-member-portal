/** Must match backend `config/adminGrants.js` ADMIN_GRANT_KEYS values. */
export const ADMIN_GRANT_KEYS = Object.freeze({
  ENGAGEMENT_CALENDAR: "engagement_calendar",
  UPCOMING: "upcoming",
  USERS: "users",
  LEARNING_ADMIN: "learning_admin",
  REPORTS: "reports",
  SYSTEM: "system",
  BIRTHDAYS: "birthdays",
  FEEDBACK_POLLS: "feedback_polls",
});

/** Labels for user admin — optional areas (full admins have all). */
export const ADMIN_GRANT_OPTIONS = Object.freeze([
  { key: ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR, label: "Calendar (add holidays / activities)" },
  { key: ADMIN_GRANT_KEYS.UPCOMING, label: "Upcoming events" },
  { key: ADMIN_GRANT_KEYS.USERS, label: "Users (create, edit, invites)" },
  { key: ADMIN_GRANT_KEYS.LEARNING_ADMIN, label: "Learning admin (courses, videos, assignments, resource docs)" },
  { key: ADMIN_GRANT_KEYS.REPORTS, label: "Manage Power BI reports" },
  { key: ADMIN_GRANT_KEYS.SYSTEM, label: "System status" },
  { key: ADMIN_GRANT_KEYS.BIRTHDAYS, label: "Birthday directory (admin API)" },
  { key: ADMIN_GRANT_KEYS.FEEDBACK_POLLS, label: "Feedback & polls (popup surveys)" },
]);
