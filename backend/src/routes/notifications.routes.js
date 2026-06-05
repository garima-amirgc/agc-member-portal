const express = require("express");
const { db } = require("../config/db");
const { hasDirectReports } = require("../services/supervisor.service");
const { authRequired } = require("../middleware/auth");
const { maybeNotifyAllTrainingComplete } = require("../services/notification.service");

const router = express.Router();
router.use(authRequired);

router.get("/employee/me", async (req, res) => {
  await maybeNotifyAllTrainingComplete(req.user.id);

  const rows = await db
    .prepare(
      `SELECT id, kind, title, message, status, created_at
       FROM employee_notifications
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at DESC`
    )
    .all(req.user.id);

  return res.json(rows);
});

router.post("/employee/:id/dismiss", async (req, res) => {
  const notif = await db
    .prepare("SELECT id, status FROM employee_notifications WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!notif) return res.status(404).json({ message: "Notification not found" });

  await db.prepare("UPDATE employee_notifications SET status = 'dismissed', dismissed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    notif.id
  );

  return res.json({ message: "Notification dismissed" });
});

router.get("/me", async (req, res) => {
  if (!(await hasDirectReports(req.user.id))) return res.status(403).json({ message: "Forbidden" });

  const courseRows = await db
    .prepare(
      `SELECT
        mn.id,
        mn.manager_id,
        mn.employee_id,
        mn.course_id,
        mn.course_title,
        mn.status,
        mn.created_at,
        mn.dismissed_at,
        'course' AS notification_kind,
        e.name AS employee_name,
        c.title AS course_name
      FROM manager_notifications mn
      JOIN users e ON e.id = mn.employee_id
      JOIN courses c ON c.id = mn.course_id
      WHERE mn.manager_id = ? AND mn.status = 'active'
      ORDER BY mn.created_at DESC`
    )
    .all(req.user.id);

  const allTrainingRows = await db
    .prepare(
      `SELECT
        mta.id,
        mta.manager_id,
        mta.employee_id,
        NULL AS course_id,
        'All assigned training' AS course_title,
        mta.status,
        mta.created_at,
        mta.dismissed_at,
        'all_training' AS notification_kind,
        e.name AS employee_name,
        'All assigned training' AS course_name
      FROM manager_all_training_alerts mta
      JOIN users e ON e.id = mta.employee_id
      WHERE mta.manager_id = ? AND mta.status = 'active'
      ORDER BY mta.created_at DESC`
    )
    .all(req.user.id);

  const merged = [...courseRows, ...allTrainingRows].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  return res.json(merged);
});

router.post("/:id/dismiss", async (req, res) => {
  if (!(await hasDirectReports(req.user.id))) return res.status(403).json({ message: "Forbidden" });

  const kind = String(req.query.kind || "course").trim();

  if (kind === "all_training") {
    const notif = await db
      .prepare("SELECT id, status FROM manager_all_training_alerts WHERE id = ? AND manager_id = ?")
      .get(req.params.id, req.user.id);

    if (!notif) return res.status(404).json({ message: "Notification not found" });

    await db
      .prepare("UPDATE manager_all_training_alerts SET status = 'dismissed', dismissed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), notif.id);

    return res.json({ message: "Notification dismissed" });
  }

  const notif = await db
    .prepare("SELECT id, status FROM manager_notifications WHERE id = ? AND manager_id = ?")
    .get(req.params.id, req.user.id);

  if (!notif) return res.status(404).json({ message: "Notification not found" });

  await db.prepare("UPDATE manager_notifications SET status = 'dismissed', dismissed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    notif.id
  );

  return res.json({ message: "Notification dismissed" });
});

module.exports = router;
