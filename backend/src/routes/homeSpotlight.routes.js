const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant, requireAdminGrantAny } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, SPOTLIGHT_ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { normalizeWidgetOrder, readWidgetOrder, writeWidgetOrder } = require("../utils/spotlightFeedDb");

const router = express.Router();

router.get("/layout", authRequired, async (_req, res) => {
  try {
    const order = await readWidgetOrder(db);
    return res.json({ order: normalizeWidgetOrder(order) });
  } catch (e) {
    console.error("[home-spotlight] layout get:", e);
    return res.status(500).json({ message: "Could not load home spotlight layout." });
  }
});

router.put("/layout", authRequired, requireAdminGrantAny(...SPOTLIGHT_ADMIN_GRANT_KEYS), async (req, res) => {
  try {
    const order = await writeWidgetOrder(db, req.body?.order);
    return res.json({ order });
  } catch (e) {
    console.error("[home-spotlight] layout put:", e);
    return res.status(500).json({ message: "Could not save home spotlight layout." });
  }
});

module.exports = router;
