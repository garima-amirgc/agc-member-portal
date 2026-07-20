"use strict";

const express = require("express");
const { authRequired } = require("../middleware/auth");
const adpSvc = require("../services/adp.service");

const router = express.Router();
router.use(authRequired);

/**
 * GET /adp/me
 *
 * Returns the ADP Workforce Now employee record for the currently
 * authenticated user (matched by their portal email address).
 *
 * 200  { associate_oid, worker_id, legal_name, preferred_name,
 *         work_email, work_phone, job_title, department,
 *         work_location, hire_date, employment_status, employment_type }
 * 404  No ADP record found for this email
 * 503  ADP integration not configured (env vars missing)
 * 502  ADP API call failed
 */
router.get("/me", async (req, res) => {
  if (!adpSvc.isConfigured()) {
    return res.status(503).json({
      message: "ADP integration is not configured on this server",
    });
  }

  try {
    const worker = await adpSvc.getWorkerByEmail(req.user.email);
    if (!worker) {
      return res.status(404).json({
        message: "No ADP record found for this email address",
      });
    }
    return res.json(adpSvc.mapWorker(worker));
  } catch (e) {
    console.error("[ADP] GET /adp/me error:", e.message);
    return res.status(502).json({
      message: "Failed to fetch ADP data",
      detail: e.message,
    });
  }
});

module.exports = router;
