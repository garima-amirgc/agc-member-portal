const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");
const {
  COMPANY_ABOUT_INTRO_KEY,
  COMPANY_CONTENT_SEED,
  DEFAULT_ABOUT_INTRO,
  isValidCompanySection,
} = require("../config/companyContentSections");

const TABLE = "company_content_items";
const ITEM_ORDER = "sort_order ASC, created_at DESC, id DESC";
const GRANT = ADMIN_GRANT_KEYS.COMPANY_CONTENT;

const router = express.Router();
router.use(authRequired);

function shapeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    section: String(row.section || "").trim(),
    title: String(row.title || "").trim(),
    description: row.description != null ? String(row.description) : "",
    file_url: row.file_url != null ? String(row.file_url) : "",
    link_url: row.link_url != null ? String(row.link_url).trim() : "",
    published: Number(row.published) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    file_uploaded_at: row.file_uploaded_at,
  };
}

function parseOptionalString(body, key) {
  if (body?.[key] === null || body?.[key] === "") return null;
  if (body?.[key] == null) return undefined;
  return String(body[key]).trim() || null;
}

async function readAboutIntro() {
  try {
    const row = await db.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = ?").get(COMPANY_ABOUT_INTRO_KEY);
    if (!row?.setting_value) return DEFAULT_ABOUT_INTRO;
    const parsed = JSON.parse(String(row.setting_value));
    const body = String(parsed?.body || "").trim();
    return body || DEFAULT_ABOUT_INTRO;
  } catch {
    return DEFAULT_ABOUT_INTRO;
  }
}

async function writeAboutIntro(body, userId) {
  const now = new Date().toISOString();
  const value = JSON.stringify({ body: String(body || "").trim() });
  const existing = await db.prepare("SELECT setting_key FROM portal_settings WHERE setting_key = ?").get(COMPANY_ABOUT_INTRO_KEY);
  if (existing) {
    await db
      .prepare("UPDATE portal_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?")
      .run(value, now, COMPANY_ABOUT_INTRO_KEY);
  } else {
    await db
      .prepare("INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)")
      .run(COMPANY_ABOUT_INTRO_KEY, value, now);
  }
  return readAboutIntro();
}

async function nextSortOrderForSection(section) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${TABLE} WHERE section = ?`)
    .get(section);
  return Number(row?.m || 0) + 1;
}

async function moveItemInSection(id, direction) {
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    const err = new Error("Invalid id.");
    err.statusCode = 400;
    throw err;
  }
  const dir = String(direction || "").trim().toLowerCase();
  if (dir !== "up" && dir !== "down") {
    const err = new Error('Direction must be "up" or "down".');
    err.statusCode = 400;
    throw err;
  }

  const entry = await db.prepare(`SELECT id, section FROM ${TABLE} WHERE id = ?`).get(entryId);
  if (!entry) {
    const err = new Error("Entry not found.");
    err.statusCode = 404;
    throw err;
  }

  const rows = await db
    .prepare(`SELECT id, sort_order FROM ${TABLE} WHERE section = ? ORDER BY ${ITEM_ORDER}`)
    .all(entry.section);
  const idx = rows.findIndex((r) => Number(r.id) === entryId);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const a = rows[idx];
  const b = rows[swapIdx];
  const now = new Date().toISOString();
  await db.prepare(`UPDATE ${TABLE} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(Number(b.sort_order) || 0, now, a.id);
  await db.prepare(`UPDATE ${TABLE} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(Number(a.sort_order) || 0, now, b.id);
}

async function seedCompanyContentIfEmpty() {
  const countRow = await db.prepare(`SELECT COUNT(*) AS c FROM ${TABLE}`).get();
  if (Number(countRow?.c) > 0) return;

  const now = new Date().toISOString();
  for (const item of COMPANY_CONTENT_SEED) {
    await db
      .prepare(
        `INSERT INTO ${TABLE} (section, title, description, file_url, link_url, published, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(item.section, item.title, null, null, item.link_url || null, item.sort_order, now, now);
  }

  const introRow = await db.prepare("SELECT setting_key FROM portal_settings WHERE setting_key = ?").get(COMPANY_ABOUT_INTRO_KEY);
  if (!introRow) {
    await db
      .prepare("INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)")
      .run(COMPANY_ABOUT_INTRO_KEY, JSON.stringify({ body: DEFAULT_ABOUT_INTRO }), now);
  }
}

router.get("/about-page", async (_req, res) => {
  try {
    await seedCompanyContentIfEmpty();
    const intro = await readAboutIntro();
    const forms = await db
      .prepare(`SELECT * FROM ${TABLE} WHERE section = 'about_forms' AND published = 1 ORDER BY ${ITEM_ORDER}`)
      .all();
    return res.json({ intro, forms: forms.map(shapeRow) });
  } catch (e) {
    console.error("[company-content] about-page:", e);
    return res.status(500).json({ message: "Could not load about page." });
  }
});

router.get("/section/:section", async (req, res) => {
  const section = String(req.params.section || "").trim();
  if (!isValidCompanySection(section)) return res.status(400).json({ message: "Invalid section." });
  try {
    await seedCompanyContentIfEmpty();
    const rows = await db
      .prepare(`SELECT * FROM ${TABLE} WHERE section = ? AND published = 1 ORDER BY ${ITEM_ORDER}`)
      .all(section);
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[company-content] section:", e);
    return res.status(500).json({ message: "Could not load section." });
  }
});

router.get("/admin/about-intro", requireAdminGrant(GRANT), async (_req, res) => {
  try {
    const intro = await readAboutIntro();
    return res.json({ intro });
  } catch (e) {
    console.error("[company-content] admin about-intro get:", e);
    return res.status(500).json({ message: "Could not load about intro." });
  }
});

router.put("/admin/about-intro", requireAdminGrant(GRANT), async (req, res) => {
  try {
    const intro = await writeAboutIntro(req.body?.intro, req.user.id);
    return res.json({ intro });
  } catch (e) {
    console.error("[company-content] admin about-intro put:", e);
    return res.status(500).json({ message: "Could not save about intro." });
  }
});

router.get("/admin/items", requireAdminGrant(GRANT), async (_req, res) => {
  try {
    await seedCompanyContentIfEmpty();
    const rows = await db.prepare(`SELECT * FROM ${TABLE} ORDER BY section ASC, ${ITEM_ORDER}`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[company-content] admin list:", e);
    return res.status(500).json({ message: "Could not load items." });
  }
});

router.post("/admin/items", requireAdminGrant(GRANT), async (req, res) => {
  try {
    const section = String(req.body?.section || "").trim();
    if (!isValidCompanySection(section)) return res.status(400).json({ message: "Invalid section." });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });

    const description = parseOptionalString(req.body, "description") ?? "";
    const fileUrl = parseOptionalString(req.body, "file_url") ?? null;
    const linkUrl = parseOptionalString(req.body, "link_url") ?? null;
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const sortOrder = await nextSortOrderForSection(section);
    const now = new Date().toISOString();
    const fileUploadedAt = fileUrl ? now : null;

    const result = await db
      .prepare(
        `INSERT INTO ${TABLE} (section, title, description, file_url, link_url, published, sort_order, created_by, created_at, updated_at, file_uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(section, title, description || null, fileUrl, linkUrl, published, sortOrder, req.user.id, now, now, fileUploadedAt);

    const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json(shapeRow(row));
  } catch (e) {
    console.error("[company-content] admin create:", e);
    return res.status(500).json({ message: "Could not save item." });
  }
});

router.put("/admin/items/:id", requireAdminGrant(GRANT), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });

    const existing = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Item not found." });

    const section = String(req.body?.section || existing.section || "").trim();
    if (!isValidCompanySection(section)) return res.status(400).json({ message: "Invalid section." });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });

    const description = parseOptionalString(req.body, "description");
    const fileUrl = parseOptionalString(req.body, "file_url");
    const linkUrl = parseOptionalString(req.body, "link_url");
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const now = new Date().toISOString();

    const nextFileUrl = fileUrl !== undefined ? fileUrl : existing.file_url;
    const fileUploadedAt =
      fileUrl !== undefined && fileUrl !== existing.file_url
        ? fileUrl
          ? now
          : null
        : existing.file_uploaded_at;

    await db
      .prepare(
        `UPDATE ${TABLE}
         SET section = ?, title = ?, description = ?, file_url = ?, link_url = ?, published = ?, updated_at = ?, file_uploaded_at = ?
         WHERE id = ?`
      )
      .run(
        section,
        title,
        description !== undefined ? description : existing.description,
        nextFileUrl,
        linkUrl !== undefined ? linkUrl : existing.link_url,
        published,
        now,
        fileUploadedAt,
        id
      );

    const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    return res.json(shapeRow(row));
  } catch (e) {
    console.error("[company-content] admin update:", e);
    return res.status(500).json({ message: "Could not update item." });
  }
});

router.post("/admin/items/:id/move", requireAdminGrant(GRANT), async (req, res) => {
  try {
    await moveItemInSection(req.params.id, req.body?.direction);
    const rows = await db.prepare(`SELECT * FROM ${TABLE} ORDER BY section ASC, ${ITEM_ORDER}`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("[company-content] admin move:", e);
    return res.status(code).json({ message: e.message || "Could not reorder item." });
  }
});

router.delete("/admin/items/:id", requireAdminGrant(GRANT), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });

    const existing = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ message: "Item not found." });

    if (existing.file_url) {
      try {
        await deleteLessonVideoByUrl(existing.file_url);
      } catch (err) {
        console.warn("[company-content] delete file:", err.message || err);
      }
    }

    await db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[company-content] admin delete:", e);
    return res.status(500).json({ message: "Could not delete item." });
  }
});

module.exports = router;
module.exports.seedCompanyContentIfEmpty = seedCompanyContentIfEmpty;
