const { db, isPostgres } = require("../config/db");
const { ROLES, TICKET_STATUS, TICKET_PRIORITIES, TICKET_PRIORITY_DEFAULT, canonicalRole } = require("../config/constants");
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

/** Normalize ticket rows for API (profile image from users join). */
function mapTicketRow(row) {
  if (!row) return row;
  const url =
    row.user_profile_image_url != null && String(row.user_profile_image_url).trim()
      ? String(row.user_profile_image_url).trim()
      : null;
  return {
    ...row,
    user_profile_image_url: url,
  };
}

function mapTicketRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(mapTicketRow);
}

const USER_DEPT_LABEL_SQL = isPostgres
  ? `COALESCE((SELECT string_agg(d.department, ', ' ORDER BY d.department) FROM user_departments d WHERE d.user_id = u.id), COALESCE(NULLIF(TRIM(u.department), ''), 'Production'))`
  : `COALESCE((SELECT GROUP_CONCAT(d.department, ', ') FROM (SELECT department FROM user_departments WHERE user_id = u.id ORDER BY department) AS d), COALESCE(NULLIF(TRIM(u.department), ''), 'Production'))`;

/** Completed tickets stay visible for 30 days after completion, then drop from queue lists. */
const COMPLETED_TICKET_RETENTION_DAYS = 30;

const TICKET_PRIORITY_ORDER_SQL = `CASE COALESCE(NULLIF(TRIM(t.priority), ''), '${TICKET_PRIORITY_DEFAULT}')
  WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 2 END`;

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

function normalizePriority(raw) {
  const v = String(raw ?? TICKET_PRIORITY_DEFAULT).trim().toLowerCase();
  if (!TICKET_PRIORITIES.includes(v)) {
    const e = new Error("Invalid priority. Choose low, medium, high, or urgent.");
    e.statusCode = 400;
    throw e;
  }
  return v;
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
  const priority = normalizePriority(body?.priority);

  const attachmentsJson = normalizeAttachmentsJson(body);

  const result = await db
    .prepare(
      "INSERT INTO it_tickets (user_id, assignee_id, title, description, status, priority, updated_at, attachments) VALUES (?, ?, ?, ?, 'open', ?, datetime('now'), ?)"
    )
    .run(userId, assignee.id, title, description || null, priority, attachmentsJson);

  const ticketId = result.lastInsertRowid;
  return { ticket: mapTicketRow(await getTicketById(ticketId)), assignee };
}

async function getTicketById(id) {
  const row = await db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        u.profile_image_url AS user_profile_image_url,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.id = ?
      `
    )
    .get(id);
  return mapTicketRow(row);
}

async function listTicketsForUser(userId) {
  const rows = await db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        u.profile_image_url AS user_profile_image_url,
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
  return mapTicketRows(rows);
}

async function listAllTicketsForIT() {
  const rows = await db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        u.profile_image_url AS user_profile_image_url,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE ${IT_TICKET_LIST_VISIBILITY_PREDICATE}
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        ${TICKET_PRIORITY_ORDER_SQL},
        datetime(t.created_at) DESC
      `
    )
    .all();
  return mapTicketRows(rows);
}

async function listTicketsAssignedToAssignee(assigneeUserId) {
  const rows = await db
    .prepare(
      `
      SELECT t.*, u.name AS user_name, u.email AS user_email,
        u.profile_image_url AS user_profile_image_url,
        ${USER_DEPT_LABEL_SQL.replace(/\n/g, " ")} AS user_department,
        a.name AS assignee_name, a.email AS assignee_email
      FROM it_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users a ON a.id = t.assignee_id
      WHERE t.assignee_id = ?
        AND ${IT_TICKET_LIST_VISIBILITY_PREDICATE}
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        ${TICKET_PRIORITY_ORDER_SQL},
        datetime(t.created_at) DESC
      `
    )
    .all(assigneeUserId);
  return mapTicketRows(rows);
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

  const before = await getTicketById(ticketId);

  if (status === "closed") {
    await db
      .prepare("UPDATE it_tickets SET status = ?, updated_at = datetime('now'), closed_at = datetime('now') WHERE id = ?")
      .run(status, ticketId);
  } else {
    await db
      .prepare("UPDATE it_tickets SET status = ?, updated_at = datetime('now'), closed_at = NULL WHERE id = ?")
      .run(status, ticketId);
  }

  const updated = await getTicketById(ticketId);

  // Notify the ticket creator only once when the ticket transitions into "closed".
  if (status === "closed" && before && before.status !== "closed") {
    try {
      await email.sendITTicketResolvedEmail({
        to: before.user_email,
        creatorName: before.user_name,
        creatorEmail: before.user_email,
        itName: updated?.assignee_name,
        assigneeName: updated?.assignee_name,
        ticketId: updated?.id || ticketId,
        title: updated?.title,
        description: updated?.description,
      });
    } catch (err) {
      console.error("[IT_TICKET] Resolved email notify failed:", err?.message || err);
    }
  }

  return updated;
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
        priority: ticketRow.priority,
        attachments: attachmentList,
      })
    )
  );

  const sent = results.filter((r) => r.sent).length;
  return { notified: recipients.length, sent };
}

async function updateTicketByOwner(userId, ticketId, body) {
  const id = Number(ticketId);
  if (!Number.isFinite(id) || id < 1) {
    const e = new Error("Invalid ticket id");
    e.statusCode = 400;
    throw e;
  }

  const row = await db.prepare("SELECT * FROM it_tickets WHERE id = ?").get(id);
  if (!row) {
    const e = new Error("Ticket not found");
    e.statusCode = 404;
    throw e;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const e = new Error("You can only edit your own tickets");
    e.statusCode = 403;
    throw e;
  }
  if (row.status !== "open") {
    const e = new Error("Only open tickets can be edited");
    e.statusCode = 400;
    throw e;
  }

  const title = body?.title != null ? String(body.title).trim() : String(row.title || "").trim();
  if (!title) {
    const e = new Error("Title is required");
    e.statusCode = 400;
    throw e;
  }

  const description =
    body?.description !== undefined
      ? body.description != null
        ? String(body.description).trim() || null
        : null
      : row.description;

  const priority = body?.priority != null ? normalizePriority(body.priority) : normalizePriority(row.priority);

  let assigneeId = row.assignee_id;
  if (body?.assignee_id != null) {
    const assignee = await validateItAssignee(body.assignee_id);
    assigneeId = assignee.id;
  }

  let attachmentsJson = row.attachments;
  if (body?.attachments !== undefined) {
    attachmentsJson = normalizeAttachmentsJson(body);
  }

  await db
    .prepare(
      `UPDATE it_tickets
       SET title = ?, description = ?, priority = ?, assignee_id = ?, attachments = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(title, description, priority, assigneeId, attachmentsJson, id);

  return getTicketById(id);
}

async function deleteTicket(actor, ticketId) {
  if (!actor || canonicalRole(actor.role) !== ROLES.ADMIN) {
    const e = new Error("Only administrators can delete tickets");
    e.statusCode = 403;
    throw e;
  }
  const id = Number(ticketId);
  if (!Number.isFinite(id) || id < 1) {
    const e = new Error("Invalid ticket id");
    e.statusCode = 400;
    throw e;
  }
  const ticket = await db.prepare("SELECT id FROM it_tickets WHERE id = ?").get(id);
  if (!ticket) {
    const e = new Error("Ticket not found");
    e.statusCode = 404;
    throw e;
  }
  await db.prepare("DELETE FROM it_tickets WHERE id = ?").run(id);
  return { deleted: id };
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
  updateTicketByOwner,
  deleteTicket,
  normalizeDept,
};
