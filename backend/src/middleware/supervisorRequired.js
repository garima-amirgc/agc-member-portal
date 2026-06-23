const { hasDirectReports } = require("../services/supervisor.service");

async function supervisorRequired(req, res, next) {
  try {
    if (await hasDirectReports(req.user.id)) return next();
    return res.status(403).json({ message: "Forbidden" });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
}

module.exports = { supervisorRequired };
