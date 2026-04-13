const { db } = require("../config/db");
const { sendManagerCourseCompletionEmail } = require("./email.service");

const notifyManagerCourseCompletion = async ({ managerId, employeeId, courseId, courseTitle }) => {
  if (!managerId || !employeeId || !courseId) return;

  const existing = await db
    .prepare("SELECT id, status FROM manager_notifications WHERE manager_id = ? AND employee_id = ? AND course_id = ?")
    .get(managerId, employeeId, courseId);

  if (existing) {
    if (existing.status === "dismissed") {
      await db
        .prepare("UPDATE manager_notifications SET status = 'active', dismissed_at = NULL WHERE id = ?")
        .run(existing.id);
    }
  } else {
    await db
      .prepare(
        "INSERT INTO manager_notifications (manager_id, employee_id, course_id, course_title, status) VALUES (?, ?, ?, ?, 'active')"
      )
      .run(managerId, employeeId, courseId, courseTitle || "Unknown course");
  }

  const manager = await db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(managerId);
  const employee = await db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(employeeId);

  const payload = {
    type: "COURSE_COMPLETED",
    managerId,
    employeeId,
    courseTitle: courseTitle || "Unknown course",
    sentAt: new Date().toISOString(),
    managerEmail: manager?.email || null,
  };
  console.log("[NOTIFICATION]", JSON.stringify(payload));

  void sendManagerCourseCompletionEmail({
    managerEmail: manager?.email,
    managerName: manager?.name,
    employeeName: employee?.name || "An employee",
    employeeEmail: employee?.email,
    courseTitle: courseTitle || "Unknown course",
  })
    .then((r) => {
      if (r?.sent) console.log("[EMAIL] Course completion sent to manager:", manager?.email);
      if (r?.skipped && manager?.email) {
        console.log("[EMAIL] Skipped (SMTP not configured); manager:", manager?.email);
      }
    })
    .catch((err) => {
      console.error("[EMAIL] Failed to send course completion:", err.message);
    });
};

module.exports = { notifyManagerCourseCompletion };
