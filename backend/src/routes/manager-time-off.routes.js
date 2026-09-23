const express = require("express");
const { authRequired } = require("../middleware/auth");
const { supervisorRequired } = require("../middleware/supervisorRequired");
const managerTimeOffSvc = require("../services/managerTimeOff.service");
const adpTimeOffSync = require("../services/adpTimeOffSync.service");

const router = express.Router();
router.use(authRequired, supervisorRequired);

// GET /manager-time-off — the logged-in manager's direct reports with
// ADP time-off balances + time off, read from the local sync tables (see
// adpTimeOffSync.service.js) rather than calling ADP live. Read-only.
router.get("/", async (req, res) => {
  try {
    const out = await managerTimeOffSvc.getTeamTimeOff(req.user.id);
    return res.json(out);
  } catch (e) {
    console.error("[Manager Time Off] GET / error:", e.message || e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// GET /manager-time-off/employees/:id/history?year=YYYY — one employee's
// full-year time-off history, for the drawer. Only works for someone who
// actually reports to the requesting manager. This one call is live (not
// from the synced tables), since it's opened rarely and needs to cover
// whatever year is requested, not just the rolling sync window.
router.get("/employees/:id/history", async (req, res) => {
  try {
    const out = await managerTimeOffSvc.getEmployeeYearHistory(req.user.id, Number(req.params.id), req.query.year);
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("[Manager Time Off] GET /employees/:id/history error:", e.message || e);
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

// POST /manager-time-off/sync — force a fresh pull from ADP right now,
// instead of waiting for the background schedule. Any manager can trigger
// it (it refreshes data for the whole company, not just their own team) —
// mainly here for testing while ADP access is being set up.
//
// This does NOT wait for the sync to finish before responding — one
// full sync round-trips ADP once per linked employee (a handful at a
// time), which has been observed to take minutes for a company this
// size and will only grow with headcount. Blocking the request that
// long risks a platform timeout in production (Render et al. cap how
// long a request can stay open) and just makes the button feel broken.
// Instead this kicks the sync off in the background and returns
// immediately; the frontend polls GET / and picks up the fresh data
// once `synced_at` moves.
router.post("/sync", async (req, res) => {
  try {
    if (adpTimeOffSync.isSyncRunning()) {
      return res.json({ started: false, already_running: true });
    }
    adpTimeOffSync.runFullTimeOffSync().catch((e) => {
      console.error("[Manager Time Off] background sync error:", e.message || e);
    });
    return res.json({ started: true, already_running: false });
  } catch (e) {
    console.error("[Manager Time Off] POST /sync error:", e.message || e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// GET /manager-time-off/notifications — active (not-dismissed) time-off
// event notifications for this manager's team — pending/approved/cancelled
// requests as ADP reports them, not just the approved-only data the board
// above reads. Drives the Team sidebar badge and the board's "New time off
// requests" panel. See adpTimeOffEvents.service.js for where these rows
// come from.
router.get("/notifications", async (req, res) => {
  try {
    const out = await managerTimeOffSvc.getTimeOffNotifications(req.user.id);
    return res.json({ notifications: out });
  } catch (e) {
    console.error("[Manager Time Off] GET /notifications error:", e.message || e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// POST /manager-time-off/notifications/:id/dismiss — this is just clearing
// the notification from the portal, same as IT Tickets/training alerts.
// It never touches ADP — the underlying request is still whatever it is in
// ADP regardless of whether the manager dismisses this FYI.
router.post("/notifications/:id/dismiss", async (req, res) => {
  try {
    const out = await managerTimeOffSvc.dismissTimeOffNotification(req.user.id, Number(req.params.id));
    return res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("[Manager Time Off] POST /notifications/:id/dismiss error:", e.message || e);
    return res.status(code).json({ message: e.message || "Server error" });
  }
});

module.exports = router;
