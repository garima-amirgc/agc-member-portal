const { db, isPostgres } = require("../config/db");
const { TICKET_STATUS } = require("../config/constants");
const email = require("./email.service");
const userDeptSvc = require("./userDepartments.service");

const MAX_TICKET_ATTACHMENTS = 5;

/** @returns {string | null} JSON array string for DB */
function normalizeAttachmentsJson(body) {
  let raw = body?.attachments;
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw.slice(0, MAX_TICKET_ATTACHMENTS)) {
    const url = typeof item === "string" ? item : item?.url;
    const name =
      typeof item === "object" && item?.name != null ? String(item.name).trim().slice(0, 200) : "";
    if (!url || typeof url !== "string") continue;
    const u = url.trim();
    if (u.length < 8 || u.length > 2048) continue;
    out.push({ url: u, name: name || "attachment" });
  }
  return out.length ? JSON.stringify(out) : null;
}

function parseAttachmentsRow(raw) {
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const USER_DEPT_LABEL_SQL = isPostgres
  ? `COALESCE((SELECT string_agg(d.department, ', ' ORDER BY d.department) FROM user_departments d WHERE d.user_id = u.id), COALESCE(NULLIF(TRIM(u.department), ''), 'Production'))`
  : `COALESCE((SELECT GROUP_CONCAT(d.department, ', ') FROM (SELECT department FROM user_departments WHERE user_id = u.id ORDER BY department) AS d), COALESCE(NULLIF(TRIM(u.department), ''), 'Production'))`;

/** Completed tickets stay visible for 30 days after completion, then drop from queue lists. */
const COMPLETED_TICKET_RETENTION_DAYS = 30;
const IT_TICKET_LIST_VISIBILITY_PREDICATE = isPostgres
  ? `(t.status <> 'closed' OR COALESCE(t.closed_at, t.updated_at) >= (CURRENT_TIMESTAMP - INTERVAL '${COMPLETED_TICKET_RETENTION_DAYS} days'))`
  : `(t.status <> 'closed' OR datetime(COALESCE(t.closed_at, t.updated_at)) >= datetime('now', '-${COMPLETED_TICKET_RETENTION_DAYS} days'))`;

async function normalizeDept(rowOrId) {
  if (rowOrId == null) return "Production";
  const id = typeof rowOrId === "object" ? rowOrId.id : rowOrId;
  if (id != null && Number(id) > 0) {
    return (await userDeptSvc.listForUser(id)).join(", ");
  }
  return rowOrId?.department || "Production";
}

async function listItAssignees() {
  return db
    .prepare(
      `
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department = 'IT'
      ORDER BY u.name ASC
      `
    )
    .all();
}

async function validateItAssignee(assigneeId) {
  const id = Number(assigneeId);
  if (!Number.isFinite(id) || id < 1) {
    const e = new Error("Please select an IT staff member");
    e.statusCode = 400;
    throw e;
  }
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department = 'IT'
       WHERE u.id = ?`
    )
    .get(id);
  if (!row) {
    const e = new Error("Invalid IT assignee");
    e.statusCode = 400;
    throw e;
  }
  return row;
}

async function createTicket(userId, body) {
  const title = String(body?.title || "").trim();
  const description = body?.description != null ? String(body.description).trim() : "";
  if (!title) {
    const e = new Error("Title is required");
    e.statusCode = 400;
    throw e;
  }

  const assignee = await validateItAssignee(body?.assignee_id);

  const attachmentsJson = normalizeAttachmentsJson(body);

  const result = await db
    .prepare(
      "INSERT INTO it_tickets (user_id, assignee_id, title, description, status, updated_at, attachments) VALUES (?, ?, ?, ?, 'open', datetime('now'), ?)"
    )
    .run(userId, assignee.id, title, description || null, attachmentsJson);

  const ticketId = result.lastInsertRowid;
  return { ticket: await getTicketById(ticketId), assignee };
}

async function getTicketById(id) {
  return db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.id = ?
      `
    )
    .get(id);
}

async function listTicketsForUser(userId) {
  return db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.user_id = ?
        AND ${IT_TICKET_LIST_VISIBILITY_PREDICATE}
      ORDER BY datetime(t.created_at) DESC
      `
    )
    .all(userId);
}

async function listAllTicketsForIT() {
  return db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE ${IT_TICKET_LIST_VISIBILITY_PREDICATE}
      ORDER BY datetime(t.created_at) DESC
      `
    )
    .all();
}

async function listTicketsAssignedToAssignee(assigneeUserId) {
  return db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.assignee_id = ?
        AND ${IT_TICKET_LIST_VISIBILITY_PREDICATE}
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        datetime(t.created_at) DESC
      `
    )
    .all(assigneeUserId);
}

async function updateTicketStatus(itUserId, ticketId, status) {
  if (!TICKET_STATUS.includes(status)) {
    const e = new Error("Invalid status");
    e.statusCode = 400;
    throw e;
  }
  if (!(await userDeptSvc.hasDepartment(itUserId, "IT"))) {
    const e = new Error("Only IT department can update ticket status");
    e.statusCode = 403;
    throw e;
  }
  const ticket = await db.prepare("SELECT id FROM it_tickets WHERE id = ?").get(ticketId);
  if (!ticket) {
    const e = new Error("Ticket not found");
    e.statusCode = 404;
    throw e;
  }
  if (status === "closed") {
    await db
      .prepare("UPDATE it_tickets SET status = ?, updated_at = datetime('now'), closed_at = datetime('now') WHERE id = ?")
      .run(status, ticketId);
  } else {
    await db
      .prepare("UPDATE it_tickets SET status = ?, updated_at = datetime('now'), closed_at = NULL WHERE id = ?")
      .run(status, ticketId);
  }
  return getTicketById(ticketId);
}

async function notifyItStaffNewTicket(ticketRow, creator, assignee) {
  const primary = assignee?.email ? [{ email: assignee.email, name: assignee.name }] : [];

  const others = await db
    .prepare(
      `
      SELECT DISTINCT u.email, u.name FROM users u
      INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department = 'IT'
      WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''
        AND u.id <> ?
      `
    )
    .all(assignee?.id ?? 0);

  const recipients = [...primary, ...others];
  if (recipients.length === 0) {
    console.log("[IT_TICKET] No IT users with email on file — skip mail");
    return { notified: 0, skipped: true };
  }

  const creatorDepartment = await normalizeDept(creator);
  const attachmentList = parseAttachmentsRow(ticketRow.attachments);

  const results = await Promise.all(
    recipients.map((u) =>
      email.sendITTicketCreatedEmail({
        to: u.email,
        itName: u.name,
        assigneeName: assignee?.name,
        creatorName: creator?.name,
        creatorEmail: creator?.email,
        creatorDepartment,
        ticketId: ticketRow.id,
        title: ticketRow.title,
        description: ticketRow.description,
        attachments: attachmentList,
      })
    )
  );

  const sent = results.filter((r) => r.sent).length;
  return { notified: recipients.length, sent };
}

async function createTicketAndNotify(userId, body) {
  const creator = await db.prepare("SELECT id, name, email, department FROM users WHERE id = ?").get(userId);
  if (!creator) {
    const e = new Error("User not found");
    e.statusCode = 404;
    throw e;
  }

  const { ticket, assignee } = await createTicket(userId, body);
  try {
    await notifyItStaffNewTicket(ticket, creator, assignee);
  } catch (err) {
    console.error("[IT_TICKET] Email notify failed:", err?.message || err);
  }
  return ticket;
}

module.exports = {
  listItAssignees,
  createTicket,
  createTicketAndNotify,
  getTicketById,
  listTicketsForUser,
  listAllTicketsForIT,
  listTicketsAssignedToAssignee,
  updateTicketStatus,
  normalizeDept,
};
