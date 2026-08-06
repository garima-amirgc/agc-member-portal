const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");
const { BUSINESS_UNITS, ASSET_CATEGORIES, ASSET_STATUSES, ASSET_CONDITIONS } = require("../config/constants");

const TABLE = "assets";
const router = express.Router();

const SELECT_WITH_ASSIGNEE = `
  SELECT a.*, u.name AS assigned_to_name
  FROM ${TABLE} a
  LEFT JOIN users u ON u.id = a.assigned_to
`;

function shapeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: String(row.name || "").trim(),
    asset_tag: row.asset_tag != null ? String(row.asset_tag) : "",
    category: row.category != null ? String(row.category) : "Other",
    business_unit: row.business_unit,
    status: row.status,
    condition: row.condition,
    assigned_to: row.assigned_to != null ? Number(row.assigned_to) : null,
    assigned_to_name: row.assigned_to_name || null,
    serial_number: row.serial_number != null ? String(row.serial_number) : "",
    location: row.location != null ? String(row.location) : "",
    purchase_date: row.purchase_date || null,
    purchase_cost: row.purchase_cost != null ? Number(row.purchase_cost) : null,
    notes: row.notes != null ? String(row.notes) : "",
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Validates req.body into a clean column map. `partial` = true skips
// requiring fields the caller didn't send (used for PUT).
function parseBody(body, { partial = false } = {}) {
  const out = {};
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);

  if (!partial || has("name")) {
    const name = String(body?.name || "").trim();
    if (!name) errors.push("Asset name is required.");
    out.name = name;
  }
  if (!partial || has("business_unit")) {
    const bu = String(body?.business_unit || "").trim().toUpperCase();
    if (!BUSINESS_UNITS.includes(bu)) errors.push("Please select a valid business unit.");
    out.business_unit = bu;
  }
  if (!partial || has("category")) {
    const cat = String(body?.category || "Other").trim();
    out.category = ASSET_CATEGORIES.includes(cat) ? cat : "Other";
  }
  if (!partial || has("condition")) {
    const cond = String(body?.condition || "good").trim().toLowerCase();
    out.condition = ASSET_CONDITIONS.includes(cond) ? cond : "good";
  }
  if (!partial || has("assigned_to")) {
    const raw = body?.assigned_to;
    if (raw === null || raw === "" || raw === undefined) {
      out.assigned_to = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) errors.push("Invalid assignee.");
      else out.assigned_to = n;
    }
  }
  if (!partial || has("status")) {
    const status = String(body?.status || "available").trim().toLowerCase();
    if (!ASSET_STATUSES.includes(status)) errors.push("Invalid status.");
    out.status = status;
  }
  if (!partial || has("asset_tag")) {
    const tag = body?.asset_tag != null ? String(body.asset_tag).trim() : "";
    out.asset_tag = tag || null;
  }
  if (!partial || has("serial_number")) {
    const sn = body?.serial_number != null ? String(body.serial_number).trim() : "";
    out.serial_number = sn || null;
  }
  if (!partial || has("location")) {
    const loc = body?.location != null ? String(body.location).trim() : "";
    out.location = loc || null;
  }
  if (!partial || has("purchase_date")) {
    const pd = body?.purchase_date != null ? String(body.purchase_date).trim() : "";
    out.purchase_date = pd || null;
  }
  if (!partial || has("purchase_cost")) {
    const raw = body?.purchase_cost;
    if (raw === null || raw === "") out.purchase_cost = null;
    else if (raw === undefined) out.purchase_cost = undefined;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) errors.push("Purchase cost must be a positive number.");
      else out.purchase_cost = n;
    }
  }
  if (!partial || has("notes")) {
    const notes = body?.notes != null ? String(body.notes).trim() : "";
    out.notes = notes || null;
  }

  // Keep status and assignment consistent: assigning someone implies
  // "assigned" status; clearing the assignee off an assigned asset
  // implies it's back to "available" (unless the caller explicitly
  // chose maintenance/retired in the same request).
  if (out.assigned_to !== undefined && !has("status")) {
    out.status = out.assigned_to ? "assigned" : "available";
  }
  if (out.status === "assigned" && out.assigned_to === null) {
    errors.push("Select an employee to assign this asset to.");
  }

  return { out, errors };
}

// Cross-field check against the fully-merged row (existing + incoming
// changes), so a PUT that only sends `status` can't leave an "assigned"
// asset with no assignee (or vice versa) when combined with prior state.
function validateConsistency(next) {
  if (next.status === "assigned" && !next.assigned_to) {
    return "Select an employee to assign this asset to, or change the status.";
  }
  return null;
}

// Maps SQLite/Postgres constraint errors to a message safe to show the user.
function friendlyDbError(e) {
  const msg = String(e?.message || "").toLowerCase();
  if (msg.includes("unique")) return { status: 409, message: "That asset tag is already in use." };
  if (msg.includes("foreign key")) return { status: 400, message: "Selected employee could not be found." };
  return null;
}

router.get("/me", authRequired, async (req, res) => {
  try {
    const rows = await db
      .prepare(`${SELECT_WITH_ASSIGNEE} WHERE a.assigned_to = ? ORDER BY a.name ASC`)
      .all(req.user.id);
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[assets] me:", e);
    return res.status(500).json({ message: "Could not load your assets." });
  }
});

router.get("/meta", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER), async (_req, res) => {
  return res.json({
    categories: ASSET_CATEGORIES,
    statuses: ASSET_STATUSES,
    conditions: ASSET_CONDITIONS,
    business_units: BUSINESS_UNITS,
  });
});

router.get(
  "/assignable-users",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER),
  async (_req, res) => {
    try {
      const rows = await db
        .prepare("SELECT id, name, email, business_unit FROM users ORDER BY name ASC")
        .all();
      return res.json(rows);
    } catch (e) {
      console.error("[assets] assignable-users:", e);
      return res.status(500).json({ message: "Could not load users." });
    }
  }
);

router.get("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER), async (req, res) => {
  try {
    const rows = await db.prepare(`${SELECT_WITH_ASSIGNEE} ORDER BY a.created_at DESC, a.id DESC`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[assets] list:", e);
    return res.status(500).json({ message: "Could not load assets." });
  }
});

router.get("/:id", authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const row = await db.prepare(`${SELECT_WITH_ASSIGNEE} WHERE a.id = ?`).get(id);
    if (!row) return res.status(404).json({ message: "Asset not found." });
    const isOwner = row.assigned_to != null && Number(row.assigned_to) === req.user.id;
    const isAdmin = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.ASSET_TRACKER);
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });
    return res.json(shapeRow(row));
  } catch (e) {
    console.error("[assets] get:", e);
    return res.status(500).json({ message: "Could not load asset." });
  }
});

router.post("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER), async (req, res) => {
  try {
    const { out, errors } = parseBody(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const consistencyError = validateConsistency(out);
    if (consistencyError) return res.status(400).json({ message: consistencyError });
    const now = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO ${TABLE}
          (name, asset_tag, category, business_unit, status, condition, assigned_to, serial_number, location, purchase_date, purchase_cost, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        out.name,
        out.asset_tag,
        out.category,
        out.business_unit,
        out.status,
        out.condition,
        out.assigned_to ?? null,
        out.serial_number,
        out.location,
        out.purchase_date,
        out.purchase_cost ?? null,
        out.notes,
        req.user.id,
        now,
        now
      );

    const row = await db.prepare(`${SELECT_WITH_ASSIGNEE} WHERE a.id = ?`).get(result.lastInsertRowid);
    return res.status(201).json(shapeRow(row));
  } catch (e) {
    const friendly = friendlyDbError(e);
    if (friendly) return res.status(friendly.status).json({ message: friendly.message });
    console.error("[assets] create:", e);
    return res.status(500).json({ message: "Could not save asset." });
  }
});

router.put("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });

    const existing = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Asset not found." });

    const { out, errors } = parseBody(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const now = new Date().toISOString();

    const next = {
      name: out.name !== undefined ? out.name : existing.name,
      asset_tag: out.asset_tag !== undefined ? out.asset_tag : existing.asset_tag,
      category: out.category !== undefined ? out.category : existing.category,
      business_unit: out.business_unit !== undefined ? out.business_unit : existing.business_unit,
      status: out.status !== undefined ? out.status : existing.status,
      condition: out.condition !== undefined ? out.condition : existing.condition,
      assigned_to: out.assigned_to !== undefined ? out.assigned_to : existing.assigned_to,
      serial_number: out.serial_number !== undefined ? out.serial_number : existing.serial_number,
      location: out.location !== undefined ? out.location : existing.location,
      purchase_date: out.purchase_date !== undefined ? out.purchase_date : existing.purchase_date,
      purchase_cost: out.purchase_cost !== undefined ? out.purchase_cost : existing.purchase_cost,
      notes: out.notes !== undefined ? out.notes : existing.notes,
    };

    const consistencyError = validateConsistency(next);
    if (consistencyError) return res.status(400).json({ message: consistencyError });

    await db
      .prepare(
        `UPDATE ${TABLE}
         SET name = ?, asset_tag = ?, category = ?, business_unit = ?, status = ?, condition = ?, assigned_to = ?, serial_number = ?, location = ?, purchase_date = ?, purchase_cost = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.name,
        next.asset_tag,
        next.category,
        next.business_unit,
        next.status,
        next.condition,
        next.assigned_to,
        next.serial_number,
        next.location,
        next.purchase_date,
        next.purchase_cost,
        next.notes,
        now,
        id
      );

    const row = await db.prepare(`${SELECT_WITH_ASSIGNEE} WHERE a.id = ?`).get(id);
    return res.json(shapeRow(row));
  } catch (e) {
    const friendly = friendlyDbError(e);
    if (friendly) return res.status(friendly.status).json({ message: friendly.message });
    console.error("[assets] update:", e);
    return res.status(500).json({ message: "Could not update asset." });
  }
});

router.delete("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.ASSET_TRACKER), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const existing = await db.prepare(`SELECT id FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Asset not found." });
    await db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[assets] delete:", e);
    return res.status(500).json({ message: "Could not delete asset." });
  }
});

module.exports = router;
