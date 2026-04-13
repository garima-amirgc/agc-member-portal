const express = require("express");
const { db } = require("../config/db");
const { ROLES } = require("../config/constants");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

router.get("/me", async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT
        mn.*,
        e.name AS employee_name,
        c.title AS course_name
      FROM manager_notifications mn
      JOIN users e ON e.id = mn.employee_id
      JOIN courses c ON c.id = mn.course_id
      WHERE mn.manager_id = ? AND mn.status = 'active'
      ORDER BY mn.created_at DESC`
    )
    .all(req.user.id);

  return res.json(rows);
});

router.post("/:id/dismiss", async (req, res) => {
  if (req.user.role !== ROLES.MANAGER) return res.status(403).json({ message: "Forbidden" });

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
