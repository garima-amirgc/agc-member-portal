"use strict";

/**
 * ADP time-off EVENT notifications — pending/approved/cancelled, as they
 * happen
 * ────────────────────────────────────────────────────────────────────────
 * adpTimeOffSync.service.js polls the Time Off Requests API on a schedule,
 * but that API only ever returns APPROVED requests (see its own header
 * comment) — there is no way to see a request the moment it's submitted.
 * Garima asked for exactly that: a manager should see "someone just
 * requested time off" show up on the Team page, badge and all, the same
 * way IT Tickets does, without having to go check ADP.
 *
 * ADP's answer to that is a separate system: the Event Notification Queue
 * (GET /core/v1/event-notification-messages). ADP support confirmed
 * (2026-09-23) it's now enabled for our client ID, and described the model
 * by email:
 *
 *   1. Retrieve a notification from the queue.
 *   2. Store or process it within your system.
 *   3. Delete the notification from the queue.
 *   4. Retrieve the next available notification.
 *
 * i.e. strictly FIFO, one message at a time, bulk retrieval not supported,
 * and ADP recommends polling "on a scheduled basis with at least a maximum
 * of one hour" between checks (we default to every 15 minutes — comfortably
 * under that). Unprocessed messages sit in the queue for 30 days before ADP
 * purges them, and a message we fail to delete will simply come back on the
 * next poll — so this is written to tolerate re-seeing the same eventID
 * (the DB insert below is dedup-safe on adp_event_id) and to only delete a
 * message from ADP's queue once we've fully processed it locally.
 *
 * IMPORTANT — this is intentionally defensive. The one concrete response
 * we've actually seen from our own tenant was an EMPTY queue (raw body ""),
 * so the event shape below (eventNameCode, originator.associateOID, etc.)
 * is assembled from ADP's general event-notification documentation, not a
 * real time-off event we've seen. Once Garima has a team member submit a
 * real ADP request after this deploys, check the Render logs for the
 * "[ADP Time Off Events] raw event:" line this file prints for every event
 * it sees — that's the fastest way to confirm (or correct) the field
 * mapping below against a real payload.
 *
 * Optional env vars:
 *   ADP_TIMEOFF_EVENTS_POLL_MINUTES — how often to poll (default: 15)
 */

const { db } = require("../config/db");
const adp = require("./adp.service");
const { sendManagerTimeOffRequestEmail } = require("./email.service");

const POLL_INTERVAL_MS = (() => {
  const mins = parseFloat(process.env.ADP_TIMEOFF_EVENTS_POLL_MINUTES);
  return (Number.isFinite(mins) && mins > 0 ? mins : 15) * 60 * 1000;
})();

let _timer = null;
let _running = false;
let _lastPoll = null; // { at, seen, inserted, failed } | null before the first poll

function isPollRunning() {
  return _running;
}

function getLastPollStats() {
  return _lastPoll;
}

// ADP's event-type subscriptions are named by a scenario letter/code — the
// exact codeValue text ADP sends isn't confirmed yet (see file header), so
// this matches loosely against whatever text shows up rather than a single
// hardcoded string, and falls back to "other" instead of throwing.
function classifyEventKind(codeValue) {
  const v = String(codeValue || "").toLowerCase();
  if (!v) return "other";
  if (v.includes("cancel") || v === "c") return "cancelled";
  if (v.includes("approv") || v === "a") return "approved";
  if (v.includes("pend") || v.includes("progress") || v === "p" || v === "i") return "pending";
  if (v.includes("deny") || v.includes("denied") || v.includes("reject")) return "other";
  return "other";
}

/**
 * Normalizes whatever adpGet() hands back for the event-notification-messages
 * endpoint into a plain array. In practice we've seen a literal empty string
 * body for an empty queue; the documented shape is `{ events: [...] }`; and
 * some ADP endpoints return a bare array directly. Handle all three rather
 * than assuming one.
 */
function extractEvents(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.events)) return raw.events;
  return [];
}

function eventId(evt) {
  return evt?.eventID || evt?.eventId || evt?.id || null;
}

function associateOidFromEvent(evt) {
  return evt?.originator?.associateOID || evt?.data?.associateOID || evt?.associateOID || null;
}

async function findEmployeeByAssociateOid(oid) {
  if (!oid) return null;
  return db
    .prepare("SELECT id, name, email, manager_id, adp_associate_oid FROM users WHERE adp_associate_oid = ?")
    .get(oid);
}

/**
 * Processes one event end-to-end: resolve the employee/manager, record it
 * (dedup-safe on adp_event_id), best-effort email the manager, then
 * acknowledge (delete) the message from ADP's queue. Only ever throws on a
 * failure to DELETE from ADP — a local DB/email hiccup is logged and
 * swallowed so one bad row can't wedge the whole poll or cause us to
 * re-process (and re-email) the same event forever without ADP ever
 * clearing it.
 */
async function processOneEvent(evt) {
  const id = eventId(evt);
  console.log("[ADP Time Off Events] raw event:", JSON.stringify(evt));

  if (!id) {
    console.warn("[ADP Time Off Events] Event has no eventID — skipping, leaving it in ADP's queue.");
    return { inserted: false };
  }

  try {
    const oid = associateOidFromEvent(evt);
    const employee = await findEmployeeByAssociateOid(oid);

    if (!employee) {
      console.warn(`[ADP Time Off Events] No local user matches ADP associateOID ${oid || "(none)"} — event ${id} skipped.`);
    } else if (!employee.manager_id) {
      console.warn(`[ADP Time Off Events] ${employee.name} (user ${employee.id}) has no manager on file — event ${id} skipped.`);
    } else {
      const codeValue = evt?.eventNameCode?.codeValue || evt?.eventNameCode || null;
      const eventKind = classifyEventKind(codeValue);
      const policyName = evt?.data?.policyName || evt?.policyName || null;
      const startDate = evt?.data?.startDate || evt?.startDate || null;
      const endDate = evt?.data?.endDate || evt?.endDate || null;

      const existing = await db
        .prepare("SELECT id FROM manager_timeoff_notifications WHERE adp_event_id = ?")
        .get(id);

      if (!existing) {
        await db
          .prepare(
            `INSERT INTO manager_timeoff_notifications
              (manager_id, employee_id, adp_event_id, event_kind, policy_name, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
          )
          .run(employee.manager_id, employee.id, id, eventKind, policyName, startDate, endDate);

        const manager = await db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(employee.manager_id);
        void sendManagerTimeOffRequestEmail({
          managerEmail: manager?.email,
          managerName: manager?.name,
          employeeName: employee.name || "A team member",
          eventKind,
          policyName,
          startDate,
          endDate,
        })
          .then((r) => {
            if (r?.sent) console.log(`[ADP Time Off Events] Notified manager ${manager?.email} of event ${id}`);
          })
          .catch((err) => {
            console.error(`[ADP Time Off Events] Failed to email manager for event ${id}:`, err.message);
          });
      }
    }
  } catch (e) {
    // Local processing failure — log it but still fall through to delete
    // the message below, matching ADP's documented FIFO contract. Leaving
    // a message stuck in the queue (per ADP support) can block delivery of
    // every event behind it, which is worse than losing one notification.
    console.error(`[ADP Time Off Events] Failed to process event ${id} locally:`, e.message || e);
  }

  try {
    await adp.adpDelete(`/core/v1/event-notification-messages/${encodeURIComponent(id)}`);
  } catch (e) {
    // A 404 here just means it's already gone (e.g. a prior run deleted it
    // but crashed before returning) — nothing to retry. Anything else, log
    // and move on; it'll come back on the next poll since ADP never got
    // the delete, and our dedup-by-adp_event_id above makes that safe.
    if (e?.statusCode !== 404) {
      console.error(`[ADP Time Off Events] Failed to delete event ${id} from ADP's queue:`, e.message || e);
    }
  }

  return { inserted: true };
}

async function pollTimeOffEvents() {
  if (_running) return { skipped: true, reason: "already running" };
  if (!adp.isConfigured()) return { skipped: true, reason: "ADP not configured" };

  _running = true;
  const started = Date.now();

  try {
    // FIFO, one at a time, per ADP support's email — loop until the queue
    // reports empty rather than trusting a single call to drain it.
    let seen = 0;
    let inserted = 0;
    let failed = 0;
    const MAX_PER_POLL = 200; // safety cap so a stuck/huge queue can't run forever in one cycle

    while (seen < MAX_PER_POLL) {
      let raw;
      try {
        raw = await adp.adpGet("/core/v1/event-notification-messages");
      } catch (e) {
        console.error("[ADP Time Off Events] Failed to fetch from queue:", e.message || e);
        failed++;
        break;
      }

      const events = extractEvents(raw);
      if (events.length === 0) break;

      for (const evt of events) {
        seen++;
        try {
          const r = await processOneEvent(evt);
          if (r.inserted) inserted++;
        } catch (e) {
          failed++;
          console.error("[ADP Time Off Events] Unexpected error processing event:", e.message || e);
        }
      }
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (seen > 0) {
      console.log(`[ADP Time Off Events] Poll done — ${seen} event(s) seen, ${inserted} recorded, ${failed} failed, in ${secs}s`);
    }
    _lastPoll = { at: new Date().toISOString(), seen, inserted, failed };
    return _lastPoll;
  } finally {
    _running = false;
  }
}

function startPolling() {
  if (_timer) return;
  setTimeout(() => {
    pollTimeOffEvents();
    _timer = setInterval(pollTimeOffEvents, POLL_INTERVAL_MS);
  }, 60_000); // stagger after the other ADP background jobs' own startup delays
  const mins = (POLL_INTERVAL_MS / 60_000).toFixed(0);
  console.log(`[ADP Time Off Events] Scheduled every ${mins}m (first poll in 60s)`);
}

function stopPolling() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = {
  startPolling,
  stopPolling,
  pollTimeOffEvents,
  isPollRunning,
  getLastPollStats,
};
