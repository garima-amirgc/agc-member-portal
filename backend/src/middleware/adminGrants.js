const { hasAdminGrant } = require("../config/adminGrants");

function requireAdminGrant(grantKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!hasAdminGrant(req.user, grantKey)) {
      return res.status(403).json({ message: "You do not have access to this administration area." });
    }
    return next();
  };
}

module.exports = { requireAdminGrant };
