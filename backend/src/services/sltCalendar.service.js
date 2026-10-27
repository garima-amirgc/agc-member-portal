const { db } = require("../config/db");
const crypto = require("crypto");
const audit = require("./sltAudit.service");
const email = require("./email.service");
const { ADMIN_GRANT_KEYS, hasAnyAdminGrant, parseAdminGrantsColumn } = require("../config/adminGrants");

/**
 * SLT Tracker — Master Calendar.
 *
 * Backs the "Master Calendar" radio-button view in SltTrackerV2.jsx, using
 * the slt_calendar table (already created in config/database/{sqlite,
 * postgres}.js and previously populated, then emptied, by
 * scripts/importSltWorkbooks.js). Field set and column order mirror the
 * source workbook's "Master Calendar" sheet exactly: Month, Event Date,
 * Event / Deadline, Category, Executive(s), Owner / Lead, Executive Action
 * Required, Prep Start Date, Prep Deadline, Materials Needed, Notes, plus
 * the two computed columns (Days Until Event, Prep Days Left) — see
 * mapCalendarEvent() below. The table has a few extra columns
 * (start_time/end_time/status/risk/last_reviewed_date/
 * digital_calendar_eligible/calendar_entry_title/deferred_return_date)
 * left over from an earlier, broader design; none of those are in the
 * source sheet, so this service doesn't read or write them.
 *
 * Event Date in the sheet is sometimes a real date and sometimes a text
 * range ("Oct 17-21, 2026") in the same column — normalizeEventDate below
 * accepts both, exactly like scripts/importSltWorkbooks.js's importCalendar
 * does, so manual entry behaves the same way the importer does.
 */

const MAX_TEXT = 4000;

// Who counts as "has access to the Master Calendar" for the new-event
// notification below — the same grant set cfo.routes.js's SLT_VIEW_GRANTS
// uses to gate viewing it (cfo implies both view+edit; slt_edit implies
// slt_view — see adminGrants.js's GRANT_IMPLIED_BY). A full admin (role
// "admin" with no admin_grants restrictions at all) is also included,
// since hasAnyAdminGrant treats them as holding every grant.
const CALENDAR_ACCESS_GRANTS = [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_VIEW, ADMIN_GRANT_KEYS.SLT_EDIT];

function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

function notFound(message) {
  const e = new Error(message);
  e.statusCode = 404;
  return e;
}

function normalizeText(raw, { required = false, label = "This field", max = MAX_TEXT } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (required && !s) throw badRequest(`${label} is required.`);
  if (s.length > max) throw badRequest(`${label} is too long.`);
  return s || null;
}

function normalizeDate(raw, { required = false, label = "Date" } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`Invalid ${label.toLowerCase()}.`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : d.toISOString().slice(0, 10);
}

// Same pattern scripts/importSltWorkbooks.js uses for text date ranges in
// the Event Date column: "Oct 17-21, 2026" / "Oct 17 - 21, 2026".
const TEXT_DATE_RANGE_RE = /^([A-Za-z]{3,})\s+(\d{1,2})\s*-\s*(\d{1,2}),\s*(\d{4})$/;

function parseTextDateRange(raw) {
  const m = TEXT_DATE_RANGE_RE.exec(String(raw).trim());
  if (!m) return null;
  const [, monthName, startDay, endDay, year] = m;
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) return null;
  const start = new Date(Number(year), monthIndex, Number(startDay));
  const end = new Date(Number(year), monthIndex, Number(endDay));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Accepts a real date ("2026-08-19") or a text range ("Oct 17-21, 2026"),
// exactly like the Event Date column in the source sheet. Returns the raw
// text as typed (event_date_raw) plus, when parseable, start_date/end_date
// for sorting and the Days Until Event calculation.
function normalizeEventDate(raw, { required = false } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) {
    if (required) throw badRequest("Event date is required.");
    return { raw: null, startDate: null, endDate: null, isTextDateRange: 0 };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { raw: s, startDate: s, endDate: s, isTextDateRange: 0 };
  }
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime()) && !TEXT_DATE_RANGE_RE.test(s)) {
    const iso = asDate.toISOString().slice(0, 10);
    return { raw: s, startDate: iso, endDate: iso, isTextDateRange: 0 };
  }
  const range = parseTextDateRange(s);
  if (range) {
    return { raw: s, startDate: range.start, endDate: range.end, isTextDateRange: 1 };
  }
  // Doesn't match a known pattern — keep the text as typed (same as the
  // importer does), just without a computable start/end date.
  return { raw: s, startDate: null, endDate: null, isTextDateRange: 1 };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

function mapCalendarEvent(row) {
  if (!row) return row;
  const today = todayIso();
  return {
    id: Number(row.id),
    event_id: row.event_id,
    month: row.month_raw,
    event_date: row.event_date_raw,
    is_text_date_range: !!row.is_text_date_range,
    start_date: row.start_date,
    end_date: row.end_date,
    event_title: row.event_title,
    category: row.category,
    executives: row.executives,
    owner_lead: row.owner_lead,
    executive_action_required: row.executive_action_required,
    prep_start_date: row.prep_start_date,
    prep_deadline: row.prep_deadline,
    materials_needed: row.materials_needed,
    notes: row.notes,
    days_until_event: daysBetween(today, row.start_date),
    prep_days_left: daysBetween(today, row.prep_deadline),
    archived: !!row.archived,
    created_by: row.created_by != null ? Number(row.created_by) : null,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// LEFT JOIN (not an inner join) so an event survives a creator account
// being deleted (created_by is ON DELETE SET NULL) — it just stops showing
// a "Created by" name.
const SELECT_CALENDAR_SQL = `
  SELECT c.*, u.name AS created_by_name
  FROM slt_calendar c
  LEFT JOIN users u ON u.id = c.created_by
`;

async function listCalendar(query = {}) {
  const archived = query.archived === "true" || query.archived === true ? 1 : 0;
  const rows = await db
    .prepare(
      `${SELECT_CALENDAR_SQL}
       WHERE c.archived = ?
       ORDER BY (c.start_date IS NULL), c.start_date ASC, c.id ASC`
    )
    .all(archived);
  return (rows || []).map(mapCalendarEvent);
}

async function getCalendarEventById(id) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || eventId < 1) throw badRequest("Invalid calendar event id.");
  const row = await db.prepare(`${SELECT_CALENDAR_SQL} WHERE c.id = ?`).get(eventId);
  if (!row) throw notFound("Calendar event not found.");
  return mapCalendarEvent(row);
}

// Emails everyone with Master Calendar access (CALENDAR_ACCESS_GRANTS)
// about a newly created event, except the person who just created it —
// they obviously already know. Sent as one email per recipient (not a
// single multi-address "to") so each person is addressed by name; a
// failed send to one recipient doesn't stop the others
// (Promise.allSettled). The caller wraps this whole call in try/catch so
// a notification failure (bad SMTP config, a DB hiccup, etc.) never
// blocks event creation itself from succeeding.
async function notifyCalendarAccessUsersOfNewEvent(creatorUser, eventRow) {
  const rows = await db
    .prepare("SELECT id, name, email, role, admin_grants FROM users WHERE email IS NOT NULL AND TRIM(email) <> ''")
    .all();

  // Logged unconditionally (not just on failure) so a "why didn't X get
  // notified" question can be answered straight from the server console —
  // every user with an email on file, whether they qualified, and why not
  // if they didn't (wrong role/grants, or they're the creator).
  const evaluated = (rows || []).map((r) => {
    const isCreator = Number(r.id) === Number(creatorUser?.id);
    const fauxUser = { role: r.role, adminGrants: parseAdminGrantsColumn(r.admin_grants) };
    const hasGrant = hasAnyAdminGrant(fauxUser, CALENDAR_ACCESS_GRANTS);
    return { row: r, qualifies: !isCreator && hasGrant, isCreator, hasGrant };
  });

  console.log(
    `[SLT_CALENDAR] New-event notification check for event #${eventRow.id} ("${eventRow.event_title}"), ` +
      `created by ${creatorUser?.name || eventRow.created_by_name || `user #${creatorUser?.id}`}:`
  );
  for (const c of evaluated) {
    const reason = c.isCreator ? "creator — skipped" : c.hasGrant ? "has cfo/slt_view/slt_edit — notifying" : "no cfo/slt_view/slt_edit grant — skipped";
    console.log(
      `[SLT_CALENDAR]   ${c.row.name || c.row.email} <${c.row.email}> role=${c.row.role} admin_grants=${c.row.admin_grants || "(none)"} → ${reason}`
    );
  }

  const recipients = evaluated.filter((c) => c.qualifies).map((c) => c.row);

  if (recipients.length === 0) {
    console.warn(
      "[SLT_CALENDAR] No recipients qualify — nobody besides the creator holds the cfo, slt_view, or slt_edit grant " +
        "(or a full Admin role with no grant restrictions). Add one of those grants to whoever should be notified, " +
        "under Manage Users."
    );
    return { notified: 0 };
  }

  const eventDateLabel = eventRow.is_text_date_range
    ? eventRow.event_date
    : eventRow.end_date && eventRow.end_date !== eventRow.start_date
      ? `${eventRow.start_date} – ${eventRow.end_date}`
      : eventRow.start_date || eventRow.event_date;

  const results = await Promise.allSettled(
    recipients.map((r) =>
      email
        .sendCalendarEventCreatedEmail({
          to: r.email,
          recipientName: r.name,
          creatorName: creatorUser?.name || eventRow.created_by_name,
          eventTitle: eventRow.event_title,
          eventDateLabel,
          category: eventRow.category,
          executives: eventRow.executives,
          ownerLead: eventRow.owner_lead,
          executiveActionRequired: eventRow.executive_action_required,
          eventId: eventRow.id,
        })
        .then((out) => ({ email: r.email, out }))
    )
  );

  let failedCount = 0;
  const failureReasons = []; // surfaced all the way up to the create-event API response — see createCalendarEvent
  results.forEach((r, i) => {
    const to = recipients[i].email;
    if (r.status === "rejected") {
      failedCount += 1;
      const reason = r.reason?.message || String(r.reason);
      failureReasons.push(`${to}: ${reason}`);
      console.error(`[SLT_CALENDAR] New-event email to ${to} failed:`, reason);
    } else if (r.value?.out?.skipped) {
      // sendMail() returns { skipped: true, reason } instead of throwing
      // when SMTP isn't configured — this is the other common silent-looking
      // failure mode, now visible here too.
      failedCount += 1;
      const reason = r.value.out.reason || "(no reason given)";
      failureReasons.push(`${to}: ${reason}`);
      console.warn(`[SLT_CALENDAR] New-event email to ${to} was skipped:`, reason);
    } else {
      console.log(`[SLT_CALENDAR] New-event email sent to ${to}`);
    }
  });

  return { notified: recipients.length, failed: failedCount, failureReasons };
}

async function createCalendarEvent(userId, body) {
  const month = normalizeText(body?.month, { label: "Month", max: 40 });
  const eventDate = normalizeEventDate(body?.event_date, { required: true });
  const eventTitle = normalizeText(body?.event_title, { required: true, label: "Event / Deadline" });
  const category = normalizeText(body?.category, { label: "Category", max: 120 });
  const executives = normalizeText(body?.executives, { label: "Executive(s)", max: 200 });
  const ownerLead = normalizeText(body?.owner_lead, { label: "Owner / Lead" });
  const executiveActionRequired = normalizeText(body?.executive_action_required, { label: "Executive Action Required" });
  const prepStartDate = normalizeDate(body?.prep_start_date, { label: "Prep start date" });
  const prepDeadline = normalizeDate(body?.prep_deadline, { label: "Prep deadline" });
  const materialsNeeded = normalizeText(body?.materials_needed, { label: "Materials needed" });
  const notes = normalizeText(body?.notes, { label: "Notes" });

  const eventId = `EVT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const immutableKey = crypto.randomBytes(8).toString("hex");

  const fields = {
    event_id: eventId,
    month_raw: month,
    event_date_raw: eventDate.raw,
    is_text_date_range: eventDate.isTextDateRange,
    start_date: eventDate.startDate,
    end_date: eventDate.endDate,
    event_title: eventTitle,
    category,
    executives,
    owner_lead: ownerLead,
    executive_action_required: executiveActionRequired,
    prep_start_date: prepStartDate,
    prep_deadline: prepDeadline,
    materials_needed: materialsNeeded,
    notes,
    immutable_key: immutableKey,
  };

  const cols = Object.keys(fields);
  const placeholders = cols.map(() => "?").join(", ");
  const result = await db
    .prepare(`INSERT INTO slt_calendar (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
    .run(...cols.map((c) => fields[c]), userId);

  // Fire-and-forget: logAudit() already never throws into its caller (see
  // sltAudit.service.js), so there was never a correctness reason to await
  // it — only a speed cost, one more network round trip to the remote
  // Postgres host before the user sees "saved." Not awaiting it lets it run
  // concurrently with the SELECT below instead of serially before it.
  void audit.logAudit({ entityType: "calendar", entityId: result.lastInsertRowid, action: "create", userId });

  const row = await db.prepare(`${SELECT_CALENDAR_SQL} WHERE c.id = ?`).get(result.lastInsertRowid);
  const mapped = mapCalendarEvent(row);

  // Also fire-and-forget: sending the notification emails (an SMTP round
  // trip per recipient, to Outlook — multiple seconds, more if the
  // credentials are failing and it's retrying/timing out) used to block
  // this response, making "Add event" feel slow. Event creation itself
  // always succeeds regardless of what happens here. The frontend gets an
  // immediate "sending" status instead of the final notified/failed counts
  // — the full per-recipient result (and any failure reasons) still lands
  // in the server console via notifyCalendarAccessUsersOfNewEvent's own
  // logging, same as before.
  void notifyCalendarAccessUsersOfNewEvent({ id: userId, name: mapped.created_by_name }, mapped).catch((err) => {
    console.error("[SLT_CALENDAR] New-event notification failed:", err?.message || err);
  });

  return { ...mapped, notification: { status: "sending" } };
}

async function updateCalendarEvent(userId, id, body) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || eventId < 1) throw badRequest("Invalid calendar event id.");
  const existing = await db.prepare("SELECT * FROM slt_calendar WHERE id = ?").get(eventId);
  if (!existing) throw notFound("Calendar event not found.");

  const month = body?.month !== undefined ? normalizeText(body.month, { label: "Month", max: 40 }) : existing.month_raw;
  const eventDate =
    body?.event_date !== undefined
      ? normalizeEventDate(body.event_date, { required: true })
      : {
          raw: existing.event_date_raw,
          startDate: existing.start_date,
          endDate: existing.end_date,
          isTextDateRange: existing.is_text_date_range,
        };
  const eventTitle =
    body?.event_title !== undefined
      ? normalizeText(body.event_title, { required: true, label: "Event / Deadline" })
      : existing.event_title;
  const category = body?.category !== undefined ? normalizeText(body.category, { label: "Category", max: 120 }) : existing.category;
  const executives =
    body?.executives !== undefined ? normalizeText(body.executives, { label: "Executive(s)", max: 200 }) : existing.executives;
  const ownerLead = body?.owner_lead !== undefined ? normalizeText(body.owner_lead, { label: "Owner / Lead" }) : existing.owner_lead;
  const executiveActionRequired =
    body?.executive_action_required !== undefined
      ? normalizeText(body.executive_action_required, { label: "Executive Action Required" })
      : existing.executive_action_required;
  const prepStartDate =
    body?.prep_start_date !== undefined ? normalizeDate(body.prep_start_date, { label: "Prep start date" }) : existing.prep_start_date;
  const prepDeadline =
    body?.prep_deadline !== undefined ? normalizeDate(body.prep_deadline, { label: "Prep deadline" }) : existing.prep_deadline;
  const materialsNeeded =
    body?.materials_needed !== undefined ? normalizeText(body.materials_needed, { label: "Materials needed" }) : existing.materials_needed;
  const notes = body?.notes !== undefined ? normalizeText(body.notes, { label: "Notes" }) : existing.notes;

  await db
    .prepare(
      `UPDATE slt_calendar SET
        month_raw = ?, event_date_raw = ?, is_text_date_range = ?, start_date = ?, end_date = ?,
        event_title = ?, category = ?, executives = ?, owner_lead = ?, executive_action_required = ?,
        prep_start_date = ?, prep_deadline = ?, materials_needed = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      month,
      eventDate.raw,
      eventDate.isTextDateRange,
      eventDate.startDate,
      eventDate.endDate,
      eventTitle,
      category,
      executives,
      ownerLead,
      executiveActionRequired,
      prepStartDate,
      prepDeadline,
      materialsNeeded,
      notes,
      eventId
    );

  await audit.logAudit({ entityType: "calendar", entityId: eventId, action: "update", userId });

  const row = await db.prepare(`${SELECT_CALENDAR_SQL} WHERE c.id = ?`).get(eventId);
  return mapCalendarEvent(row);
}

// True, permanent delete — by explicit request, unlike the archive-only
// pattern used elsewhere in SLT Tracker (Action Register, Decisions, 90-Day
// Commitments). The row is gone from the database once this returns; there
// is no restore. The route layer (cfo.routes.js) is what authorizes WHO may
// call this: the event's own creator, anyone with a full slt_edit grant, or
// anyone an admin delegated "edit on behalf of" that creator to — this
// function itself just performs the delete once that's already decided.
// The audit-log row (entityType "calendar", action "delete") is the only
// surviving record that the event ever existed.
async function deleteCalendarEvent(userId, id) {
  const eventId = Number(id);
  if (!Number.isFinite(eventId) || eventId < 1) throw badRequest("Invalid calendar event id.");
  const existing = await db.prepare("SELECT id, event_title FROM slt_calendar WHERE id = ?").get(eventId);
  if (!existing) throw notFound("Calendar event not found.");
  // Fire-and-forget, same reasoning as createCalendarEvent above — logAudit()
  // never throws into its caller, so awaiting it only ever cost a network
  // round trip, not correctness. Runs concurrently with the DELETE instead
  // of serially before it.
  void audit.logAudit({
    entityType: "calendar",
    entityId: eventId,
    action: "delete",
    newValue: existing.event_title || null,
    userId,
  });
  await db.prepare("DELETE FROM slt_calendar WHERE id = ?").run(eventId);
  return { ok: true, id: eventId };
}

module.exports = {
  listCalendar,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};
