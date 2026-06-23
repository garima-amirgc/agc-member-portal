const express = require("express");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { db } = require("../config/db");
const { resolveLocalUploadFileUrl } = require("../services/storage.service");
const { DOC_EXT_TO_MIME } = require("../services/objectStorage.service");
const { ROLES } = require("../config/constants");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { deleteLessonVideoByUrl } = require("../services/objectStorage.service");
const { syncAssignmentFromResourceLesson } = require("../services/assignmentProgress.service");
const {
  notifyManagerCourseCompletion,
  maybeNotifyAllTrainingComplete,
} = require("../services/notification.service");
const { clearAllTrainingMilestone, getTrainingSummary } = require("../services/trainingCompletion.service");
const { syncUserAssignmentsForFacilities } = require("../services/assignmentSync.service");

const FACILITIES = new Set(["AGC", "AQM", "SCF", "ASP"]);
const RESOURCE_CATEGORIES = new Set(["finance", "sales", "hr", "safety", "production", "it"]);

function documentDisplayAddedAt(fileUploadedAt, createdAt) {
  if (fileUploadedAt != null && String(fileUploadedAt).trim()) return fileUploadedAt;
  return createdAt != null ? createdAt : null;
}

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

  let allTrainingComplete = false;
  let allTrainingJustNotified = false;

  if (completed) {
    await syncUserAssignmentsForFacilities(uid);

    if (resource_kind === "lesson") {
      const syncResult = await syncAssignmentFromResourceLesson(uid, resource_id);
      if (syncResult?.courseJustCompleted) {
        const user = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(uid);
        const course = await db
          .prepare("SELECT id, title FROM courses WHERE id = ?")
          .get(syncResult.assignment?.course_id);
        void notifyManagerCourseCompletion({
          managerId: user?.manager_id || null,
          employeeId: uid,
          courseId: course?.id,
          courseTitle: course?.title || "Unknown course",
        });
      }
    }

    const allTraining = await maybeNotifyAllTrainingComplete(uid);
    allTrainingComplete = allTraining.allComplete;
    allTrainingJustNotified = allTraining.notified;
  } else {
    const summaryAfter = await getTrainingSummary(uid);
    if (!summaryAfter.allComplete) {
      await clearAllTrainingMilestone(uid);
    }
  }

  res.json({
    ok: true,
    all_training_complete: allTrainingComplete,
    all_training_just_notified: allTrainingJustNotified,
    message: allTrainingJustNotified
      ? "Congratulations! You have completed all of your assigned training."
      : undefined,
  });
});

router.get("/facility/:facility/category/:category", async (req, res) => {
  const facility = String(req.params.facility || "").toUpperCase();
  const category = String(req.params.category || "").toLowerCase();
  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(category)) return res.status(400).json({ message: "Invalid category" });
  if (!(await facilityAllowed(req.user, facility))) return res.status(403).json({ message: "No access to this facility" });

  const rows = await db
    .prepare(
      `SELECT l.id, l.title, l.video_url, l.order_index, l.video_uploaded_at AS lesson_uploaded_at,
              c.title AS course_title, c.description AS course_description, c.created_at AS course_created_at
       FROM lessons l
       INNER JOIN courses c ON c.id = l.course_id
       WHERE c.business_unit = ?
         AND LOWER(TRIM(COALESCE(c.resource_category, ''))) = ?
       ORDER BY c.id ASC, l.order_index ASC`
    )
    .all(facility, category);

  const videos = rows.map((r) => {
    const courseDesc =
      r.course_description != null && String(r.course_description).trim()
        ? String(r.course_description).trim()
        : null;
    return {
      id: `lesson-${r.id}`,
      lessonId: r.id,
      title: r.title,
      course_title: r.course_title != null && String(r.course_title).trim() ? String(r.course_title).trim() : "",
      meta: r.course_title || "Training",
      description: courseDesc,
      added_at:
        r.lesson_uploaded_at != null && String(r.lesson_uploaded_at).trim()
          ? r.lesson_uploaded_at
          : r.course_created_at != null
            ? r.course_created_at
            : null,
      url: r.video_url,
    };
  });
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
      `SELECT id, title, file_url, created_at, file_uploaded_at
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
    added_at: documentDisplayAddedAt(r.file_uploaded_at, r.created_at),
  }));
  res.json({ documents });
});

router.get("/facility/:facility/category/:category/reports", async (req, res) => {
  const facility = String(req.params.facility || "").toUpperCase();
  const category = String(req.params.category || "").toLowerCase();
  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (category !== "it") return res.json({ reports: [] });
  if (!(await facilityAllowed(req.user, facility))) return res.status(403).json({ message: "No access to this facility" });

  const rows = await db
    .prepare(
      `SELECT id, title, link_url, description, created_at
       FROM resource_report_links
       WHERE business_unit = ?
         AND LOWER(TRIM(COALESCE(category, ''))) = 'it'
       ORDER BY id DESC`
    )
    .all(facility);

  const reports = rows.map((r) => ({
    id: `report-${r.id}`,
    reportId: r.id,
    title: r.title,
    link_url: r.link_url,
    description: r.description != null ? String(r.description).trim() : "",
    created_at: r.created_at,
  }));
  res.json({ reports });
});

function normalizeReportLink(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

router.get("/reports", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT id, business_unit, category, title, link_url, description, created_at
       FROM resource_report_links
       ORDER BY id DESC`
    )
    .all();
  res.json(rows);
});

router.post("/reports", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const { business_unit, title, link_url, description } = req.body || {};
  const facility = String(business_unit || "").toUpperCase();
  const t = String(title || "").trim();
  const url = normalizeReportLink(link_url);
  const desc = description != null ? String(description).trim() : "";

  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!t) return res.status(400).json({ message: "Report name is required" });
  if (!url) return res.status(400).json({ message: "A valid http(s) dashboard link is required" });

  const out = await db
    .prepare(
      `INSERT INTO resource_report_links (business_unit, category, title, link_url, description, created_by)
       VALUES (?, 'it', ?, ?, ?, ?)`
    )
    .run(facility, t, url, desc || null, req.user.id);
  return res.status(201).json({ id: out.lastInsertRowid });
});

router.put("/reports/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const { business_unit, title, link_url, description } = req.body || {};
  const facility = String(business_unit || "").toUpperCase();
  const t = String(title || "").trim();
  const url = normalizeReportLink(link_url);
  const desc = description != null ? String(description).trim() : "";

  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!t) return res.status(400).json({ message: "Report name is required" });
  if (!url) return res.status(400).json({ message: "A valid http(s) dashboard link is required" });

  const existing = await db.prepare("SELECT id FROM resource_report_links WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  await db
    .prepare(
      `UPDATE resource_report_links
       SET business_unit = ?, category = 'it', title = ?, link_url = ?, description = ?
       WHERE id = ?`
    )
    .run(facility, t, url, desc || null, id);
  return res.json({ message: "Report link updated" });
});

router.delete("/reports/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  const row = await db.prepare("SELECT id FROM resource_report_links WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ message: "Not found" });
  await db.prepare("DELETE FROM resource_report_links WHERE id = ?").run(id);
  return res.json({ message: "Report link deleted" });
});

function normalizeCategory(raw) {
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim().toLowerCase();
}

router.get("/documents", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT id, business_unit, category, title, file_url, created_at, file_uploaded_at
       FROM resource_documents
       ORDER BY id DESC`
    )
    .all();
  res.json(
    rows.map((r) => ({
      ...r,
      added_at: documentDisplayAddedAt(r.file_uploaded_at, r.created_at),
    }))
  );
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
      `SELECT id, business_unit, category, title, file_url, created_at, file_uploaded_at
       FROM resource_documents
       WHERE id = ?`
    )
    .get(id);

  if (!row) return res.status(404).json({ message: "Not found" });
  if (!(await facilityAllowed(req.user, row.business_unit))) {
    return res.status(403).json({ message: "No access to this facility" });
  }

  res.json({
    ...row,
    added_at: documentDisplayAddedAt(row.file_uploaded_at, row.created_at),
  });
});

router.post("/documents", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const { business_unit, category, title, file_url } = req.body || {};
  const facility = String(business_unit || "").toUpperCase();
  const cat = normalizeCategory(category);
  const t = String(title || "").trim();
  const url = String(file_url || "").trim();

  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(cat)) return res.status(400).json({ message: "Invalid category" });
  if (!t) return res.status(400).json({ message: "Title is required" });
  if (!url) return res.status(400).json({ message: "file_url is required" });

  const uploadedAt = new Date().toISOString();
  const out = await db
    .prepare(
      "INSERT INTO resource_documents(business_unit, category, title, file_url, created_by, file_uploaded_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(facility, cat, t, url, req.user.id, uploadedAt);
  return res.status(201).json({ id: out.lastInsertRowid });
});

router.put("/documents/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  const { business_unit, category, title, file_url } = req.body || {};
  const facility = String(business_unit || "").toUpperCase();
  const cat = normalizeCategory(category);
  const t = String(title || "").trim();
  const url = String(file_url || "").trim();

  if (!FACILITIES.has(facility)) return res.status(400).json({ message: "Invalid facility" });
  if (!RESOURCE_CATEGORIES.has(cat)) return res.status(400).json({ message: "Invalid category" });
  if (!t) return res.status(400).json({ message: "Title is required" });
  if (!url) return res.status(400).json({ message: "file_url is required" });

  const existing = await db
    .prepare("SELECT id, file_url, file_uploaded_at FROM resource_documents WHERE id = ?")
    .get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  const prevUrl = String(existing.file_url ?? "");
  const urlChanged = prevUrl !== url;
  const nextUploaded = urlChanged ? new Date().toISOString() : existing.file_uploaded_at;

  await db
    .prepare(
      `UPDATE resource_documents
       SET business_unit = ?, category = ?, title = ?, file_url = ?, file_uploaded_at = ?
       WHERE id = ?`
    )
    .run(facility, cat, t, url, nextUploaded, id);

  return res.json({ message: "Document updated" });
});

router.delete("/documents/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
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
