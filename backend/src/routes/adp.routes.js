"use strict";

const express = require("express");
const { authRequired } = require("../middleware/auth");
const adpSvc = require("../services/adp.service");
const { writeAdpToDb, readAdpFromDb } = require("../services/adpSync.service");
const { db } = require("../config/db");

const router = express.Router();
router.use(authRequired);

/**
 * GET /adp/me
 *
 * Returns ADP data for the logged-in user.
 * Priority: live ADP → DB cache → 404
 *
 * On a successful live fetch, the data is also written to the DB so it
 * remains available if ADP is temporarily unreachable.
 *
 * 200  { worker_id, job_title, department, ... }
 * 200  { ...same fields..., from_cache: true }  — served from DB when ADP is down
 * 404  No ADP record found (and no cached data either)
 * 503  ADP not configured
 */
router.get("/me", async (req, res) => {
  const configured = adpSvc.isConfigured();

  try {
    if (!configured) throw Object.assign(new Error("ADP not configured"), { statusCode: 503 });

    // 1. Try live ADP — email first, associate OID fallback
    let worker = await adpSvc.getWorkerByEmail(req.user.email);
    if (!worker && req.user.adp_associate_oid) {
      worker = await adpSvc.getWorkerByAssociateOID(req.user.adp_associate_oid);
    }

    if (!worker) {
      // Not in ADP — check DB cache before returning 404
      const userRow = await db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(req.user.id);
      const cached = readAdpFromDb(userRow);
      if (cached) return res.json(cached);
      return res.status(404).json({ message: "No ADP record found" });
    }

    // 2. Map and sync to DB (fire-and-forget — don't block the response)
    const mapped = adpSvc.mapWorker(worker);
    writeAdpToDb(req.user.id, mapped).catch((e) =>
      console.error("[ADP] DB sync error:", e.message)
    );

    return res.json(mapped);
  } catch (e) {
    const status = e.statusCode ?? 502;
    console.error(`[ADP] GET /adp/me error (${status}):`, e.message);

    // If ADP is down or not configured, try serving from DB cache
    try {
      const userRow = await db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(req.user.id);
      const cached = readAdpFromDb(userRow);
      if (cached) {
        console.log(`[ADP] Serving cached data for user ${req.user.id}`);
        return res.json(cached);
      }
    } catch (dbErr) {
      console.error("[ADP] DB cache read error:", dbErr.message);
    }

    if (status === 503) {
      return res.status(503).json({ message: "ADP integration is not configured on this server" });
    }
    return res.status(502).json({ message: "Failed to fetch ADP data", detail: e.message });
  }
});

/**
 * PUT /adp/me/oid
 * Links the current user's portal account to an ADP Associate ID.
 */
router.put("/me/oid", async (req, res) => {
  if (!adpSvc.isConfigured()) {
    return res.status(503).json({ message: "ADP integration is not configured on this server" });
  }

  const raw = String(req.body?.oid || "").trim().toUpperCase();
  if (!raw) {
    return res.status(400).json({ message: "oid is required" });
  }

  try {
    await db.prepare("UPDATE users SET adp_associate_oid = ? WHERE id = ?").run(raw, req.user.id);
    return res.json({ ok: true, associate_oid: raw });
  } catch (e) {
    console.error("[ADP] PUT /adp/me/oid error:", e.message);
    return res.status(500).json({ message: "Failed to save Associate ID", detail: e.message });
  }
});

module.exports = router;
