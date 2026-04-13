const ROLES = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

const BUSINESS_UNITS = ["AGC", "AQM", "SCF", "ASP"];
const ASSIGNMENT_STATUS = ["pending", "in_progress", "completed"];

/** Org department (user directory + IT ticket routing) */
const DEPARTMENTS = ["IT", "Finance", "Sales", "Purchase", "Safety", "Production"];

const TICKET_STATUS = ["open", "in_progress", "closed"];

module.exports = { ROLES, BUSINESS_UNITS, ASSIGNMENT_STATUS, DEPARTMENTS, TICKET_STATUS };
