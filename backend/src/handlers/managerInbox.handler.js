const leaveSvc = require("../services/leaveRequests.service");
const managerTeamSvc = require("../services/managerTeam.service");
const { hasDirectReports } = require("../services/supervisor.service");

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
