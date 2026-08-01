const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const { notifyManagerCourseCompletion, maybeNotifyAllTrainingComplete } = require("../services/notification.service");
const { clearAllTrainingMilestone } = require("../services/trainingCompletion.service");

const router = express.Router();
router.use(authRequired);

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normDept(raw) {
  return String(raw || "").trim();
}

// ─── Department training templates ───────────────────────────────────────────

/** GET /training/templates — list all template items (optionally ?department=Finance) */
router.get("/templates", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const dept = req.query.department ? normDept(req.query.department) : null;
    let rows;
    if (dept) {
      rows = await db.prepare(
        `SELECT t.id, t.department, t.resource_kind, t.course_id, t.document_id,
                c.title AS course_title, c.business_unit AS course_facility,
                d.title AS document_title, d.business_unit AS document_facility, d.category AS document_category
         FROM department_training_templates t
         LEFT JOIN courses c ON c.id = t.course_id
         LEFT JOIN resource_documents d ON d.id = t.document_id
         WHERE t.department = ?
         ORDER BY t.resource_kind, t.id`
      ).all(dept);
    } else {
      rows = await db.prepare(
        `SELECT t.id, t.department, t.resource_kind, t.course_id, t.document_id,
                c.title AS course_title, c.business_unit AS course_facility,
                d.title AS document_title, d.business_unit AS document_facility, d.category AS document_category
         FROM department_training_templates t
         LEFT JOIN courses c ON c.id = t.course_id
         LEFT JOIN resource_documents d ON d.id = t.document_id
         ORDER BY t.department, t.resource_kind, t.id`
      ).all();
    }
    return res.json(rows);
  } catch (e) {
    console.error("[training] GET /templates:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

/** POST /training/templates — add a course or document to a department template */
router.post("/templates", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const { department, resource_kind, course_id, document_id } = req.body || {};
    const dept = normDept(department);
    if (!dept) return res.status(400).json({ message: "department is required" });
    if (resource_kind !== "course" && resource_kind !== "document") {
      return res.status(400).json({ message: "resource_kind must be 'course' or 'document'" });
    }
    const courseIdVal = resource_kind === "course" ? parseId(course_id) : null;
    const docIdVal = resource_kind === "document" ? parseId(document_id) : null;
    if (resource_kind === "course" && !courseIdVal) return res.status(400).json({ message: "course_id required" });
    if (resource_kind === "document" && !docIdVal) return res.status(400).json({ message: "document_id required" });

    // Check exists
    if (courseIdVal) {
      const c = await db.prepare("SELECT id FROM courses WHERE id = ?").get(courseIdVal);
      if (!c) return res.status(404).json({ message: "Course not found" });
    }
    if (docIdVal) {
      const d = await db.prepare("SELECT id FROM resource_documents WHERE id = ?").get(docIdVal);
      if (!d) return res.status(404).json({ message: "Document not found" });
    }

    // Prevent duplicate — split by kind to avoid NULL type inference issues in PostgreSQL
    let existing;
    if (resource_kind === "course") {
      existing = await db.prepare(
        "SELECT id FROM department_training_templates WHERE department = ? AND resource_kind = 'course' AND course_id = ?"
      ).get(dept, courseIdVal);
    } else {
      existing = await db.prepare(
        "SELECT id FROM department_training_templates WHERE department = ? AND resource_kind = 'document' AND document_id = ?"
      ).get(dept, docIdVal);
    }

    if (existing) return res.status(409).json({ message: "This item is already in the template" });

    const out = await db.prepare(
      "INSERT INTO department_training_templates(department, resource_kind, course_id, document_id, created_by) VALUES (?, ?, ?, ?, ?)"
    ).run(dept, resource_kind, courseIdVal, docIdVal, req.user.id);

    return res.status(201).json({ id: out.lastInsertRowid });
  } catch (e) {
    console.error("[training] POST /templates:", e);
    if (String(e.message || "").includes("no such table")) {
      return res.status(500).json({ message: "Training tables not yet created — restart the backend to run migrations." });
    }
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

/** DELETE /training/templates/:id — remove an item from a department template */
router.delete("/templates/:id", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });
    const row = await db.prepare("SELECT id FROM department_training_templates WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ message: "Not found" });
    await db.prepare("DELETE FROM department_training_templates WHERE id = ?").run(id);
    return res.json({ message: "Removed" });
  } catch (e) {
    console.error("[training] DELETE /templates/:id:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── User training assignments ────────────────────────────────────────────────

/** GET /training/users/:userId — list all training assignments for a user */
router.get("/users/:userId", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    if (!userId) return res.status(400).json({ message: "Invalid userId" });

    const [courseAssignments, docAssignments] = await Promise.all([
      // formal course assignments (existing assignments table)
      db.prepare(
        `SELECT 'course' AS resource_kind, a.id, a.course_id, NULL AS document_id,
                a.status, a.progress, a.assigned_at, a.completed_at,
                c.title AS title, c.business_unit AS facility, c.resource_category AS category
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         WHERE a.user_id = ?
         ORDER BY a.assigned_at DESC`
      ).all(userId),
      // document assignments (new table)
      db.prepare(
        `SELECT 'document' AS resource_kind, uta.id, NULL AS course_id, uta.document_id,
                uta.status, 100 AS progress, uta.assigned_at, uta.completed_at,
                d.title AS title, d.business_unit AS facility, d.category
         FROM user_training_assignments uta
         JOIN resource_documents d ON d.id = uta.document_id
         WHERE uta.user_id = ? AND uta.resource_kind = 'document'
         ORDER BY uta.assigned_at DESC`
      ).all(userId),
    ]);

    return res.json({ courses: courseAssignments, documents: docAssignments });
  } catch (e) {
    console.error("[training] GET /users/:userId:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/** POST /training/users/:userId — assign a resource to a user */
router.post("/users/:userId", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    if (!userId) return res.status(400).json({ message: "Invalid userId" });

    const user = await db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { resource_kind, course_id, document_id } = req.body || {};
    if (resource_kind !== "course" && resource_kind !== "document") {
      return res.status(400).json({ message: "resource_kind must be 'course' or 'document'" });
    }

    if (resource_kind === "course") {
      const courseId = parseId(course_id);
      if (!courseId) return res.status(400).json({ message: "course_id required" });
      const course = await db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      try {
        const out = await db.prepare("INSERT INTO assignments(user_id, course_id) VALUES (?, ?)").run(userId, courseId);
        await clearAllTrainingMilestone(userId);
        return res.status(201).json({ id: out.lastInsertRowid, resource_kind: "course" });
      } catch {
        return res.status(409).json({ message: "Course already assigned to this user" });
      }
    }

    // document
    const docId = parseId(document_id);
    if (!docId) return res.status(400).json({ message: "document_id required" });
    const doc = await db.prepare("SELECT id FROM resource_documents WHERE id = ?").get(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    try {
      const out = await db.prepare(
        "INSERT INTO user_training_assignments(user_id, resource_kind, document_id, assigned_by) VALUES (?, 'document', ?, ?)"
      ).run(userId, docId, req.user.id);
      await clearAllTrainingMilestone(userId);
      return res.status(201).json({ id: out.lastInsertRowid, resource_kind: "document" });
    } catch {
      return res.status(409).json({ message: "Document already assigned to this user" });
    }
  } catch (e) {
    console.error("[training] POST /users/:userId:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/** DELETE /training/users/:userId/course/:courseId — unassign a course */
router.delete("/users/:userId/course/:courseId", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    const courseId = parseId(req.params.courseId);
    if (!userId || !courseId) return res.status(400).json({ message: "Invalid ids" });
    const row = await db.prepare("SELECT id FROM assignments WHERE user_id = ? AND course_id = ?").get(userId, courseId);
    if (!row) return res.status(404).json({ message: "Assignment not found" });
    await db.prepare("DELETE FROM assignments WHERE user_id = ? AND course_id = ?").run(userId, courseId);
    await clearAllTrainingMilestone(userId);
    return res.json({ message: "Unassigned" });
  } catch (e) {
    console.error("[training] DELETE course assignment:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/** DELETE /training/users/:userId/document/:documentId — unassign a document */
router.delete("/users/:userId/document/:documentId", requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN), async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    const documentId = parseId(req.params.documentId);
    if (!userId || !documentId) return res.status(400).json({ message: "Invalid ids" });
    const row = await db.prepare(
      "SELECT id FROM user_training_assignments WHERE user_id = ? AND document_id = ? AND resource_kind = 'document'"
    ).get(userId, documentId);
    if (!row) return res.status(404).json({ message: "Assignment not found" });
    await db.prepare("DELETE FROM user_training_assignments WHERE id = ?").run(row.id);
    await clearAllTrainingMilestone(userId);
    return res.json({ message: "Unassigned" });
  } catch (e) {
    console.error("[training] DELETE document assignment:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/** PUT /training/users/:userId/document/:documentId/complete — employee marks a document done */
router.put("/users/:userId/document/:documentId/complete", async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    const documentId = parseId(req.params.documentId);
    if (!userId || !documentId) return res.status(400).json({ message: "Invalid ids" });

    // Only the user themselves or a learning admin can mark complete
    const isAdmin = req.user.admin_grants && (
      String(req.user.admin_grants).includes(ADMIN_GRANT_KEYS.LEARNING_ADMIN)
    );
    if (req.user.id !== userId && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const row = await db.prepare(
      "SELECT id, status FROM user_training_assignments WHERE user_id = ? AND document_id = ? AND resource_kind = 'document'"
    ).get(userId, documentId);
    if (!row) return res.status(404).json({ message: "Assignment not found" });
    if (row.status === "completed") return res.json({ message: "Already completed", already: true });

    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE user_training_assignments SET status = 'completed', completed_at = ? WHERE id = ?"
    ).run(now, row.id);

    // Notify manager
    const doc = await db.prepare("SELECT title FROM resource_documents WHERE id = ?").get(documentId);
    const user = await db.prepare("SELECT manager_id FROM users WHERE id = ?").get(userId);
    if (user?.manager_id) {
      void notifyManagerCourseCompletion({
        managerId: user.manager_id,
        employeeId: userId,
        courseId: documentId,          // reuse course_id field for doc id
        courseTitle: `[Document] ${doc?.title || "Unknown document"}`,
      });
    }

    const allTraining = await maybeNotifyAllTrainingComplete(userId);

    return res.json({
      message: "Document marked as complete",
      all_training_complete: allTraining.allComplete,
      all_training_just_notified: allTraining.notified,
    });
  } catch (e) {
    console.error("[training] PUT complete:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── Auto-assign department template to a user ────────────────────────────────

/**
 * Called internally (from users.routes.js) when a new hire is created/updated.
 * Assigns all items in the department's training template to the user.
 */
async function autoAssignDepartmentTemplate(userId, department, assignedBy) {
  if (!userId || !department) return;
  const dept = normDept(department);
  const templates = await db.prepare(
    "SELECT * FROM department_training_templates WHERE department = ?"
  ).all(dept);

  for (const t of templates) {
    try {
      if (t.resource_kind === "course" && t.course_id) {
        await db.prepare("INSERT INTO assignments(user_id, course_id) VALUES (?, ?)").run(userId, t.course_id);
      } else if (t.resource_kind === "document" && t.document_id) {
        await db.prepare(
          "INSERT INTO user_training_assignments(user_id, resource_kind, document_id, assigned_by) VALUES (?, 'document', ?, ?)"
        ).run(userId, t.document_id, assignedBy || null);
      }
    } catch {
      // Skip duplicates silently
    }
  }
  await clearAllTrainingMilestone(userId);
}

/** GET /training/me — employee's own training assignments */
router.get("/me", async (req, res) => {
  try {
    const userId = req.user.id;
    const [courseAssignments, docAssignments] = await Promise.all([
      db.prepare(
        `SELECT a.id, a.course_id, a.status, a.progress, a.assigned_at, a.completed_at,
                c.title, c.description, c.business_unit AS facility, c.resource_category AS category
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         WHERE a.user_id = ?
         ORDER BY a.assigned_at DESC`
      ).all(userId),
      db.prepare(
        `SELECT uta.id, uta.document_id, uta.status, uta.assigned_at, uta.completed_at,
                d.title, d.business_unit AS facility, d.category, d.file_url,
                d.topic
         FROM user_training_assignments uta
         JOIN resource_documents d ON d.id = uta.document_id
         WHERE uta.user_id = ? AND uta.resource_kind = 'document'
         ORDER BY uta.assigned_at DESC`
      ).all(userId),
    ]);
    return res.json({ courses: courseAssignments, documents: docAssignments });
  } catch (e) {
    console.error("[training] GET /me:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
module.exports.autoAssignDepartmentTemplate = autoAssignDepartmentTemplate;
