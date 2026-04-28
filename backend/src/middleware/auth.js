const jwt = require("jsonwebtoken");
const { db } = require("../config/db");
const userDeptSvc = require("../services/userDepartments.service");

const authRequired = (req, res, next) => {
  (async () => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await db
      .prepare(
        "SELECT id, name, email, role, business_unit, manager_id, designation, COALESCE(NULLIF(TRIM(department), ''), 'Production') AS department FROM users WHERE id = ?"
      )
      .get(payload.id);

    if (!user) return res.status(401).json({ message: "Invalid token" });

    const role = user.role != null ? String(user.role).trim() : "";
    const departments = await userDeptSvc.listForUser(user.id);
    const department = departments[0] || user.department || "Production";
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      business_unit: user.business_unit,
      manager_id: user.manager_id,
      designation: user.designation != null ? String(user.designation) : "",
      department,
      departments,
    };
    return next();
  })().catch(next);
};

const allowRoles = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

module.exports = { authRequired, allowRoles };
