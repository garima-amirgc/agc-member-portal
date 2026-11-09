const { db } = require("../config/db");
const { ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");
const npdScoring = require("./npdScoring");
const email = require("./email.service");

// ─── New Product Development — Gate 1 (Launch Scorecard) ──────────────────
// This module used to be a 13-step approval-to-shipment workflow with Gate 1
// embedded as just its first step. By explicit request, the 13-step pipeline
// (Management Approval, PLU Creation, Spec Sheet, ... First Shipment) has
// been removed so this module is ONLY Gate 1 for now: enter a launch's
// details, the Weighted Score/Priority compute automatically, done — no
// Excel file involved. Gates 2 and 3 are not yet scoped; when they are,
// a request clearing Gate 1 is expected to be what feeds into Gate 2.
//
// Nothing from the old workflow's history was deleted — the database tables
// it used (npd_steps, npd_approvals, npd_activity_log for step events,
// npd_notifications, npd_step_assignees, npd_approver_config) are untouched
// and still hold whatever was in them. This service just no longer reads or
// writes most of them; it keeps using npd_requests (the Gate 1 data itself),
// npd_access_users, npd_delete_access_users, npd_comments, npd_attachments
// and npd_activity_log (for Gate 1's own create/update/delete events).

function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

// Full admins and anyone granted the NPD admin permission can act on
// anything in this module — same full-admin-bypass convention used
// elsewhere in the app.
function canOverride(user) {
  return hasAdminGrant(user, ADMIN_GRANT_KEYS.NPD);
}

async function hasNpdAccess(user) {
  if (!user) return false;
  if (canOverride(user)) return true;
  const row = await db.prepare("SELECT 1 FROM npd_access_users WHERE user_id = ?").get(user.id);
  return !!row;
}

// ─── Access allowlist (who can open this module at all) ────────────────────

async function listAccessUsers() {
  return db
    .prepare(
      "SELECT au.user_id, u.name, u.email FROM npd_access_users au JOIN users u ON u.id = au.user_id ORDER BY u.name ASC"
    )
    .all();
}

async function grantAccess(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid user.");
  await db.prepare("INSERT OR IGNORE INTO npd_access_users (user_id) VALUES (?)").run(n);
  return listAccessUsers();
}

async function revokeAccess(userId) {
  await db.prepare("DELETE FROM npd_access_users WHERE user_id = ?").run(Number(userId));
  return listAccessUsers();
}

// ─── Delete access allowlist ────────────────────────────────────────────────
// Deleting a request is a separate, narrower permission from general module
// access — full admins can always do it; anyone else needs to be explicitly
// listed here by an admin.

async function canDeleteRequest(user) {
  if (!user) return false;
  if (canOverride(user)) return true;
  const row = await db.prepare("SELECT 1 FROM npd_delete_access_users WHERE user_id = ?").get(user.id);
  return !!row;
}

async function listDeleteAccessUsers() {
  return db
    .prepare(
      "SELECT da.user_id, u.name, u.email FROM npd_delete_access_users da JOIN users u ON u.id = da.user_id ORDER BY u.name ASC"
    )
    .all();
}

async function grantDeleteAccess(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid user.");
  await db.prepare("INSERT OR IGNORE INTO npd_delete_access_users (user_id) VALUES (?)").run(n);
  return listDeleteAccessUsers();
}

async function revokeDeleteAccess(userId) {
  await db.prepare("DELETE FROM npd_delete_access_users WHERE user_id = ?").run(Number(userId));
  return listDeleteAccessUsers();
}

// ─── SLT approver roster (who CAN be picked, not who module access goes to) ─
// Admin-managed list of people selectable as an SLT approver when a request
// is submitted for review. Being on this list does not by itself grant NPD
// module access — it only makes someone choosable in the submit-for-review
// picker. Same shape/pattern as the access/delete-access allowlists above.

async function listSltUsers() {
  return db
    .prepare(
      "SELECT s.user_id, u.name, u.email FROM npd_slt_users s JOIN users u ON u.id = s.user_id ORDER BY u.name ASC"
    )
    .all();
}

async function addSltUser(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, "Invalid user.");
  await db.prepare("INSERT OR IGNORE INTO npd_slt_users (user_id) VALUES (?)").run(n);
  return listSltUsers();
}

async function removeSltUser(userId) {
  await db.prepare("DELETE FROM npd_slt_users WHERE user_id = ?").run(Number(userId));
  return listSltUsers();
}

// ─── SLT review (submit / decide) ──────────────────────────────────────────
// Design, from the explicit request this was built to: the requester picks
// one or more people from the SLT roster above and sends the request to
// them; ANY ONE of the people it was sent to approving, rejecting, or
// putting it on hold settles it — first response wins, this is not a
// unanimous vote. Approved is the signal Gate 2 (once built) will key off
// of; for now it just shows as "Gate 1 Approved — awaiting Gate 2".

const DECISION_LABELS = {
  approved: "Approved",
  rejected: "Rejected",
  hold: "Hold — Need More Details",
};

async function submitForReview({ requestId, user, approverUserIds }) {
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ? AND deleted_at IS NULL").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (request.weighted_score === null || request.weighted_score === undefined) {
    throw httpError(400, "Fill in all 8 scorecard metrics before submitting for SLT review.");
  }
  const ids = Array.from(
    new Set((Array.isArray(approverUserIds) ? approverUserIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (ids.length === 0) throw httpError(400, "Pick at least one SLT member to send this to.");

  const roster = await listSltUsers();
  const rosterIds = new Set(roster.map((r) => Number(r.user_id)));
  const invalid = ids.filter((id) => !rosterIds.has(id));
  if (invalid.length > 0) throw httpError(400, "One or more selected people are not on the SLT approver list.");

  const now = new Date().toISOString();

  // A resubmit (e.g. after a Hold, or just sending it again) replaces the
  // previous pending approver list and clears any prior decision so there's
  // exactly one live "who can decide this" set at a time.
  await db.prepare("DELETE FROM npd_request_approvers WHERE request_id = ? AND decided_at IS NULL").run(requestId);
  for (const approverId of ids) {
    await db
      .prepare("INSERT OR IGNORE INTO npd_request_approvers (request_id, user_id, assigned_at) VALUES (?, ?, ?)")
      .run(requestId, approverId, now);
  }

  await db
    .prepare(
      `UPDATE npd_requests SET review_status = 'pending_review', submitted_for_review_at = ?, submitted_by = ?,
         decision_by = NULL, decision_at = NULL, decision = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(now, user.id, now, requestId);

  const chosenApprovers = roster.filter((r) => ids.includes(Number(r.user_id)));
  const names = chosenApprovers.map((r) => r.name);
  await logActivity({
    requestId,
    user,
    action: "submitted_for_review",
    description: `${user.name} submitted ${request.request_number} for SLT review (sent to ${names.join(", ") || "selected SLT members"}).`,
  });

  // Fire-and-forget, one per approver — a slow or failed send should never
  // block the submit itself. Same pattern as sltCalendar.service.js's
  // notifyCalendarAccessUsersOfNewEvent.
  for (const approver of chosenApprovers) {
    void email
      .sendSltReviewRequestedEmail({
        to: approver.email,
        recipientName: approver.name,
        requesterName: user?.name,
        requestNumber: request.request_number,
        customerName: request.customer_name,
        productName: request.product_name,
        weightedScore: request.weighted_score,
        priorityTier: request.priority_tier,
        requestId,
      })
      .catch((err) => {
        console.error(`[npd] SLT review-requested email to ${approver.email} failed:`, err?.message || err);
      });
  }

  return getRequestDetail(requestId);
}

async function recordDecision({ requestId, user, decision }) {
  const key = String(decision || "").trim().toLowerCase();
  if (!DECISION_LABELS[key]) throw httpError(400, "Decision must be approved, rejected, or hold.");

  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ? AND deleted_at IS NULL").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (request.review_status !== "pending_review") {
    throw httpError(409, "This request isn't currently waiting on an SLT decision.");
  }

  const myAssignment = await db
    .prepare("SELECT * FROM npd_request_approvers WHERE request_id = ? AND user_id = ? AND decided_at IS NULL")
    .get(requestId, user.id);
  if (!myAssignment && !canOverride(user)) {
    throw httpError(403, "This request wasn't sent to you for review.");
  }

  const now = new Date().toISOString();
  if (myAssignment) {
    await db.prepare("UPDATE npd_request_approvers SET decided_at = ? WHERE id = ?").run(now, myAssignment.id);
  }

  await db
    .prepare(
      `UPDATE npd_requests SET review_status = ?, decision = ?, decision_by = ?, decision_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(key, DECISION_LABELS[key], user.id, now, now, requestId);

  await logActivity({
    requestId,
    user,
    action: "slt_decision",
    description: `${user.name} recorded the SLT decision for ${request.request_number}: ${DECISION_LABELS[key]}.`,
  });

  // Let the requester know their request got a decision — fire-and-forget,
  // same pattern as the review-requested email above.
  const requester = request.created_by ? await db.prepare("SELECT name, email FROM users WHERE id = ?").get(request.created_by) : null;
  if (requester?.email) {
    void email
      .sendSltDecisionEmail({
        to: requester.email,
        recipientName: requester.name,
        decidedByName: user?.name,
        requestNumber: request.request_number,
        customerName: request.customer_name,
        productName: request.product_name,
        decisionLabel: DECISION_LABELS[key],
        requestId,
      })
      .catch((err) => {
        console.error(`[npd] SLT decision email to ${requester.email} failed:`, err?.message || err);
      });
  }

  return getRequestDetail(requestId);
}

async function listMyPendingDecisions(user) {
  if (!user?.id) return [];
  return db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM npd_requests r
       JOIN npd_request_approvers a ON a.request_id = r.id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.deleted_at IS NULL AND r.review_status = 'pending_review'
         AND a.user_id = ? AND a.decided_at IS NULL
       ORDER BY r.submitted_for_review_at ASC`
    )
    .all(user.id);
}

// ─── Activity log ───────────────────────────────────────────────────────────

async function logActivity({ requestId, user, action, description }) {
  await db
    .prepare(
      `INSERT INTO npd_activity_log (request_id, step_id, user_id, user_name, action, old_status, new_status, description)
       VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?)`
    )
    .run(requestId, user?.id || null, user?.name || "System", action, description);
}

async function generateRequestNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM npd_requests WHERE request_number LIKE ?")
    .get(`NPD-${year}-%`);
  const next = (Number(row?.c) || 0) + 1;
  return `NPD-${year}-${String(next).padStart(4, "0")}`;
}

// ─── Gate 1 scorecard ───────────────────────────────────────────────────────
// Mirrors the source "New Product Launch Scorecard" workbook's Launch
// Scorecard tab exactly: 4 metrics auto-scored from dollar/kg thresholds, 4
// scored manually 1-5, blended into one weighted 0-100 score, classified
// into a priority tier. See npdScoring.js for the actual math.

function buildScorecardFields(source) {
  const annual_volume_kg = npdScoring.toFiniteNumber(source?.annual_volume_kg);
  const annual_revenue = npdScoring.toFiniteNumber(source?.annual_revenue);
  const annual_gp_dollars = npdScoring.toFiniteNumber(source?.annual_gp_dollars);
  // Accept GP% either as a decimal fraction (0.11) or as a plain percentage
  // (11) — people naturally type percentages as whole numbers, and only a
  // fraction would ever legitimately exceed 1 in the "already a fraction"
  // sense, so anything >1 is treated as a percentage and divided down.
  let gp_percent = npdScoring.toFiniteNumber(source?.gp_percent);
  if (gp_percent !== null && gp_percent > 1) gp_percent = gp_percent / 100;
  const strategic_fit_score = npdScoring.toManualScore(source?.strategic_fit_score);
  const customer_market_value_score = npdScoring.toManualScore(source?.customer_market_value_score);
  const complexity_score = npdScoring.toManualScore(source?.complexity_score);
  const speed_to_market_score = npdScoring.toManualScore(source?.speed_to_market_score);
  const capex_required = npdScoring.toFiniteNumber(source?.capex_required);
  const customer_commitment = source?.customer_commitment ? String(source.customer_commitment).trim() : null;
  const key_strategic_rationale = source?.key_strategic_rationale ? String(source.key_strategic_rationale).trim() : null;
  const key_risks_comments = source?.key_risks_comments ? String(source.key_risks_comments).trim() : null;
  const decision = source?.decision ? String(source.decision).trim() : null;

  const computed = npdScoring.computeScorecard({
    annualVolumeKg: annual_volume_kg,
    annualRevenue: annual_revenue,
    annualGpDollars: annual_gp_dollars,
    gpPercent: gp_percent,
    strategicFitScore: strategic_fit_score,
    customerMarketValueScore: customer_market_value_score,
    complexityScore: complexity_score,
    speedToMarketScore: speed_to_market_score,
  });

  return {
    annual_volume_kg,
    annual_revenue,
    annual_gp_dollars,
    gp_percent,
    strategic_fit_score,
    customer_market_value_score,
    complexity_score,
    speed_to_market_score,
    volume_score: computed.volumeScore,
    revenue_score: computed.revenueScore,
    gp_dollar_score: computed.gpDollarScore,
    gp_percent_score: computed.gpPercentScore,
    weighted_score: computed.weightedScore,
    priority_tier: computed.priorityTier,
    capex_required,
    customer_commitment,
    key_strategic_rationale,
    key_risks_comments,
    decision,
  };
}

// Project-identity fields that sit alongside the scorecard on the same row
// (match the source workbook's own columns — Product/SKU, Customer, Channel,
// Plant, Start Date, Target Launch Date are ordinary columns on the same
// single scorecard row as everything else, not a separate section).
function buildIdentityFields(source) {
  return {
    customer_name: String(source?.customer_name || "").trim(),
    product_name: String(source?.product_name || "").trim(),
    plant: source?.plant ? String(source.plant).trim() : null,
    channel: source?.channel ? String(source.channel).trim() : null,
    start_date: source?.start_date || null,
    requested_launch_date: source?.requested_launch_date || null,
  };
}

async function createRequest({ user, body }) {
  const identity = buildIdentityFields(body);
  if (!identity.customer_name) throw httpError(400, "Customer name is required.");
  if (!identity.product_name) throw httpError(400, "Product name is required.");

  const scorecard = buildScorecardFields(body);
  const requestNumber = await generateRequestNumber();
  const now = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO npd_requests
        (request_number, customer_name, product_name, sales_rep_id, plant,
         channel, start_date, requested_launch_date,
         annual_volume_kg, annual_revenue, annual_gp_dollars, gp_percent,
         strategic_fit_score, customer_market_value_score, complexity_score, speed_to_market_score,
         volume_score, revenue_score, gp_dollar_score, gp_percent_score, weighted_score, priority_tier,
         capex_required, customer_commitment, key_strategic_rationale, key_risks_comments, decision,
         status, current_step, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 1, ?, ?, ?)`
    )
    .run(
      requestNumber,
      identity.customer_name,
      identity.product_name,
      user.id,
      identity.plant,
      identity.channel,
      identity.start_date,
      identity.requested_launch_date,
      scorecard.annual_volume_kg,
      scorecard.annual_revenue,
      scorecard.annual_gp_dollars,
      scorecard.gp_percent,
      scorecard.strategic_fit_score,
      scorecard.customer_market_value_score,
      scorecard.complexity_score,
      scorecard.speed_to_market_score,
      scorecard.volume_score,
      scorecard.revenue_score,
      scorecard.gp_dollar_score,
      scorecard.gp_percent_score,
      scorecard.weighted_score,
      scorecard.priority_tier,
      scorecard.capex_required,
      scorecard.customer_commitment,
      scorecard.key_strategic_rationale,
      scorecard.key_risks_comments,
      scorecard.decision,
      user.id,
      now,
      now
    );
  const requestId = result.lastInsertRowid;

  await logActivity({
    requestId,
    user,
    action: "request_created",
    description: `${user.name} created ${requestNumber} for ${identity.customer_name} — ${identity.product_name}.`,
  });

  return getRequestDetail(requestId);
}

async function updateRequest({ requestId, user, body }) {
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ? AND deleted_at IS NULL").get(requestId);
  if (!request) throw httpError(404, "Request not found.");

  const identity = buildIdentityFields(body);
  if (!identity.customer_name) throw httpError(400, "Customer name is required.");
  if (!identity.product_name) throw httpError(400, "Product name is required.");
  const scorecard = buildScorecardFields(body);
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE npd_requests SET
         customer_name = ?, product_name = ?, plant = ?, channel = ?, start_date = ?, requested_launch_date = ?,
         annual_volume_kg = ?, annual_revenue = ?, annual_gp_dollars = ?, gp_percent = ?,
         strategic_fit_score = ?, customer_market_value_score = ?, complexity_score = ?, speed_to_market_score = ?,
         volume_score = ?, revenue_score = ?, gp_dollar_score = ?, gp_percent_score = ?, weighted_score = ?, priority_tier = ?,
         capex_required = ?, customer_commitment = ?, key_strategic_rationale = ?, key_risks_comments = ?, decision = ?,
         updated_at = ?
       WHERE id = ?`
    )
    .run(
      identity.customer_name,
      identity.product_name,
      identity.plant,
      identity.channel,
      identity.start_date,
      identity.requested_launch_date,
      scorecard.annual_volume_kg,
      scorecard.annual_revenue,
      scorecard.annual_gp_dollars,
      scorecard.gp_percent,
      scorecard.strategic_fit_score,
      scorecard.customer_market_value_score,
      scorecard.complexity_score,
      scorecard.speed_to_market_score,
      scorecard.volume_score,
      scorecard.revenue_score,
      scorecard.gp_dollar_score,
      scorecard.gp_percent_score,
      scorecard.weighted_score,
      scorecard.priority_tier,
      scorecard.capex_required,
      scorecard.customer_commitment,
      scorecard.key_strategic_rationale,
      scorecard.key_risks_comments,
      scorecard.decision,
      now,
      requestId
    );

  await logActivity({
    requestId,
    user,
    action: "request_updated",
    description: `${user.name} updated the Gate 1 scorecard for ${request.request_number}.`,
  });

  return getRequestDetail(requestId);
}

// ─── Request detail / listing ──────────────────────────────────────────────

async function getRequestDetail(requestId) {
  const request = await db
    .prepare(`SELECT r.*, u.name AS created_by_name FROM npd_requests r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`)
    .get(requestId);
  if (!request) return null;

  const attachments = await db
    .prepare(`SELECT a.*, u.name AS uploaded_by_name FROM npd_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.request_id = ? ORDER BY a.uploaded_at DESC`)
    .all(requestId);
  const comments = await db
    .prepare(`SELECT c.*, u.name AS created_by_name FROM npd_comments c LEFT JOIN users u ON u.id = c.created_by WHERE c.request_id = ? ORDER BY c.created_at ASC`)
    .all(requestId);
  const activity = await db.prepare(`SELECT * FROM npd_activity_log WHERE request_id = ? ORDER BY created_at ASC, id ASC`).all(requestId);
  const approvers = await db
    .prepare(
      `SELECT a.user_id, u.name, u.email, a.assigned_at, a.decided_at
       FROM npd_request_approvers a JOIN users u ON u.id = a.user_id
       WHERE a.request_id = ? ORDER BY a.assigned_at ASC`
    )
    .all(requestId);

  return { ...request, attachments, comments, activity, approvers };
}

async function listRequests() {
  return db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM npd_requests r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.deleted_at IS NULL ORDER BY r.created_at DESC`
    )
    .all();
}

// Soft delete — the request drops off the list immediately but the row (and
// its full activity log, attachments, comments) stays in the database rather
// than being destroyed, so nothing here is unrecoverable from the database
// side even though there's no "undo" button in the UI yet.
async function deleteRequest({ requestId, user }) {
  if (!(await canDeleteRequest(user))) throw httpError(403, "You do not have permission to delete NPD requests.");
  const request = await db.prepare("SELECT * FROM npd_requests WHERE id = ?").get(requestId);
  if (!request) throw httpError(404, "Request not found.");
  if (request.deleted_at) throw httpError(400, "This request has already been deleted.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE npd_requests SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?").run(now, user.id, now, requestId);
  await logActivity({
    requestId,
    user,
    action: "request_deleted",
    description: `${user.name} deleted request ${request.request_number}.`,
  });
  return { ok: true };
}

// ─── Comments / attachments ─────────────────────────────────────────────────

async function addComment({ requestId, user, comment }) {
  const text = String(comment || "").trim();
  if (!text) throw httpError(400, "Comment cannot be empty.");
  const now = new Date().toISOString();
  const result = await db
    .prepare(`INSERT INTO npd_comments (request_id, step_id, created_by, comment, created_at) VALUES (?, NULL, ?, ?, ?)`)
    .run(requestId, user.id, text, now);
  return db.prepare("SELECT c.*, u.name AS created_by_name FROM npd_comments c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?").get(result.lastInsertRowid);
}

async function addAttachment({ requestId, user, fileName, originalFileName, fileUrl, fileType }) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO npd_attachments (request_id, step_id, uploaded_by, file_name, original_file_name, file_url, file_type, uploaded_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`
    )
    .run(requestId, user.id, fileName, originalFileName, fileUrl, fileType, now);
  return db
    .prepare("SELECT a.*, u.name AS uploaded_by_name FROM npd_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = ?")
    .get(result.lastInsertRowid);
}

module.exports = {
  hasNpdAccess,
  listAccessUsers,
  grantAccess,
  revokeAccess,
  canDeleteRequest,
  listDeleteAccessUsers,
  grantDeleteAccess,
  revokeDeleteAccess,
  listSltUsers,
  addSltUser,
  removeSltUser,
  submitForReview,
  recordDecision,
  listMyPendingDecisions,
  buildScorecardFields,
  createRequest,
  updateRequest,
  getRequestDetail,
  listRequests,
  deleteRequest,
  addComment,
  addAttachment,
};
