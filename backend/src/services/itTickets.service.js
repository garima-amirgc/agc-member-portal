const { db, isPostgres } = require("../config/db");
const { ROLES, TICKET_STATUS, TICKET_PRIORITIES, TICKET_PRIORITY_DEFAULT, canonicalRole } = require("../config/constants");
const email = require("./email.service");
const userDeptSvc = require("./userDepartments.service");

const MAX_TICKET_ATTACHMENTS = 5;

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

async function listAllUsersForBehalfDropdown() {
  return db
    .prepare("SELECT id, name, email, business_unit, department FROM users ORDER BY name ASC")
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
  if (!assignee?.email || !String(assignee.email).trim()) {
    console.log("[IT_TICKET] Assignee has no email on file — skip mail");
    return { notified: 0, skipped: true };
  }

  const creatorDepartment = await normalizeDept(creator);
  const attachmentList = parseAttachmentsRow(ticketRow.attachments);

  const result = await email.sendITTicketCreatedEmail({
    to: assignee.email,
    itName: assignee.name,
    assigneeName: assignee.name,
    creatorName: creator?.name,
    creatorEmail: creator?.email,
    creatorDepartment,
    ticketId: ticketRow.id,
    title: ticketRow.title,
    description: ticketRow.description,
    priority: ticketRow.priority,
    attachments: attachmentList,
  });

  return { notified: 1, sent: result.sent ? 1 : 0 };
}

async function updateTicketByOwner(actor, ticketId, body) {
  const userId = actor?.id;
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

  const isOwner = Number(row.user_id) === Number(userId);
  const isIt = userId != null && (await userDeptSvc.hasDepartment(userId, "IT"));
  const isAdmin = canonicalRole(actor?.role) === ROLES.ADMIN;
  if (!isOwner && !isIt && !isAdmin) {
    const e = new Error("You cannot edit this ticket");
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

  const updated = await getTicketById(id);
  try {
    await notifyTicketUpdated(updated, actor);
  } catch (err) {
    console.error("[IT_TICKET] Update email notify failed:", err?.message || err);
  }
  return updated;
}

async function notifyTicketUpdated(ticketRow, editor) {
  const attachmentList = parseAttachmentsRow(ticketRow?.attachments);
  const creatorDepartment = await normalizeDept({ id: ticketRow?.user_id, department: ticketRow?.user_department });

  const recipients = [];
  const seen = new Set();
  const add = (email, name) => {
    const e = String(email || "").trim();
    if (!e) return;
    const key = e.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({ email: e, name: name || "" });
  };

  add(ticketRow?.assignee_email, ticketRow?.assignee_name);
  add(ticketRow?.user_email, ticketRow?.user_name);

  if (recipients.length === 0) {
    console.log("[IT_TICKET] No recipients for update email — skip mail");
    return { notified: 0, skipped: true };
  }

  const results = await Promise.all(
    recipients.map((r) =>
      email.sendITTicketUpdatedEmail({
        to: r.email,
        recipientName: r.name,
        editorName: editor?.name,
        assigneeName: ticketRow?.assignee_name,
        creatorName: ticketRow?.user_name,
        creatorEmail: ticketRow?.user_email,
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

async function createTicketAndNotify(userId, body, behalfOfUserId = null) {
  // If submitting on behalf of someone, the ticket's requester is that person
  const requesterId = behalfOfUserId ? Number(behalfOfUserId) : Number(userId);
  const requester = await db.prepare("SELECT id, name, email, department FROM users WHERE id = ?").get(requesterId);
  if (!requester) {
    const e = new Error("Requester user not found");
    e.statusCode = 404;
    throw e;
  }

  const { ticket, assignee } = await createTicket(requesterId, body);
  try {
    await notifyItStaffNewTicket(ticket, requester, assignee);
  } catch (err) {
    console.error("[IT_TICKET] Email notify failed:", err?.message || err);
  }
  return ticket;
}

// ─── Ticket Messages (chat thread) ───────────────────────────────────────────

const MSG_SELECT = `
  SELECT tm.id, tm.ticket_id, tm.sender_id, tm.body, tm.sent_at, tm.edited_at,
         u.name AS sender_name, u.profile_image_url AS sender_image_url
  FROM ticket_messages tm
  JOIN users u ON u.id = tm.sender_id`;

function mapMessage(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    ticket_id: Number(r.ticket_id),
    sender_id: Number(r.sender_id),
    body: String(r.body || ""),
    sent_at: r.sent_at || null,
    edited_at: r.edited_at || null,
    sender_name: String(r.sender_name || ""),
    sender_image_url: r.sender_image_url || null,
  };
}

async function getTicketMessages(ticketId) {
  const tid = Number(ticketId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const rows = await db
    .prepare(`${MSG_SELECT} WHERE tm.ticket_id = ? ORDER BY tm.sent_at ASC, tm.id ASC`)
    .all(tid);
  return (rows || []).map(mapMessage);
}

async function postTicketMessage(ticketId, senderId, body) {
  const tid = Number(ticketId);
  const sid = Number(senderId);
  const text = String(body || "").trim();
  if (!Number.isFinite(tid) || tid < 1) {
    const e = new Error("Invalid ticket"); e.statusCode = 400; throw e;
  }
  if (!Number.isFinite(sid) || sid < 1) {
    const e = new Error("Invalid sender"); e.statusCode = 400; throw e;
  }
  if (!text) {
    const e = new Error("Message body cannot be empty"); e.statusCode = 400; throw e;
  }
  const now = new Date().toISOString();
  const ins = await db
    .prepare("INSERT INTO ticket_messages (ticket_id, sender_id, body, sent_at) VALUES (?, ?, ?, ?)")
    .run(tid, sid, text, now);
  const newId = Number(ins.lastInsertRowid || ins.id || 0);
  const row = await db.prepare(`${MSG_SELECT} WHERE tm.id = ?`).get(newId);
  if (!row) return { id: newId, ticket_id: tid, sender_id: sid, body: text, sent_at: now, edited_at: null };
  return mapMessage(row);
}

async function editTicketMessage(ticketId, msgId, userId, newBody) {
  const tid = Number(ticketId);
  const mid = Number(msgId);
  const uid = Number(userId);
  const text = String(newBody || "").trim();
  if (!text) { const e = new Error("Message cannot be empty"); e.statusCode = 400; throw e; }
  const existing = await db.prepare("SELECT sender_id FROM ticket_messages WHERE id = ? AND ticket_id = ?").get(mid, tid);
  if (!existing) { const e = new Error("Message not found"); e.statusCode = 404; throw e; }
  if (Number(existing.sender_id) !== uid) { const e = new Error("Forbidden"); e.statusCode = 403; throw e; }
  const now = new Date().toISOString();
  try {
    await db.prepare("UPDATE ticket_messages SET body = ?, edited_at = ? WHERE id = ?").run(text, now, mid);
  } catch {
    // Fallback if edited_at column not yet migrated (server not restarted)
    await db.prepare("UPDATE ticket_messages SET body = ? WHERE id = ?").run(text, mid);
  }
  let row;
  try {
    row = await db.prepare(`${MSG_SELECT} WHERE tm.id = ?`).get(mid);
  } catch {
    // Fallback select without edited_at
    row = await db.prepare(
      `SELECT tm.id, tm.ticket_id, tm.sender_id, tm.body, tm.sent_at,
              u.name AS sender_name, u.profile_image_url AS sender_image_url
       FROM ticket_messages tm JOIN users u ON u.id = tm.sender_id WHERE tm.id = ?`
    ).get(mid);
  }
  return mapMessage(row);
}

async function deleteTicketMessage(ticketId, msgId, userId) {
  const tid = Number(ticketId);
  const mid = Number(msgId);
  const uid = Number(userId);
  const existing = await db.prepare("SELECT sender_id FROM ticket_messages WHERE id = ? AND ticket_id = ?").get(mid, tid);
  if (!existing) { const e = new Error("Message not found"); e.statusCode = 404; throw e; }
  if (Number(existing.sender_id) !== uid) { const e = new Error("Forbidden"); e.statusCode = 403; throw e; }
  await db.prepare("DELETE FROM ticket_messages WHERE id = ?").run(mid);
}

// Mark all current messages in a ticket as read for a user.
// Called whenever a user fetches the message list (GET /:id/messages).
async function markMessagesRead(ticketId, userId) {
  const tid = Number(ticketId);
  const uid = Number(userId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(uid) || uid < 1) return;
  const sql = isPostgres
    ? `INSERT INTO ticket_message_reads (ticket_id, user_id, last_read_message_id)
       SELECT $1, $2, COALESCE(MAX(id), 0) FROM ticket_messages WHERE ticket_id = $1
       ON CONFLICT (ticket_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id`
    : `INSERT OR REPLACE INTO ticket_message_reads (ticket_id, user_id, last_read_message_id)
       SELECT ?, ?, COALESCE(MAX(id), 0) FROM ticket_messages WHERE ticket_id = ?`;
  await db.prepare(sql).run(tid, uid, tid);
}

// Returns { [ticket_id]: unreadCount } for messages the user has NOT yet read
// (excludes the user's own messages — you never get a badge for your own sends).
async function getUnreadCounts(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) return {};
  // Only count unread messages for tickets where this user is the requester OR the assignee.
  // IT-department members can view all tickets, but they should not receive unread badges
  // for threads they are not a party to.
  const sql = `SELECT tm.ticket_id, COUNT(*) AS count
       FROM ticket_messages tm
       JOIN it_tickets t ON t.id = tm.ticket_id
       LEFT JOIN ticket_message_reads tmr ON tmr.ticket_id = tm.ticket_id AND tmr.user_id = ?
       WHERE tm.sender_id != ?
         AND tm.id > COALESCE(tmr.last_read_message_id, 0)
         AND (t.user_id = ? OR t.assignee_id = ?)
       GROUP BY tm.ticket_id`;
  const rows = await db.prepare(sql).all(uid, uid, uid, uid);
  const result = {};
  for (const r of rows || []) {
    result[Number(r.ticket_id)] = Number(r.count);
  }
  return result;
}

module.exports = {
  listItAssignees,
  listAllUsersForBehalfDropdown,
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
  getTicketMessages,
  postTicketMessage,
  markMessagesRead,
  getUnreadCounts,
  editTicketMessage,
  deleteTicketMessage,
};
