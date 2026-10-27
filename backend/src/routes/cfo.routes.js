const express = require("express");
const multer = require("multer");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrantAny } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, hasAnyAdminGrant } = require("../config/adminGrants");
const cfoReports = require("../services/cfoReports.service");
const cfoIncidents = require("../services/cfoIncidents.service");
const sltItems = require("../services/sltItems.service");
const sltCalendar = require("../services/sltCalendar.service");
const sltActions = require("../services/sltActions.service");
const sltDecisions = require("../services/sltDecisions.service");
const sltCommitments = require("../services/sltCommitments.service");
const sltOverview = require("../services/sltOverview.service");
const sltAudit = require("../services/sltAudit.service");
const sp = require("../services/sharepoint.service");

const router = express.Router();

router.use(authRequired);

// Anyone who can see Incident Reports (view or edit) can see the
// SharePoint-connection status and the "incident" report key, alongside
// the CFO grant. The SLT Report has its own, separate view/edit grants.
const INCIDENT_OR_CFO_GRANTS = [
  ADMIN_GRANT_KEYS.CFO,
  ADMIN_GRANT_KEYS.INCIDENT_REPORT_VIEW,
  ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT,
];
const INCIDENT_EDIT_GRANTS = [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.INCIDENT_REPORT_EDIT];
const SLT_VIEW_GRANTS = [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_VIEW, ADMIN_GRANT_KEYS.SLT_EDIT];
const SLT_EDIT_GRANTS = [ADMIN_GRANT_KEYS.CFO, ADMIN_GRANT_KEYS.SLT_EDIT];

router.get("/status", requireAdminGrantAny(...INCIDENT_OR_CFO_GRANTS), (req, res) => {
  res.json({ configured: sp.isConfigured() });
});

// "incident" is still the legacy SharePoint-Excel-backed history (kept
// read-only, no longer surfaced in the UI). "slt" used to be SharePoint-Excel
// too, but is now native, in-portal data (see sltItems.service.js below) —
// routed here so the frontend's existing loadReport("slt") call didn't need
// to change.
router.get("/report/:key", async (req, res) => {
  try {
    if (req.params.key === "slt") {
      if (!hasAnyAdminGrant(req.user, SLT_VIEW_GRANTS)) {
        return res.status(403).json({ message: "You do not have access to this administration area." });
      }
      const data = await sltItems.getSltReport();
      return res.json(data);
    }
    const grants = req.params.key === "incident" ? INCIDENT_OR_CFO_GRANTS : [ADMIN_GRANT_KEYS.CFO];
    if (!hasAnyAdminGrant(req.user, grants)) {
      return res.status(403).json({ message: "You do not have access to this administration area." });
    }
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const data = await cfoReports.getReport(req.params.key, { forceRefresh });
    res.json(data);
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
    console.error("[cfo]", e);
    res.status(500).json({ message: `Could not load that report: ${e?.message || "unknown error"}` });
  }
});

// ── Native, in-portal Incident Reports ──────────────────────────────────────
// Viewing requires CFO, incident_report_view, or incident_report_edit.
// Adding/updating requires CFO or incident_report_edit. Deleting is
// restricted further, to full Administrators (enforced in the service).

router.get("/incidents", requireAdminGrantAny(...INCIDENT_OR_CFO_GRANTS), async (req, res) => {
  try {
    const { facility, status, severity } = req.query;
    const incidents = await cfoIncidents.listIncidents({ facility, status, severity });
    res.json({ incidents });
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.post("/incidents", requireAdminGrantAny(...INCIDENT_EDIT_GRANTS), async (req, res) => {
  try {
    const incident = await cfoIncidents.createIncident(req.user.id, req.body);
    res.status(201).json(incident);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.patch("/incidents/:id", requireAdminGrantAny(...INCIDENT_EDIT_GRANTS), async (req, res) => {
  try {
    const incident = await cfoIncidents.updateIncident(req.user.id, req.params.id, req.body);
    res.json(incident);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.delete("/incidents/:id", async (req, res) => {
  try {
    const result = await cfoIncidents.deleteIncident(req.user, req.params.id);
    res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

// ── Native, in-portal SLT Report ────────────────────────────────────────
// Three record types (action items, calendar events, decisions), each with
// its own add/update/delete routes below. Listing all three together (plus
// the computed per-person performance roster) goes through GET
// /report/slt above — that's what the SLT tab actually loads, same as it
// did when "slt" meant a SharePoint fetch. Viewing requires cfo, slt_view,
// or slt_edit; adding/updating/deleting requires cfo or slt_edit.

router.post("/slt/action-items", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const item = await sltItems.createActionItem(req.user.id, req.body);
    res.status(201).json(item);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.patch("/slt/action-items/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const item = await sltItems.updateActionItem(req.params.id, req.body);
    res.json(item);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.delete("/slt/action-items/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const result = await sltItems.deleteActionItem(req.params.id);
    res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.post("/slt/calendar-events", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const event = await sltItems.createCalendarEvent(req.user.id, req.body);
    res.status(201).json(event);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.patch("/slt/calendar-events/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const event = await sltItems.updateCalendarEvent(req.params.id, req.body);
    res.json(event);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.delete("/slt/calendar-events/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const result = await sltItems.deleteCalendarEvent(req.params.id);
    res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.post("/slt/decisions", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const decision = await sltItems.createDecision(req.user.id, req.body);
    res.status(201).json(decision);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.patch("/slt/decisions/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const decision = await sltItems.updateDecision(req.params.id, req.body);
    res.json(decision);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

router.delete("/slt/decisions/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    const result = await sltItems.deleteDecision(req.params.id);
    res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message || "Server error" });
  }
});

// ── SLT Tracker — Master Calendar ───────────────────────────────────────
// Native table (slt_calendar) matching the source workbook's "Master
// Calendar" sheet column-for-column — see sltCalendar.service.js. Viewing
// requires cfo, slt_view, or slt_edit. Adding a new event still requires
// the full cfo/slt_edit grant. Editing/deleting an *existing* event is
// broader than a flat grant check: it's allowed for anyone with
// the full edit grant, for the event's own creator, or for anyone a full
// admin has delegated "edit on behalf of" that creator to (set on the
// Manage Users screen, see adminGrants.js's calendar_edit_delegates) — see
// canEditCalendarEvent() below. So the route-level middleware only
// requires *view* access here; the finer-grained check happens per-event
// inside each handler.

function sltErrorHandler(res, e) {
  const code = e?.statusCode || 500;
  res.status(code).json({ message: e?.message || "Server error" });
}

// In-memory only — the uploaded workbook is parsed and discarded, never
// written to disk (unlike upload.routes.js's instances, which save
// documents/images the portal needs to keep).
const calendarImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".xlsx") || file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are supported."));
    }
  },
});

function canEditCalendarEvent(user, event) {
  if (hasAnyAdminGrant(user, SLT_EDIT_GRANTS)) return true;
  if (event?.created_by == null) return false;
  if (Number(user?.id) === Number(event.created_by)) return true;
  const delegates = Array.isArray(user?.calendarEditDelegates) ? user.calendarEditDelegates : [];
  return delegates.includes(Number(event.created_by));
}

router.get("/slt/v2/calendar", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const events = await sltCalendar.listCalendar(req.query);
    res.json({ events: events.map((ev) => ({ ...ev, can_edit: canEditCalendarEvent(req.user, ev) })) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Registered BEFORE the "/:id" route below so Express doesn't try to parse
// "export" as an id. Offline-continuity export — see
// sltCalendar.service.js's exportCalendarWorkbookBuffer() for the format
// and why it includes a "Record ID" column.
router.get("/slt/v2/calendar/export", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const buf = await sltCalendar.exportCalendarWorkbookBuffer();
    const filename = `AGC_SLT_Master_Calendar_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Offline-continuity import: upload a workbook shaped like the export
// above (or the original source sheet) and upsert it into slt_calendar.
// ?dryRun=true previews counts without writing, so the UI can show a
// summary before the user commits.
router.post(
  "/slt/v2/calendar/import",
  requireAdminGrantAny(...SLT_EDIT_GRANTS),
  (req, res, next) => {
    calendarImportUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Could not read the uploaded file." });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer || !req.file.buffer.length) {
        return res.status(400).json({ message: "No file uploaded." });
      }
      const dryRun = req.query.dryRun === "true" || req.query.dryRun === "1";
      const result = await sltCalendar.importCalendarFromBuffer(req.user.id, req.file.buffer, { dryRun });
      res.json(result);
    } catch (e) {
      sltErrorHandler(res, e);
    }
  }
);

router.get("/slt/v2/calendar/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const event = await sltCalendar.getCalendarEventById(req.params.id);
    res.json({ ...event, can_edit: canEditCalendarEvent(req.user, event) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/calendar", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltCalendar.createCalendarEvent(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/calendar/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const existing = await sltCalendar.getCalendarEventById(req.params.id);
    if (!canEditCalendarEvent(req.user, existing)) {
      return res.status(403).json({ message: "You can only edit calendar events you created (or were delegated)." });
    }
    res.json(await sltCalendar.updateCalendarEvent(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// True, permanent delete (by explicit request) — not the archive-only
// pattern used elsewhere in SLT Tracker. There is no restore once this
// succeeds; the audit log (entityType "calendar", action "delete") is the
// only record the event ever existed.
router.delete("/slt/v2/calendar/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const existing = await sltCalendar.getCalendarEventById(req.params.id);
    if (!canEditCalendarEvent(req.user, existing)) {
      return res.status(403).json({ message: "You can only delete calendar events you created (or were delegated)." });
    }
    res.json(await sltCalendar.deleteCalendarEvent(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// ── SLT Tracker — Action Tracker Executive Board ───────────────────────
// Action Register, Decisions (Queue + Register), 90-Day Commitments,
// Dashboard and Weekly Review — see sltActions/sltDecisions/
// sltCommitments/sltOverview.service.js. Same cfo/slt_view/slt_edit grants
// as the rest of SLT Tracker v2; archive/restore only, never hard delete.

// Action Register
router.get("/slt/v2/actions", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ actions: await sltActions.listActions(req.query) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/actions/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltActions.getActionById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/actions/:id/history", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ history: await sltActions.getActionStatusHistory(req.params.id) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/actions", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltActions.createAction(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/actions/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActions.updateAction(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/actions/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActions.setActionArchived(req.user.id, req.params.id, true));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/actions/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActions.setActionArchived(req.user.id, req.params.id, false));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Decision Queue
router.get("/slt/v2/decision-queue", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ items: await sltDecisions.listDecisionQueue(req.query) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/decision-queue/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.getDecisionQueueById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-queue", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltDecisions.createDecisionQueueItem(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/decision-queue/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.updateDecisionQueueItem(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-queue/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.setDecisionQueueArchived(req.user.id, req.params.id, true));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-queue/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.setDecisionQueueArchived(req.user.id, req.params.id, false));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// "Record Decision" — moves a Decision Queue item into the permanent
// Decision Register, linked via the queue item's own id (never by title).
router.post("/slt/v2/decision-queue/:id/record-decision", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltDecisions.recordDecision(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Decision Register
router.get("/slt/v2/decision-register", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ entries: await sltDecisions.listDecisionRegister(req.query) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/decision-register/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.getDecisionRegisterById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-register", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltDecisions.createDecisionRegisterEntry(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/decision-register/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.updateDecisionRegisterEntry(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-register/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.setDecisionRegisterArchived(req.user.id, req.params.id, true));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decision-register/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisions.setDecisionRegisterArchived(req.user.id, req.params.id, false));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// 90-Day Commitments
router.get("/slt/v2/commitments", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ commitments: await sltCommitments.listCommitments(req.query) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/commitments/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitments.getCommitmentById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/commitments/:id/checkins", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ checkins: await sltCommitments.listCheckins(req.params.id) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltCommitments.createCommitment(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/commitments/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitments.updateCommitment(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitments.setCommitmentArchived(req.user.id, req.params.id, true));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitments.setCommitmentArchived(req.user.id, req.params.id, false));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments/checkins/:checkinId/complete", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitments.completeCheckin(req.user.id, req.params.checkinId, req.body?.notes));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Dashboard + Weekly Review (cross-area, read-only)
router.get("/slt/v2/dashboard", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltOverview.getDashboard());
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/weekly-review", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltOverview.getWeeklyReview());
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Shared audit trail (any entity type)
router.get("/slt/v2/audit/:entityType/:entityId", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json({ audit: await sltAudit.getAuditTrail(req.params.entityType, req.params.entityId) });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

module.exports = router;
