const ROLES = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

/** Normalize role strings from DB or clients (any casing) to ROLES.* values. */
function canonicalRole(raw) {
  const s = raw != null ? String(raw).trim() : "";
  const sl = s.toLowerCase();
  if (sl === "admin" || sl === "administrator" || sl === "superadmin" || sl === "super admin") {
    return ROLES.ADMIN;
  }
  if (sl === "manager") return ROLES.MANAGER;
  if (sl === "employee") return ROLES.EMPLOYEE;
  return s;
}

const BUSINESS_UNITS = ["AGC", "AQM", "SCF", "ASP"];
const ASSIGNMENT_STATUS = ["pending", "in_progress", "completed"];

/** Org department (user directory + IT ticket routing) */
const DEPARTMENTS = ["IT", "Finance", "Sales", "Purchase", "Safety", "Production"];

const TICKET_STATUS = ["open", "in_progress", "closed"];
const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"];
const TICKET_PRIORITY_DEFAULT = "medium";

module.exports = {
  ROLES,
  BUSINESS_UNITS,
  ASSIGNMENT_STATUS,
  DEPARTMENTS,
  TICKET_STATUS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_DEFAULT,
  canonicalRole,
};
