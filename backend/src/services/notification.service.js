const { db } = require("../config/db");
const {
  sendManagerCourseCompletionEmail,
  sendManagerAllTrainingCompleteEmail,
  sendEmployeeAllTrainingCompleteEmail,
} = require("./email.service");
const { getTrainingSummary } = require("./trainingCompletion.service");

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

/**
 * When an employee finishes every facility-scoped assignment, notify them and their manager once
 * per completion cycle (new assignments reset the milestone).
 * @param {number} employeeId
 * @returns {Promise<{ notified: boolean, allComplete: boolean }>}
 */
async function maybeNotifyAllTrainingComplete(employeeId) {
  const summary = await getTrainingSummary(employeeId);
  if (!summary.allComplete) {
    return { notified: false, allComplete: false };
  }

  const milestone = await db
    .prepare("SELECT assignment_count FROM all_training_milestones WHERE employee_id = ?")
    .get(employeeId);
  if (milestone && Number(milestone.assignment_count) === summary.total) {
    return { notified: false, allComplete: true };
  }

  const employee = await db.prepare("SELECT id, name, email, manager_id FROM users WHERE id = ?").get(employeeId);
  if (!employee) return { notified: false, allComplete: true };

  const now = new Date().toISOString();
  const title = "All assigned training complete";
  const message = `Congratulations! You have completed all ${summary.total} assigned training item${summary.total === 1 ? "" : "s"}.`;

  const existingEmployeeNotif = await db
    .prepare(
      "SELECT id, status FROM employee_notifications WHERE user_id = ? AND kind = 'all_training_complete' ORDER BY id DESC LIMIT 1"
    )
    .get(employeeId);

  if (existingEmployeeNotif) {
    await db
      .prepare(
        "UPDATE employee_notifications SET title = ?, message = ?, status = 'active', dismissed_at = NULL, created_at = ? WHERE id = ?"
      )
      .run(title, message, now, existingEmployeeNotif.id);
  } else {
    await db
      .prepare(
        "INSERT INTO employee_notifications (user_id, kind, title, message, status, created_at) VALUES (?, 'all_training_complete', ?, ?, 'active', ?)"
      )
      .run(employeeId, title, message, now);
  }

  const managerId = employee.manager_id || null;
  if (managerId) {
    const existingManagerAlert = await db
      .prepare("SELECT id, status FROM manager_all_training_alerts WHERE manager_id = ? AND employee_id = ?")
      .get(managerId, employeeId);

    if (existingManagerAlert) {
      if (existingManagerAlert.status === "dismissed") {
        await db
          .prepare(
            "UPDATE manager_all_training_alerts SET status = 'active', dismissed_at = NULL, created_at = ? WHERE id = ?"
          )
          .run(now, existingManagerAlert.id);
      }
    } else {
      await db
        .prepare(
          "INSERT INTO manager_all_training_alerts (manager_id, employee_id, status, created_at) VALUES (?, ?, 'active', ?)"
        )
        .run(managerId, employeeId, now);
    }

    const manager = await db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(managerId);
    void sendManagerAllTrainingCompleteEmail({
      managerEmail: manager?.email,
      managerName: manager?.name,
      employeeName: employee.name || "An employee",
      employeeEmail: employee.email,
      courseCount: summary.total,
    })
      .then((r) => {
        if (r?.sent) console.log("[EMAIL] All-training completion sent to manager:", manager?.email);
      })
      .catch((err) => {
        console.error("[EMAIL] Failed to send all-training manager email:", err.message);
      });
  }

  void sendEmployeeAllTrainingCompleteEmail({
    employeeEmail: employee.email,
    employeeName: employee.name,
    courseCount: summary.total,
  })
    .then((r) => {
      if (r?.sent) console.log("[EMAIL] All-training completion sent to employee:", employee.email);
    })
    .catch((err) => {
      console.error("[EMAIL] Failed to send all-training employee email:", err.message);
    });

  const milestoneRow = await db
    .prepare("SELECT employee_id FROM all_training_milestones WHERE employee_id = ?")
    .get(employeeId);
  if (milestoneRow) {
    await db
      .prepare("UPDATE all_training_milestones SET assignment_count = ?, notified_at = ? WHERE employee_id = ?")
      .run(summary.total, now, employeeId);
  } else {
    await db
      .prepare("INSERT INTO all_training_milestones (employee_id, assignment_count, notified_at) VALUES (?, ?, ?)")
      .run(employeeId, summary.total, now);
  }

  console.log(
    "[NOTIFICATION]",
    JSON.stringify({
      type: "ALL_TRAINING_COMPLETE",
      employeeId,
      managerId,
      courseCount: summary.total,
      sentAt: now,
    })
  );

  return { notified: true, allComplete: true };
}

module.exports = { notifyManagerCourseCompletion, maybeNotifyAllTrainingComplete };
