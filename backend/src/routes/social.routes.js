"use strict";

const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");

const router = express.Router();
router.use(authRequired);

const ADMIN_MW = requireAdminGrant(ADMIN_GRANT_KEYS.SOCIAL_COMMITTEE);

function parseBusinessUnits(val) {
  if (!val) return ["AGC"];
  try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
  return ["AGC"];
}

function shapeEvent(row) {
  if (!row) return row;
  return { ...row, business_units: parseBusinessUnits(row.business_units), published: !!row.published };
}

function shapeWinner(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

// ─── Events (with embedded images + winners) ──────────────────────────────────

router.get("/events", async (req, res) => {
  try {
    const isAdmin = req.user?.role === "Admin" || (Array.isArray(req.user?.adminGrants) && req.user.adminGrants.includes(ADMIN_GRANT_KEYS.SOCIAL_COMMITTEE));
    const rows = await db
      .prepare(isAdmin
        ? "SELECT * FROM social_events ORDER BY sort_order ASC, event_date DESC, id DESC"
        : "SELECT * FROM social_events WHERE published=1 ORDER BY sort_order ASC, event_date DESC, id DESC"
      ).all();

    const shaped = [];
    for (const ev of rows) {
      // Images from new table
      const images = await db.prepare(
        "SELECT * FROM social_event_images WHERE social_event_id=? ORDER BY sort_order ASC, id ASC"
      ).all(ev.id);

      // Backwards compat: if no new images, fall back to legacy image_url on the event row
      const imgList = images.length > 0
        ? images
        : (ev.image_url ? [{ id: -(ev.id), social_event_id: ev.id, image_url: ev.image_url, caption: null, sort_order: 0 }] : []);

      // Winners tied to this event
      const winners = await db.prepare(
        isAdmin
          ? "SELECT * FROM social_winners WHERE social_event_id=? ORDER BY sort_order ASC, id ASC"
          : "SELECT * FROM social_winners WHERE social_event_id=? AND active=1 ORDER BY sort_order ASC, id ASC"
      ).all(ev.id);

      shaped.push({ ...shapeEvent(ev), images: imgList, winners: winners.map(shapeWinner) });
    }

    return res.json(shaped);
  } catch (e) {
    console.error("[social] GET /events", e.message);
    return res.status(500).json({ message: "Failed to load social events" });
  }
});

router.post("/events", ADMIN_MW, async (req, res) => {
  try {
    const { title, event_date, description, image_url, video_url, business_units, published = true, sort_order = 0 } = req.body;
    if (!String(title || "").trim()) return res.status(400).json({ message: "Title is required" });
    const buJson = JSON.stringify(Array.isArray(business_units) ? business_units : ["AGC"]);
    const r = await db.prepare(
      "INSERT INTO social_events (title, event_date, description, image_url, video_url, business_units, published, sort_order, created_by) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(String(title).trim(), event_date || null, description || null, image_url || null, video_url || null, buJson, published ? 1 : 0, Number(sort_order) || 0, req.user.id);
    const row = await db.prepare("SELECT * FROM social_events WHERE id=?").get(Number(r.lastInsertRowid));
    return res.status(201).json({ ...shapeEvent(row), images: [], winners: [] });
  } catch (e) {
    console.error("[social] POST /events", e.message);
    return res.status(500).json({ message: "Failed to create social event" });
  }
});

router.put("/events/:id", ADMIN_MW, async (req, res) => {
  try {
    const { title, event_date, description, image_url, video_url, business_units, published, sort_order } = req.body;
    const existing = await db.prepare("SELECT * FROM social_events WHERE id=?").get(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Event not found" });
    const buJson = JSON.stringify(Array.isArray(business_units) ? business_units : parseBusinessUnits(existing.business_units));
    await db.prepare(
      "UPDATE social_events SET title=?, event_date=?, description=?, image_url=?, video_url=?, business_units=?, published=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(
      String(title ?? existing.title).trim(),
      event_date !== undefined ? (event_date || null) : existing.event_date,
      description !== undefined ? (description || null) : existing.description,
      image_url !== undefined ? (image_url || null) : existing.image_url,
      video_url !== undefined ? (video_url || null) : existing.video_url,
      buJson,
      published !== undefined ? (published ? 1 : 0) : existing.published,
      sort_order !== undefined ? Number(sort_order) : existing.sort_order,
      Number(req.params.id)
    );
    const row = await db.prepare("SELECT * FROM social_events WHERE id=?").get(Number(req.params.id));
    return res.json(shapeEvent(row));
  } catch (e) {
    console.error("[social] PUT /events/:id", e.message);
    return res.status(500).json({ message: "Failed to update social event" });
  }
});

router.delete("/events/:id", ADMIN_MW, async (req, res) => {
  try {
    await db.prepare("DELETE FROM social_events WHERE id=?").run(Number(req.params.id));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[social] DELETE /events/:id", e.message);
    return res.status(500).json({ message: "Failed to delete social event" });
  }
});

// ─── Event Images ─────────────────────────────────────────────────────────────

// Save uploaded image URL to an event's gallery
router.post("/events/:id/images", ADMIN_MW, async (req, res) => {
  try {
    const { image_url, caption, sort_order = 0 } = req.body;
    if (!image_url) return res.status(400).json({ message: "image_url is required" });
    const r = await db.prepare(
      "INSERT INTO social_event_images (social_event_id, image_url, caption, sort_order) VALUES (?,?,?,?)"
    ).run(Number(req.params.id), image_url, caption || null, Number(sort_order) || 0);
    const row = await db.prepare("SELECT * FROM social_event_images WHERE id=?").get(Number(r.lastInsertRowid));
    return res.status(201).json(row);
  } catch (e) {
    console.error("[social] POST /events/:id/images", e.message);
    return res.status(500).json({ message: "Failed to add image" });
  }
});

// Remove an image from an event's gallery
router.delete("/events/:id/images/:imgId", ADMIN_MW, async (req, res) => {
  try {
    await db.prepare("DELETE FROM social_event_images WHERE id=? AND social_event_id=?").run(
      Number(req.params.imgId), Number(req.params.id)
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("[social] DELETE /events/:id/images/:imgId", e.message);
    return res.status(500).json({ message: "Failed to delete image" });
  }
});

// ─── Winners ─────────────────────────────────────────────────────────────────

router.get("/winners", async (req, res) => {
  try {
    const rows = await db
      .prepare("SELECT * FROM social_winners WHERE active=1 ORDER BY sort_order ASC, created_at DESC, id DESC")
      .all();
    return res.json(rows.map(shapeWinner));
  } catch (e) {
    console.error("[social] GET /winners", e.message);
    return res.status(500).json({ message: "Failed to load winners" });
  }
});

router.get("/winners/all", ADMIN_MW, async (req, res) => {
  try {
    const rows = await db
      .prepare("SELECT * FROM social_winners ORDER BY sort_order ASC, created_at DESC, id DESC")
      .all();
    return res.json(rows.map(shapeWinner));
  } catch (e) {
    console.error("[social] GET /winners/all", e.message);
    return res.status(500).json({ message: "Failed to load all winners" });
  }
});

router.post("/winners", ADMIN_MW, async (req, res) => {
  try {
    const { name, award, tier, event_name, social_event_id, image_url, business_unit, active = true, sort_order = 0 } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ message: "Name is required" });
    const r = await db.prepare(
      "INSERT INTO social_winners (name, award, tier, event_name, social_event_id, image_url, business_unit, active, sort_order, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(String(name).trim(), award || null, tier || null, event_name || null, social_event_id || null, image_url || null, business_unit || null, active ? 1 : 0, Number(sort_order) || 0, req.user.id);
    const row = await db.prepare("SELECT * FROM social_winners WHERE id=?").get(Number(r.lastInsertRowid));
    return res.status(201).json(shapeWinner(row));
  } catch (e) {
    console.error("[social] POST /winners", e.message);
    return res.status(500).json({ message: "Failed to create winner" });
  }
});

router.put("/winners/:id", ADMIN_MW, async (req, res) => {
  try {
    const { name, award, tier, event_name, social_event_id, image_url, business_unit, active, sort_order } = req.body;
    const existing = await db.prepare("SELECT * FROM social_winners WHERE id=?").get(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Winner not found" });
    await db.prepare(
      "UPDATE social_winners SET name=?, award=?, tier=?, event_name=?, social_event_id=?, image_url=?, business_unit=?, active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(
      String(name ?? existing.name).trim(),
      award !== undefined ? (award || null) : existing.award,
      tier !== undefined ? (tier || null) : existing.tier,
      event_name !== undefined ? (event_name || null) : existing.event_name,
      social_event_id !== undefined ? (social_event_id || null) : existing.social_event_id,
      image_url !== undefined ? (image_url || null) : existing.image_url,
      business_unit !== undefined ? (business_unit || null) : existing.business_unit,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      sort_order !== undefined ? Number(sort_order) : existing.sort_order,
      Number(req.params.id)
    );
    const row = await db.prepare("SELECT * FROM social_winners WHERE id=?").get(Number(req.params.id));
    return res.json(shapeWinner(row));
  } catch (e) {
    console.error("[social] PUT /winners/:id", e.message);
    return res.status(500).json({ message: "Failed to update winner" });
  }
});

router.delete("/winners/:id", ADMIN_MW, async (req, res) => {
  try {
    await db.prepare("DELETE FROM social_winners WHERE id=?").run(Number(req.params.id));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[social] DELETE /winners/:id", e.message);
    return res.status(500).json({ message: "Failed to delete winner" });
  }
});

module.exports = router;
