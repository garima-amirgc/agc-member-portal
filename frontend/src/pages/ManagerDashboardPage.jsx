import { useCallback, useEffect, useState } from "react";
import { PAGE_SHELL } from "../constants/pageLayout";
import { managerTeamWithSelfJson } from "../services/leaveClient";
import { useAuth } from "../context/AuthContext";
import ManagerTeamGraph from "../components/ManagerTeamGraph";
import ManagerTrainingNotifications from "../components/ManagerTrainingNotifications";
import TeamTimeOffBoard from "../components/TeamTimeOffBoard";
import TeamLeaveRequests from "../components/teamTimeOff/TeamLeaveRequests";

export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState("");

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError("");
    try {
      const { team, teamError } = await managerTeamWithSelfJson();
      setTeam(team);
      if (teamError) setTeamError(teamError);
    } catch (e) {
      setTeamError(e?.message || "Failed to load team");
      setTeam([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-1 text-2xl font-bold">My team</h1>
      </section>

      {teamLoading && <div className="card p-4 text-sm text-slate-500">Loading team…</div>}
      {teamError && <div className="rounded bg-rose-100 p-2 text-sm text-rose-700">{teamError}</div>}
      {!teamLoading && !teamError && <ManagerTeamGraph managerName={user?.name} team={team} />}

      <div className="space-y-6">
        <TeamTimeOffBoard />
        <TeamLeaveRequests team={team} onDecided={loadTeam} loading={teamLoading} />
      </div>

      <ManagerTrainingNotifications />
    </main>
  );
}
