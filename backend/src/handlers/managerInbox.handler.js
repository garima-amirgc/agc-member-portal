const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { hasDirectReports } = require("../services/supervisor.service");

/**
 * Supervisor leave inbox always returns { leave_inbox, team_overview } so the UI can load both
 * without a second route (avoids 404 when team-only paths are missing on the running server).
 */
async function managerLeaveInboxWithTeam(req, res) {
  if (!(await hasDirectReports(req.user.id))) return res.status(403).json({ message: "Forbidden" });
  try {
    const inbox = await leaveSvc.listLeaveInboxForManager(req.user.id);
    let team_overview = [];
    try {
      team_overview = await managerTeamSvc.getTeamOverview(req.user.id);
    } catch (e) {
      console.error("manager team_overview:", e.message || e);
    }
    return res.json({ leave_inbox: inbox, team_overview });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
}

module.exports = { managerLeaveInboxWithTeam };
