const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { moveSpotlightEntry, nextSortOrder } = require("../utils/spotlightFeedDb");

const TABLE = "leadership_updates";
const PUBLISHED_ORDER = "sort_order ASC, created_at DESC, id DESC";

const router = express.Router();

function shapeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: String(row.title || "").trim(),
    description: row.description != null ? String(row.description) : "",
    link_url: row.link_url != null ? String(row.link_url).trim() : "",
    image_url: row.image_url != null ? String(row.image_url) : "",
    published: Number(row.published) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseImageUrl(body) {
  if (body?.image_url === null || body?.image_url === "") return null;
  if (body?.image_url == null) return undefined;
  const url = String(body.image_url).trim();
  return url || null;
}

function parseLinkUrl(body) {
  if (body?.link_url === null || body?.link_url === "") return null;
  if (body?.link_url == null) return undefined;
  const url = String(body.link_url).trim();
  return url || null;
}

router.get("/current", authRequired, async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT * FROM ${TABLE}
         WHERE published = 1
         ORDER BY ${PUBLISHED_ORDER}`
      )
      .all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[leadership-updates] current:", e);
    return res.status(500).json({ message: "Could not load leadership update." });
  }
});

router.get("/history", authRequired, async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT * FROM ${TABLE}
         WHERE published = 1
         ORDER BY ${PUBLISHED_ORDER}`
      )
      .all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[leadership-updates] history:", e);
    return res.status(500).json({ message: "Could not load leadership updates." });
  }
});

router.post("/:id/move", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    await moveSpotlightEntry(db, TABLE, req.params.id, req.body?.direction);
    const rows = await db.prepare(`SELECT * FROM ${TABLE} ORDER BY sort_order ASC, created_at DESC, id DESC`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("[leadership-updates] move:", e);
    return res.status(code).json({ message: e.message || "Could not reorder entry." });
  }
});

router.get("/:id", authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ? AND published = 1`).get(id);
    if (!row) return res.status(404).json({ message: "Update not found." });
    return res.json(shapeRow(row));
  } catch (e) {
    console.error("[leadership-updates] get:", e);
    return res.status(500).json({ message: "Could not load update." });
  }
});

router.get("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (_req, res) => {
  try {
    const rows = await db.prepare(`SELECT * FROM ${TABLE} ORDER BY sort_order ASC, created_at DESC, id DESC`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[leadership-updates] list:", e);
    return res.status(500).json({ message: "Could not load entries." });
  }
});

router.post("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });

    const description = req.body?.description != null ? String(req.body.description).trim() : "";
    const linkUrl = parseLinkUrl(req.body) ?? null;
    const imageUrl = parseImageUrl(req.body) ?? null;
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const sortOrder = await nextSortOrder(db, TABLE);
    const now = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO ${TABLE} (title, description, link_url, image_url, published, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, description || null, linkUrl, imageUrl, published, sortOrder, req.user.id, now, now);

    const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json(shapeRow(row));
  } catch (e) {
    console.error("[leadership-updates] create:", e);
    return res.status(500).json({ message: "Could not save leadership update." });
  }
});

router.put("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });

    const existing = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Entry not found." });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });

    const description = req.body?.description != null ? String(req.body.description).trim() : "";
    const linkUrl = parseLinkUrl(req.body);
    const imageUrl = parseImageUrl(req.body);
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE ${TABLE}
         SET title = ?, description = ?, link_url = ?, image_url = ?, published = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        title,
        description || null,
        linkUrl !== undefined ? linkUrl : existing.link_url,
        imageUrl !== undefined ? imageUrl : existing.image_url,
        published,
        now,
        id
      );

    const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    return res.json(shapeRow(row));
  } catch (e) {
    console.error("[leadership-updates] update:", e);
    return res.status(500).json({ message: "Could not update entry." });
  }
});

router.delete("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const existing = await db.prepare(`SELECT id FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Entry not found." });
    await db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[leadership-updates] delete:", e);
    return res.status(500).json({ message: "Could not delete entry." });
  }
});

module.exports = router;
