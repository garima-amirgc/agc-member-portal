const express = require("express");
const multer = require("multer");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrantAny } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, hasAnyAdminGrant } = require("../config/adminGrants");
const cfoReports = require("../services/cfoReports.service");
const cfoIncidents = require("../services/cfoIncidents.service");
const sltCalendar = require("../services/sltCalendar.service");
const sltActionRegister = require("../services/sltActionRegister.service");
const sltDecisionRegister = require("../services/sltDecisionRegister.service");
const sltCommitmentRegister = require("../services/sltCommitmentRegister.service");
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
// read-only, no longer surfaced in the UI). The "slt" key this route used
// to special-case (sltItems.service.js's legacy combined report) was
// removed along with the rest of the Action Tracker / legacy SLT report
// system by explicit request — SLT Tracker now loads its own data
// directly from /cfo/slt/v2/calendar instead of going through this route.
router.get("/report/:key", async (req, res) => {
  try {
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

// The old legacy-v1 routes here (POST/PATCH/DELETE /slt/action-items,
// /slt/calendar-events, /slt/decisions, backed by sltItems.service.js) were
// already dead — the live UI has not called them since SltTrackerV2
// replaced the old combined-list view. Removed along with the rest of the
// Action Tracker / legacy SLT report system.

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
// (same data columns as the source sheet, nothing extra).
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

// Master Calendar email subscription — admin-configured scheduled digest
// (whole calendar as an Excel attachment). GET/PATCH gated the same as the
// rest of this calendar block (view vs edit), matching the frontend, which
// only shows this under SLT Report → Administration to a full Admin-role
// account (see ADMIN_ONLY_SUB_TAB_KEYS in SltTrackerV2.jsx) — that's a UI
// choice, not a separate backend authorization tier.
router.get("/slt/v2/calendar/subscription", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltCalendar.getCalendarSubscriptionSettings());
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/calendar/subscription", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCalendar.updateCalendarSubscriptionSettings(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Sends a one-off test digest to the requesting admin's own email only
// (never the real subscriber list), so they can confirm it looks right
// before relying on the schedule. Doesn't touch last_sent_period.
router.post("/slt/v2/calendar/subscription/test", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCalendar.sendCalendarDigestTestEmail(req.user));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// The OLD Action Tracker Executive Board routes (Action Register, Decision
// Queue/Register, 90-Day Commitments, Dashboard, Weekly Review — formerly
// here, backed by sltActions/sltDecisions/sltCommitments/sltOverview.
// service.js) were removed entirely by explicit request ("completely
// remove this... delete everything related to this"). The generic audit
// trail route below was unaffected by that removal — it still serves
// calendar entries, and now also serves the brand-new Action Register
// below (entityType "action").

// ── SLT Tracker — Action Register ───────────────────────────────────────
// Native table (slt_action_register) backing the "Action Register" radio
// choice under the new "SLT Tracker" view in CfoReportsPage.jsx (sibling to
// "SLT Master Calendar") — see sltActionRegister.service.js. "Board
// Summary" and "Executive Dashboard" (the other two radio choices in that
// same view) have no routes of their own: the frontend computes both from
// this same GET list, client-side (sltActionAnalytics.js). Unlike Master
// Calendar, there's no per-row creator/delegate edit restriction here —
// anyone with the full slt_edit grant (or cfo) can edit or archive any
// item, same flat check both ways.
router.get("/slt/v2/action-items", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const items = await sltActionRegister.listActionItems(req.query);
    res.json({ items });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/action-items/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltActionRegister.getActionItemById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/action-items", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltActionRegister.createActionItem(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/action-items/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActionRegister.updateActionItem(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Archive-only soft delete (see sltActionRegister.service.js) — the row is
// never actually removed, just hidden from the default list.
router.post("/slt/v2/action-items/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActionRegister.archiveActionItem(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/action-items/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltActionRegister.restoreActionItem(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// SLT Tracker → "Decisions" tab (Decision Queue / Decision Register) — see
// sltDecisionRegister.service.js for the full design, in particular why
// this is one table/one list endpoint behind two frontend tabs rather than
// two separate routes: SltDecisionBoard.jsx splits this same GET list into
// "queue" (active) vs "register" (decided) client-side, same pattern as
// Action Register's Board Summary/Executive Dashboard. Same flat
// view/edit grant check as Action Register — no per-row creator/delegate
// restriction.
router.get("/slt/v2/decisions", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const decisions = await sltDecisionRegister.listDecisions(req.query);
    res.json({ decisions });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/decisions/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisionRegister.getDecisionById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decisions", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltDecisionRegister.createDecision(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/decisions/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisionRegister.updateDecision(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Archive-only soft delete (see sltDecisionRegister.service.js) — the row
// is never actually removed, just hidden from both the Queue and Register
// tabs. Independent of the automatic Queue→Register move on Status change.
router.post("/slt/v2/decisions/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisionRegister.archiveDecision(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/decisions/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltDecisionRegister.restoreDecision(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// SLT Tracker → "90 Day Commitments" radio choice — see
// sltCommitmentRegister.service.js for the full design. Same flat
// view/edit grant check as Action Register/Decisions — no per-row
// creator/delegate restriction.
router.get("/slt/v2/commitments", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    const commitments = await sltCommitmentRegister.listCommitments(req.query);
    res.json({ commitments });
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.get("/slt/v2/commitments/:id", requireAdminGrantAny(...SLT_VIEW_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitmentRegister.getCommitmentById(req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.status(201).json(await sltCommitmentRegister.createCommitment(req.user.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.patch("/slt/v2/commitments/:id", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitmentRegister.updateCommitment(req.user.id, req.params.id, req.body));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

// Archive-only soft delete (see sltCommitmentRegister.service.js) — the row
// is never actually removed, just hidden from the board.
router.post("/slt/v2/commitments/:id/archive", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitmentRegister.archiveCommitment(req.user.id, req.params.id));
  } catch (e) {
    sltErrorHandler(res, e);
  }
});

router.post("/slt/v2/commitments/:id/restore", requireAdminGrantAny(...SLT_EDIT_GRANTS), async (req, res) => {
  try {
    res.json(await sltCommitmentRegister.restoreCommitment(req.user.id, req.params.id));
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
