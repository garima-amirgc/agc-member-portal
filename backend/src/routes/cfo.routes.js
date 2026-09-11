const express = require("express");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const cfoReports = require("../services/cfoReports.service");
const sp = require("../services/sharepoint.service");

const router = express.Router();

router.use(authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.CFO));

router.get("/status", (req, res) => {
  res.json({ configured: sp.isConfigured() });
});

router.get("/report/:key", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const data = await cfoReports.getReport(req.params.key, { forceRefresh });
    res.json(data);
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
    console.error("[cfo]", e);
    res.status(500).json({ message: `Could not load that report: ${e?.message || "unknown error"}` });
  }
});

module.exports = router;
