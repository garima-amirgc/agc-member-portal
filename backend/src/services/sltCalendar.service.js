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
 * scripts/importSltWorkbooks.js). Field set mirrors exactly what the
 * Add/Edit event form manages (CALENDAR_FIELDS in SltTrackerV2.jsx): Event
 * Date, Event / Deadline, Category, Executive(s), Owner / Lead, Executive
 * Action Required, plus the computed Days Until Event — see
 * mapCalendarEvent() below. The source workbook's sheet originally also had
 * Month, Prep Start Date, Prep Deadline, Materials Needed, and Notes
 * columns; those were never exposed on the form, so by explicit request
 * ("remove the fields permanently that are not in use") they were dropped
 * from the table entirely rather than kept as unused dead columns — see the
 * slt_calendar migration in config/database/postgres.js / sqlite.js. The
 * table also still has a few other extra columns (start_time/end_time/
 * status/risk/last_reviewed_date/digital_calendar_eligible/
 * calendar_entry_title/deferred_return_date/prep_after_event_flag) left
 * over from an earlier, broader design that were never part of the source
 * sheet at all; this service doesn't read or write those either.
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
    event_date: row.event_date_raw,
    is_text_date_range: !!row.is_text_date_range,
    start_date: row.start_date,
    end_date: row.end_date,
    event_title: row.event_title,
    category: row.category,
    executives: row.executives,
    owner_lead: row.owner_lead,
    executive_action_required: row.executive_action_required,
    days_until_event: daysBetween(today, row.start_date),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Outlook/Microsoft 365 caps how many SMTP connections the sending mailbox
// may have open at once. Firing every recipient's send at the same time
// (the old Promise.allSettled behavior below) opened one connection per
// recipient simultaneously and routinely tripped that cap — only the
// first handful got through before the rest came back "432 4.3.2
// Concurrent connections limit exceeded." Sending one at a time, with a
// short pause between each and a few retries specifically for that error,
// keeps every send within the limit instead of racing the others for it.
const EMAIL_SEND_GAP_MS = 400;
const MAX_THROTTLE_RETRIES = 4;

function isConcurrentConnectionsError(err) {
  const msg = String(err?.message || err || "");
  return /432/.test(msg) && /concurrent connections/i.test(msg);
}

// Generic retry wrapper — takes a zero-arg send function so both the
// new-event notification below and the digest-subscription sender further
// down can share it instead of each reimplementing the same backoff loop.
async function sendEmailWithThrottleRetry(sendFn, recipientLabel) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendFn();
    } catch (err) {
      if (isConcurrentConnectionsError(err) && attempt < MAX_THROTTLE_RETRIES) {
        const backoff = 1500 * (attempt + 1);
        console.warn(
          `[SLT_CALENDAR] Outlook throttled the send to ${recipientLabel} — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_THROTTLE_RETRIES})`
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

// Emails everyone with Master Calendar access (CALENDAR_ACCESS_GRANTS)
// about a newly created event, except the person who just created it —
// they obviously already know. Sent as one email per recipient (not a
// single multi-address "to") so each person is addressed by name, and
// sent ONE AT A TIME (not concurrently — see EMAIL_SEND_GAP_MS/
// sendEmailWithThrottleRetry above) so a large SLT distribution
// list never trips Outlook's concurrent-connection throttle. A failed
// send to one recipient (after retries) doesn't stop the others — each
// result is recorded individually in the same shape Promise.allSettled
// would have produced, so the summary/logging below didn't need to
// change. The caller wraps this whole call in try/catch so a notification
// failure (bad SMTP config, a DB hiccup, etc.) never blocks event creation
// itself from succeeding.
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

  // Same { status, value: { email, out } } / { status, reason } shape
  // Promise.allSettled would have produced, built sequentially instead —
  // see the comment above sendEmailWithThrottleRetry for why.
  const results = [];
  for (let i = 0; i < recipients.length; i += 1) {
    const r = recipients[i];
    try {
      const out = await sendEmailWithThrottleRetry(
        () =>
          email.sendCalendarEventCreatedEmail({
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
          }),
        r.email
      );
      results.push({ status: "fulfilled", value: { email: r.email, out } });
    } catch (err) {
      results.push({ status: "rejected", reason: err });
    }
    // No gap needed after the very last send.
    if (i < recipients.length - 1) await sleep(EMAIL_SEND_GAP_MS);
  }

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
  const eventDate = normalizeEventDate(body?.event_date, { required: true });
  const eventTitle = normalizeText(body?.event_title, { required: true, label: "Event / Deadline" });
  const category = normalizeText(body?.category, { label: "Category", max: 120 });
  const executives = normalizeText(body?.executives, { label: "Executive(s)", max: 200 });
  const ownerLead = normalizeText(body?.owner_lead, { label: "Owner / Lead" });
  const executiveActionRequired = normalizeText(body?.executive_action_required, { label: "Executive Action Required" });

  const eventId = `EVT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const immutableKey = crypto.randomBytes(8).toString("hex");

  const fields = {
    event_id: eventId,
    event_date_raw: eventDate.raw,
    is_text_date_range: eventDate.isTextDateRange,
    start_date: eventDate.startDate,
    end_date: eventDate.endDate,
    event_title: eventTitle,
    category,
    executives,
    owner_lead: ownerLead,
    executive_action_required: executiveActionRequired,
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
  await db
    .prepare(
      `UPDATE slt_calendar SET
        event_date_raw = ?, is_text_date_range = ?, start_date = ?, end_date = ?,
        event_title = ?, category = ?, executives = ?, owner_lead = ?, executive_action_required = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      eventDate.raw,
      eventDate.isTextDateRange,
      eventDate.startDate,
      eventDate.endDate,
      eventTitle,
      category,
      executives,
      ownerLead,
      executiveActionRequired,
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

// ── Export / Import (offline continuity) ────────────────────────────────
// If the server/portal is down, the team needs to be able to keep working
// from a spreadsheet, then bring those changes back in once it's back up.
// Export produces a workbook with exactly the fields the portal itself
// manages — the same ones on the Add/Edit event form (see CALENDAR_FIELDS
// in SltTrackerV2.jsx) — nothing more. Month, Prep Start Date, Prep
// Deadline, Materials Needed, and Notes used to also be exported (and were
// even still in the underlying slt_calendar table) purely as leftovers
// from the original one-time source-workbook import; by explicit request
// ("remove the fields permanently that are not in use") those columns have
// been dropped from the table entirely — see the slt_calendar migration in
// config/database/postgres.js / sqlite.js — since nothing in the portal
// ever reads, writes, or displays them. Re-importing matches each row back
// to its existing event by (title, event date) — the same identity
// scripts/importMasterCalendarData.js's immutable_key scheme is built
// on — so editing a row offline and re-importing updates that row instead
// of creating a duplicate; a row whose title+date don't match anything
// already here is added as new.
const EXPORT_HEADERS = ["Event Date", "Event / Deadline", "Category", "Executive(s)", "Owner / Lead", "Executive Action Required"];

function requireExcelJs() {
  try {
    return require("exceljs");
  } catch (e) {
    const err = new Error("Excel export/import is not available on this server.");
    err.statusCode = 500;
    throw err;
  }
}

// Mirrors scripts/importMasterCalendarData.js's isoDate-at-noon-UTC choice
// so a plain ISO date never visually shifts a day when Excel renders it
// under a US-West-of-UTC timezone.
function isoToExcelDate(iso) {
  return iso ? new Date(`${iso}T12:00:00Z`) : null;
}

async function exportCalendarWorkbookBuffer() {
  const ExcelJS = requireExcelJs();
  const events = await listCalendar({ archived: false });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGC University LMS";
  const sheet = workbook.addWorksheet("Master Calendar");

  // Row 1 is a plain instructional note — the header row the
  // import/import-from-UI logic actually reads is row 2, same as the
  // source workbook's own layout, so this row is free to use.
  sheet.addRow([`Master Calendar — exported ${todayIso()}.`]);
  sheet.addRow(EXPORT_HEADERS);
  sheet.getRow(2).font = { bold: true };

  for (const ev of events) {
    const eventDateCell = ev.is_text_date_range ? ev.event_date : isoToExcelDate(ev.start_date) || ev.event_date || null;
    sheet.addRow([eventDateCell, ev.event_title, ev.category, ev.executives, ev.owner_lead, ev.executive_action_required]);
  }

  sheet.getColumn(1).numFmt = "mm/dd/yyyy";
  EXPORT_HEADERS.forEach((h, i) => {
    sheet.getColumn(i + 1).width = Math.min(42, Math.max(12, String(h).length + 4));
  });

  return workbook.xlsx.writeBuffer();
}

function isBlankCell(v) {
  return v == null || String(v).trim() === "";
}

function textOrNullCell(v) {
  return isBlankCell(v) ? null : String(v).trim();
}

function dateCellToIso(v) {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;
}

function cellDisplayValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.error) return `#${v.error}#`;
    if (v.result !== undefined) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return v.text;
    return null;
  }
  return v;
}

function headerMapFor(worksheet, headerRow) {
  const map = {};
  const row = worksheet.getRow(headerRow);
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const v = cell.value;
    if (v != null && String(v).trim() !== "") map[String(v).trim()] = colNumber;
  });
  return map;
}

function readRowValues(worksheet, rowNum, headerMapObj) {
  const row = worksheet.getRow(rowNum);
  const values = {};
  for (const [header, col] of Object.entries(headerMapObj)) {
    values[header] = cellDisplayValue(row.getCell(col));
  }
  return values;
}

// Same date-cell handling as scripts/importMasterCalendarData.js: a real
// Excel date → a single-day start/end; free text matching "Oct 17-21,
// 2026" → a parsed range; anything else is kept as typed, with no
// computable start/end (so it still sorts/displays, just without a "Days
// Until Event" figure).
function parseCalendarDateCell(eventDateRaw) {
  if (eventDateRaw instanceof Date && !Number.isNaN(eventDateRaw.getTime())) {
    const iso = eventDateRaw.toISOString().slice(0, 10);
    return { startDate: iso, endDate: iso, isTextDateRange: 0 };
  }
  if (!isBlankCell(eventDateRaw)) {
    const range = parseTextDateRange(eventDateRaw);
    if (range) return { startDate: range.start, endDate: range.end, isTextDateRange: 1 };
    return { startDate: null, endDate: null, isTextDateRange: 1 };
  }
  return { startDate: null, endDate: null, isTextDateRange: 0 };
}

const IMPORT_HEADER_SCAN_ROWS = 10;
const MAX_IMPORT_DETAILS = 300;

// Export writes a note in row 1 and the real headers in row 2, but a user
// building/editing the sheet by hand (e.g. adding new rows to an exported
// file, or typing up a fresh one without that note row) may well end up
// with headers on row 1 instead — that used to get flat-out rejected
// ("missing the expected Event Date / Event / Deadline columns") even
// though the data was perfectly good, just one row off. Scanning the first
// few rows for whichever one actually has those two column names makes
// import tolerant of both layouts (and of an extra blank row, a title row,
// etc.) instead of requiring an exact row-2 match.
function findImportHeaderRow(ws) {
  const lastRow = Math.min(IMPORT_HEADER_SCAN_ROWS, ws.rowCount);
  for (let r = 1; r <= lastRow; r += 1) {
    const hm = headerMapFor(ws, r);
    if (hm["Event / Deadline"] && hm["Event Date"]) return { headerRow: r, hm };
  }
  return null;
}

// Parses an uploaded .xlsx buffer (exported by exportCalendarWorkbookBuffer
// above, or the original source workbook scripts/importMasterCalendarData.js
// reads) and upserts it into slt_calendar. Matches existing rows by (title,
// event date) — same identity the script's immutable_key is built from —
// so a row whose title+date already exist here gets its other fields
// updated in place, and a row with no match is added as new. dryRun:true
// computes and returns the same counts without writing anything, so the UI
// can show a preview before committing.
async function importCalendarFromBuffer(userId, buffer, { dryRun = false } = {}) {
  const ExcelJS = requireExcelJs();

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    throw badRequest("Could not read that file. Make sure it's a .xlsx workbook exported from (or shaped like) the Master Calendar.");
  }

  const ws = wb.getWorksheet("Master Calendar");
  if (!ws) throw badRequest('That workbook has no "Master Calendar" sheet.');

  const headerMatch = findImportHeaderRow(ws);
  if (!headerMatch) {
    throw badRequest('That sheet is missing the expected "Event Date" / "Event / Deadline" columns.');
  }
  const { headerRow, hm } = headerMatch;

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedBlank = 0;
  const details = [];

  let row = headerRow + 1;
  while (row <= ws.rowCount) {
    const values = readRowValues(ws, row, hm);
    const title = textOrNullCell(values["Event / Deadline"]);
    if (!title) {
      skippedBlank += 1;
      row += 1;
      continue;
    }

    const eventDateRaw = values["Event Date"];
    const { startDate, endDate, isTextDateRange } = parseCalendarDateCell(eventDateRaw);

    const contentFields = {
      event_date_raw: eventDateRaw instanceof Date ? dateCellToIso(eventDateRaw) : textOrNullCell(eventDateRaw),
      is_text_date_range: isTextDateRange,
      start_date: startDate,
      end_date: endDate,
      event_title: title,
      category: textOrNullCell(values["Category"]),
      executives: textOrNullCell(values["Executive(s)"]),
      owner_lead: textOrNullCell(values["Owner / Lead"]),
      executive_action_required: textOrNullCell(values["Executive Action Required"]),
    };

    // Match by title + event date, not a hidden id column — a real date
    // matches on the normalized start_date (stable across the export/
    // import round trip since both sides go through the same ISO
    // conversion), a text range matches on the exact raw text.
    const existing = isTextDateRange
      ? await db
          .prepare("SELECT * FROM slt_calendar WHERE event_title = ? AND is_text_date_range = 1 AND event_date_raw = ?")
          .get(title, contentFields.event_date_raw)
      : startDate
        ? await db
            .prepare("SELECT * FROM slt_calendar WHERE event_title = ? AND is_text_date_range = 0 AND start_date = ?")
            .get(title, startDate)
        : null;

    if (!existing) {
      const eventId = `EVT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      const immutableKey = crypto.randomBytes(8).toString("hex");
      const fields = { event_id: eventId, immutable_key: immutableKey, ...contentFields };
      if (!dryRun) {
        const cols = Object.keys(fields);
        const placeholders = cols.map(() => "?").join(", ");
        const result = await db
          .prepare(`INSERT INTO slt_calendar (${cols.join(", ")}, created_by) VALUES (${placeholders}, ?)`)
          .run(...cols.map((c) => fields[c]), userId);
        void audit.logAudit({ entityType: "calendar", entityId: result.lastInsertRowid, action: "create", userId });
      }
      inserted += 1;
      if (details.length < MAX_IMPORT_DETAILS) {
        details.push({ title, event_date: String(values["Event Date"] ?? ""), action: dryRun ? "would insert" : "inserted" });
      }
      row += 1;
      continue;
    }

    const changedCols = Object.keys(contentFields).filter((c) => String(existing[c] ?? "") !== String(contentFields[c] ?? ""));
    if (changedCols.length === 0) {
      unchanged += 1;
      row += 1;
      continue;
    }

    if (!dryRun) {
      const setClause = changedCols.map((c) => `${c} = ?`).join(", ");
      await db
        .prepare(`UPDATE slt_calendar SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .run(...changedCols.map((c) => contentFields[c]), existing.id);
      void audit.logAudit({ entityType: "calendar", entityId: existing.id, action: "update", userId });
    }
    updated += 1;
    if (details.length < MAX_IMPORT_DETAILS) {
      details.push({ title, event_date: String(values["Event Date"] ?? ""), action: dryRun ? "would update" : "updated", changed: changedCols });
    }
    row += 1;
  }

  return { dryRun: !!dryRun, inserted, updated, unchanged, skippedBlank, details };
}

// ── Subscription (scheduled digest email) ───────────────────────────────
// Admin-configured under SLT Report → Administration: an automatic email
// with the whole Master Calendar attached (the same .xlsx export above),
// sent on a schedule instead of waiting for someone to click Export. Only
// one settings row ever exists (id is always SUBSCRIPTION_ROW_ID) — this
// is one shared subscription, not per-user. checkAndRunScheduledCalendarDigest
// is the poll function; startCalendarDigestScheduler() runs it on an
// interval (wired up in server.js, same pattern as the ADP background jobs
// — see adpTimeOffEvents.service.js's startPolling for the sibling
// version of this).
const SUBSCRIPTION_ROW_ID = 1;
const VALID_FREQUENCIES = ["daily", "weekly", "monthly"];
const VALID_RECIPIENT_MODES = ["calendar_access", "custom"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultSubscriptionSettings() {
  return {
    id: SUBSCRIPTION_ROW_ID,
    enabled: false,
    frequency: "weekly",
    day_of_week: 1, // Monday
    day_of_month: 1,
    send_hour: 7,
    timezone: "America/New_York",
    recipient_mode: "calendar_access",
    recipient_emails: [],
    last_sent_period: null,
    last_sent_at: null,
    updated_by: null,
    updated_at: null,
  };
}

function mapSubscriptionRow(row) {
  if (!row) return defaultSubscriptionSettings();
  let recipientEmails = [];
  try {
    const parsed = JSON.parse(row.recipient_emails || "[]");
    if (Array.isArray(parsed)) recipientEmails = parsed.filter((e) => typeof e === "string" && e.trim());
  } catch {
    recipientEmails = [];
  }
  return {
    id: row.id,
    enabled: !!row.enabled,
    frequency: row.frequency,
    day_of_week: Number(row.day_of_week),
    day_of_month: Number(row.day_of_month),
    send_hour: Number(row.send_hour),
    timezone: row.timezone,
    recipient_mode: row.recipient_mode,
    recipient_emails: recipientEmails,
    last_sent_period: row.last_sent_period,
    last_sent_at: row.last_sent_at,
    updated_by: row.updated_by != null ? Number(row.updated_by) : null,
    updated_at: row.updated_at,
  };
}

async function getCalendarSubscriptionSettings() {
  const row = await db.prepare("SELECT * FROM slt_calendar_subscription WHERE id = ?").get(SUBSCRIPTION_ROW_ID);
  return mapSubscriptionRow(row);
}

async function updateCalendarSubscriptionSettings(userId, body) {
  const frequency = VALID_FREQUENCIES.includes(body?.frequency) ? body.frequency : "weekly";
  const dayOfWeek = Math.min(6, Math.max(0, Number.isFinite(Number(body?.day_of_week)) ? Number(body.day_of_week) : 1));
  const dayOfMonth = Math.min(28, Math.max(1, Number.isFinite(Number(body?.day_of_month)) ? Number(body.day_of_month) : 1));
  const sendHour = Math.min(23, Math.max(0, Number.isFinite(Number(body?.send_hour)) ? Number(body.send_hour) : 7));
  const timezone = normalizeText(body?.timezone, { label: "Timezone", max: 80 }) || "America/New_York";
  const recipientMode = VALID_RECIPIENT_MODES.includes(body?.recipient_mode) ? body.recipient_mode : "calendar_access";
  const enabled = body?.enabled === true || body?.enabled === 1 || body?.enabled === "1" ? 1 : 0;

  let recipientEmails = [];
  if (Array.isArray(body?.recipient_emails)) {
    recipientEmails = body.recipient_emails.map((e) => String(e || "").trim()).filter(Boolean);
  } else if (typeof body?.recipient_emails === "string") {
    recipientEmails = body.recipient_emails
      .split(/[\n,;]/)
      .map((e) => e.trim())
      .filter(Boolean);
  }
  const invalid = recipientEmails.filter((e) => !EMAIL_RE.test(e));
  if (recipientMode === "custom" && invalid.length) {
    throw badRequest(`Not a valid email address: ${invalid[0]}`);
  }
  if (recipientMode === "custom" && recipientEmails.length === 0) {
    throw badRequest("Add at least one recipient email, or switch to \"Everyone with calendar access.\"");
  }

  const existing = await db.prepare("SELECT id FROM slt_calendar_subscription WHERE id = ?").get(SUBSCRIPTION_ROW_ID);
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO slt_calendar_subscription
          (id, enabled, frequency, day_of_week, day_of_month, send_hour, timezone, recipient_mode, recipient_emails, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(SUBSCRIPTION_ROW_ID, enabled, frequency, dayOfWeek, dayOfMonth, sendHour, timezone, recipientMode, JSON.stringify(recipientEmails), userId);
  } else {
    await db
      .prepare(
        `UPDATE slt_calendar_subscription SET
          enabled = ?, frequency = ?, day_of_week = ?, day_of_month = ?, send_hour = ?, timezone = ?,
          recipient_mode = ?, recipient_emails = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(enabled, frequency, dayOfWeek, dayOfMonth, sendHour, timezone, recipientMode, JSON.stringify(recipientEmails), userId, SUBSCRIPTION_ROW_ID);
  }

  return getCalendarSubscriptionSettings();
}

async function resolveSubscriptionRecipients(settings) {
  if (settings.recipient_mode === "custom") {
    return settings.recipient_emails.map((e) => ({ email: e, name: null }));
  }
  // Same CALENDAR_ACCESS_GRANTS list the "new event" notification uses —
  // everyone who currently holds cfo/slt_view/slt_edit.
  const rows = await db
    .prepare("SELECT id, name, email, role, admin_grants FROM users WHERE email IS NOT NULL AND TRIM(email) <> ''")
    .all();
  return (rows || [])
    .filter((r) => hasAnyAdminGrant({ role: r.role, adminGrants: parseAdminGrantsColumn(r.admin_grants) }, CALENDAR_ACCESS_GRANTS))
    .map((r) => ({ email: r.email, name: r.name }));
}

function periodLabelFor(frequency) {
  if (frequency === "daily") return "daily";
  if (frequency === "monthly") return "monthly";
  return "weekly";
}

// Builds the export once and emails it to every resolved recipient, one at
// a time (same throttle-safe pattern as notifyCalendarAccessUsersOfNewEvent
// above). Used both by the real scheduled send (checkAndRunScheduledCalendarDigest)
// and by the "send a test email to myself" button (recipientsOverride +
// isTest), so a test never touches last_sent_period/goes to the real list.
async function sendCalendarDigestNow({ settings, recipientsOverride, isTest = false } = {}) {
  const effectiveSettings = settings || (await getCalendarSubscriptionSettings());
  const buf = await exportCalendarWorkbookBuffer();
  const attachmentBuffer = Buffer.from(buf);
  const attachmentFilename = `AGC_SLT_Master_Calendar_${todayIso()}.xlsx`;
  const events = await listCalendar({ archived: false });
  const eventCount = events.length;

  const recipients = recipientsOverride || (await resolveSubscriptionRecipients(effectiveSettings));

  if (!recipients.length) {
    console.warn("[SLT_CALENDAR] Subscription digest: no recipients to send to.");
    return { sent: 0, failed: 0, recipients: 0, failureReasons: [] };
  }

  let sentCount = 0;
  let failedCount = 0;
  const failureReasons = [];
  for (let i = 0; i < recipients.length; i += 1) {
    const r = recipients[i];
    try {
      const out = await sendEmailWithThrottleRetry(
        () =>
          email.sendCalendarDigestEmail({
            to: r.email,
            recipientName: r.name,
            attachmentBuffer,
            attachmentFilename,
            eventCount,
            periodLabel: periodLabelFor(effectiveSettings.frequency),
            isTest,
          }),
        r.email
      );
      if (out?.skipped) {
        failedCount += 1;
        failureReasons.push(`${r.email}: ${out.reason || "(no reason given)"}`);
        console.warn(`[SLT_CALENDAR] Digest email to ${r.email} was skipped:`, out.reason);
      } else {
        sentCount += 1;
        console.log(`[SLT_CALENDAR] Digest email sent to ${r.email}`);
      }
    } catch (err) {
      failedCount += 1;
      const reason = err?.message || String(err);
      failureReasons.push(`${r.email}: ${reason}`);
      console.error(`[SLT_CALENDAR] Digest email to ${r.email} failed:`, reason);
    }
    if (i < recipients.length - 1) await sleep(EMAIL_SEND_GAP_MS);
  }

  return { sent: sentCount, failed: failedCount, recipients: recipients.length, failureReasons };
}

async function sendCalendarDigestTestEmail(user) {
  if (!user?.email) throw badRequest("Your account has no email on file — add one under your profile first.");
  const settings = await getCalendarSubscriptionSettings();
  return sendCalendarDigestNow({ settings, recipientsOverride: [{ email: user.email, name: user.name }], isTest: true });
}

// Reads the schedule's configured timezone as plain local date/hour/weekday
// parts via Intl, instead of hand-rolling timezone-offset math — handles DST
// automatically. Falls back to server time (UTC on Render) if the stored
// timezone string is somehow invalid, rather than throwing and silently
// disabling the whole scheduler.
function localPartsInTimezone(timezone) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = fmt.formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    let hour = Number(get("hour"));
    if (hour === 24) hour = 0; // some locales render midnight as "24" instead of "00"
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      dateStr: `${year}-${month}-${day}`,
      monthStr: `${year}-${month}`,
      hour,
      weekday: weekdayMap[get("weekday")],
      dayOfMonth: Number(day),
    };
  } catch (e) {
    const now = new Date();
    return {
      dateStr: now.toISOString().slice(0, 10),
      monthStr: now.toISOString().slice(0, 7),
      hour: now.getUTCHours(),
      weekday: now.getUTCDay(),
      dayOfMonth: now.getUTCDate(),
    };
  }
}

function isDueNow(settings, parts) {
  if (!settings.enabled) return false;
  if (parts.hour < settings.send_hour) return false;
  if (settings.frequency === "daily") return true;
  if (settings.frequency === "weekly") return parts.weekday === settings.day_of_week;
  if (settings.frequency === "monthly") return parts.dayOfMonth === settings.day_of_month;
  return false;
}

function currentPeriodKey(settings, parts) {
  return settings.frequency === "monthly" ? parts.monthStr : parts.dateStr;
}

// The actual poll check — called on an interval by startCalendarDigestScheduler
// below. Compares last_sent_period against the current period (computed in
// the configured timezone) so it never double-sends within the same day/
// week/month, and only fires once the configured send hour has passed —
// not necessarily instantly at that hour, since this only runs every
// SUBSCRIPTION_POLL_INTERVAL_MS minutes.
async function checkAndRunScheduledCalendarDigest() {
  let settings;
  try {
    settings = await getCalendarSubscriptionSettings();
  } catch (e) {
    console.error("[SLT_CALENDAR] Subscription scheduler: could not load settings:", e?.message || e);
    return;
  }
  if (!settings.enabled) return;

  const parts = localPartsInTimezone(settings.timezone);
  const periodKey = currentPeriodKey(settings, parts);
  if (settings.last_sent_period === periodKey) return;
  if (!isDueNow(settings, parts)) return;

  console.log(`[SLT_CALENDAR] Subscription digest due (${settings.frequency}, period ${periodKey}) — sending…`);
  try {
    const result = await sendCalendarDigestNow({ settings });
    await db
      .prepare("UPDATE slt_calendar_subscription SET last_sent_period = ?, last_sent_at = datetime('now') WHERE id = ?")
      .run(periodKey, SUBSCRIPTION_ROW_ID);
    console.log(
      `[SLT_CALENDAR] Subscription digest sent — ${result.sent} sent, ${result.failed} failed, ${result.recipients} recipient(s).`
    );
  } catch (e) {
    console.error("[SLT_CALENDAR] Subscription digest failed:", e?.message || e);
  }
}

let _subscriptionTimer = null;
// 15 minutes is fine-grained enough that "every Monday at 7am" fires within
// 15 minutes of 7am, without polling so often it's wasteful — same interval
// class as the ADP background jobs elsewhere in this backend.
const SUBSCRIPTION_POLL_INTERVAL_MS = 15 * 60 * 1000;

function startCalendarDigestScheduler() {
  if (_subscriptionTimer) return;
  setTimeout(() => {
    checkAndRunScheduledCalendarDigest();
    _subscriptionTimer = setInterval(checkAndRunScheduledCalendarDigest, SUBSCRIPTION_POLL_INTERVAL_MS);
  }, 90_000); // stagger after the other background jobs' own startup delays
  console.log(
    `[SLT_CALENDAR] Subscription digest scheduler started — checking every ${(SUBSCRIPTION_POLL_INTERVAL_MS / 60000).toFixed(0)}m`
  );
}

module.exports = {
  listCalendar,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  exportCalendarWorkbookBuffer,
  importCalendarFromBuffer,
  getCalendarSubscriptionSettings,
  updateCalendarSubscriptionSettings,
  sendCalendarDigestTestEmail,
  startCalendarDigestScheduler,
};
