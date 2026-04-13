const express = require("express");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { db } = require("../config/db");
const { resolveLocalUploadFileUrl } = require("../services/storage.service");
const { DOC_EXT_TO_MIME } = require("../services/objectStorage.service");
const { ROLES } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");

const FACILITIES = new Set(["AGC", "AQM", "SCF", "ASP"]);
const RESOURCE_CATEGORIES = new Set(["finance", "sales", "hr", "safety", "production"]);

const router = express.Router();
router.use(authRequired);

async function facilityAllowed(user, facilityNorm) {
  if (String(user?.role || "").toLowerCase() === ROLES.ADMIN.toLowerCase()) return true;
  const row = await db
    .prepare("SELECT 1 AS ok FROM user_facilities WHERE user_id = ? AND business_unit = ? LIMIT 1")
    .get(user.id, facilityNorm);
  return Boolean(row);
}

async function resourceExistsInCategory(resourceKind, resourceId, businessUnit, category) {
  if (resourceKind === "lesson") {
    const row = await db
      .prepare(
        `SELECT l.id FROM lessons l
         INNER JOIN courses c ON c.id = l.course_id
         WHERE l.id = ?
           AND c.business_unit = ?
           AND LOWER(TRIM(COALESCE(c.resource_category, ''))) = ?`
      )
      .get(resourceId, businessUnit, category);
    return Boolean(row);
  }
  if (resourceKind === "document") {
    const row = await db
      .prepare(
        `SELECT id FROM resource_documents
         WHERE id = ?
           AND business_unit = ?
           AND LOWER(TRIM(COALESCE(category, ''))) = ?`
      )
      .get(resourceId, businessUnit, category);
    return Boolean(row);
  }
  return false;
}

/** Per-user completion for Resources (videos + uploaded documents), keyed by facility + category. */
router.get("/me/progress/:facility/:category", async (req, res) => {
  const facility = String(req.params.facility || "").toUpperCase();
  const category = String(req.params.category || "").toLowerCase();
  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(category)) return res.status(400).json({ message: "Invalid category" });
  if (!(await facilityAllowed(req.user, facility))) return res.status(403).json({ message: "No access to this facility" });

  const rows = await db
    .prepare(
      `SELECT resource_kind, resource_id FROM resource_progress
       WHERE user_id = ? AND business_unit = ? AND category = ?`
    )
    .all(req.user.id, facility, category);

  const ids = rows.map((r) =>
    r.resource_kind === "lesson" ? `lesson-${r.resource_id}` : `doc-${r.resource_id}`
  );
  res.json({ ids });
});

router.put("/me/progress", async (req, res) => {
  const business_unit = String(req.body?.business_unit || "").toUpperCase();
  const category = String(req.body?.category || "").toLowerCase().trim();
  const resource_kind = req.body?.resource_kind;
  const resource_id = Number(req.body?.resource_id);
  const completed = Boolean(req.body?.completed);

  if (!FACILITIES.has(business_unit)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(category)) return res.status(400).json({ message: "Invalid category" });
  if (resource_kind !== "lesson" && resource_kind !== "document") {
    return res.status(400).json({ message: "Invalid resource_kind" });
  }
  if (!Number.isFinite(resource_id) || resource_id <= 0) {
    return res.status(400).json({ message: "Invalid resource_id" });
  }
  if (!(await facilityAllowed(req.user, business_unit))) {
    return res.status(403).json({ message: "No access to this facility" });
  }

  const exists = await resourceExistsInCategory(resource_kind, resource_id, business_unit, category);
  if (!exists) return res.status(404).json({ message: "Resource not found in this category" });

  const uid = req.user.id;
  if (!completed) {
    await db
      .prepare(
        `DELETE FROM resource_progress
         WHERE user_id = ? AND business_unit = ? AND category = ? AND resource_kind = ? AND resource_id = ?`
      )
      .run(uid, business_unit, category, resource_kind, resource_id);
  } else {
    await db
      .prepare(
        `DELETE FROM resource_progress
         WHERE user_id = ? AND business_unit = ? AND category = ? AND resource_kind = ? AND resource_id = ?`
      )
      .run(uid, business_unit, category, resource_kind, resource_id);
    await db
      .prepare(
        `INSERT INTO resource_progress (user_id, business_unit, category, resource_kind, resource_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(uid, business_unit, category, resource_kind, resource_id);
  }

  res.json({ ok: true });
});

router.get("/facility/:facility/category/:category", async (req, res) => {
  const facility = String(req.params.facility || "").toUpperCase();
  const category = String(req.params.category || "").toLowerCase();
  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(category)) return res.status(400).json({ message: "Invalid category" });
  if (!(await facilityAllowed(req.user, facility))) return res.status(403).json({ message: "No access to this facility" });

  const rows = await db
    .prepare(
      `SELECT l.id, l.title, l.video_url, l.order_index, c.title AS course_title
       FROM lessons l
       INNER JOIN courses c ON c.id = l.course_id
       WHERE c.business_unit = ?
         AND LOWER(TRIM(COALESCE(c.resource_category, ''))) = ?
       ORDER BY c.id ASC, l.order_index ASC`
    )
    .all(facility, category);

  const videos = rows.map((r) => ({
    id: `lesson-${r.id}`,
    lessonId: r.id,
    title: r.title,
    meta: r.course_title || "Training",
    url: r.video_url,
  }));
  res.json({ videos });
});

router.get("/facility/:facility/category/:category/documents", async (req, res) => {
  const facility = String(req.params.facility || "").toUpperCase();
  const category = String(req.params.category || "").toLowerCase();
  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(category)) return res.status(400).json({ message: "Invalid category" });
  if (!(await facilityAllowed(req.user, facility))) return res.status(403).json({ message: "No access to this facility" });

  const rows = await db
    .prepare(
      `SELECT id, title, file_url, created_at
       FROM resource_documents
       WHERE business_unit = ?
         AND LOWER(TRIM(COALESCE(category, ''))) = ?
       ORDER BY id DESC`
    )
    .all(facility, category);

  const documents = rows.map((r) => ({
    id: `doc-${r.id}`,
    docId: r.id,
    title: r.title,
    url: r.file_url,
    created_at: r.created_at,
  }));
  res.json({ documents });
});

function normalizeCategory(raw) {
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim().toLowerCase();
}

router.get("/documents", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT id, business_unit, category, title, file_url, created_at
       FROM resource_documents
       ORDER BY id DESC`
    )
    .all();
  res.json(rows);
});

router.get("/documents/:id/stream", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).end();

  const row = await db
    .prepare(`SELECT id, business_unit, title, file_url FROM resource_documents WHERE id = ?`)
    .get(id);
  if (!row?.file_url) return res.status(404).end();
  if (!(await facilityAllowed(req.user, row.business_unit))) return res.status(403).end();

  const url = String(row.file_url).trim();
  try {
    const localPath = resolveLocalUploadFileUrl(url);
    if (localPath) {
      const ext = path.extname(localPath).toLowerCase();
      const ct = DOC_EXT_TO_MIME[ext] || "application/octet-stream";
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", "inline");
      const st = fs.statSync(localPath);
      res.setHeader("Content-Length", st.size);
      return fs.createReadStream(localPath).pipe(res);
    }

    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) return res.status(502).end();

    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", "inline");

    if (upstream.body && typeof Readable.fromWeb === "function") {
      await new Promise((resolve, reject) => {
        Readable.fromWeb(upstream.body)
          .on("error", reject)
          .pipe(res)
          .on("finish", resolve)
          .on("error", reject);
      });
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Length", buf.length);
      res.send(buf);
    }
  } catch (e) {
    console.error("document stream:", e);
    if (!res.headersSent) res.status(502).end();
  }
});

router.get("/documents/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await db
    .prepare(
      `SELECT id, business_unit, category, title, file_url, created_at
       FROM resource_documents
       WHERE id = ?`
    )
    .get(id);

  if (!row) return res.status(404).json({ message: "Not found" });
  if (!(await facilityAllowed(req.user, row.business_unit))) {
    return res.status(403).json({ message: "No access to this facility" });
  }

  res.json(row);
});

router.post("/documents", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { business_unit, category, title, file_url } = req.body || {};
  const facility = String(business_unit || "").toUpperCase();
  const cat = normalizeCategory(category);
  const t = String(title || "").trim();
  const url = String(file_url || "").trim();

  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(cat)) return res.status(400).json({ message: "Invalid category" });
  if (!t) return res.status(400).json({ message: "Title is required" });
  if (!url) return res.status(400).json({ message: "file_url is required" });

  const out = await db
    .prepare(
      "INSERT INTO resource_documents(business_unit, category, title, file_url, created_by) VALUES (?, ?, ?, ?, ?)"
    )
    .run(facility, cat, t, url, req.user.id);
  return res.status(201).json({ id: out.lastInsertRowid });
});

router.delete("/documents/:id", authRequired, allowRoles(ROLES.ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await db.prepare("SELECT id, file_url FROM resource_documents WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ message: "Not found" });

  try {
    await deleteLessonVideoByUrl(row.file_url);
  } catch (e) {
    console.error("Document delete failed:", e);
    return res.status(502).json({ message: "Failed to delete document from storage." });
  }

  await db.prepare("DELETE FROM resource_documents WHERE id = ?").run(id);
  return res.json({ message: "Document deleted" });
});

router.get("/lessons/:lessonId", async (req, res) => {
  const lessonId = Number(req.params.lessonId);
  if (!Number.isFinite(lessonId)) return res.status(400).json({ message: "Invalid lesson id" });

  const row = await db
    .prepare(
      `SELECT l.id, l.title, l.video_url, c.business_unit, c.resource_category, c.title AS course_title
       FROM lessons l
       INNER JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`
    )
    .get(lessonId);

  if (!row) return res.status(404).json({ message: "Not found" });

  const cat = String(row.resource_category || "").toLowerCase().trim();
  if (!RESOURCE_CATEGORIES.has(cat)) return res.status(404).json({ message: "Not found" });

  if (!(await facilityAllowed(req.user, row.business_unit))) return res.status(403).json({ message: "Forbidden" });

  res.json({
    id: `lesson-${row.id}`,
    lessonId: row.id,
    title: row.title,
    meta: row.course_title || "Training",
    url: row.video_url,
    category: cat,
    facility: row.business_unit,
  });
});

module.exports = router;
