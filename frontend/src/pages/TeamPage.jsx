import { useEffect, useMemo, useState, useCallback } from "react";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import LeaveRequestPanel from "../components/LeaveRequestPanel";
import ManagerEmployeeManagement from "../components/ManagerEmployeeManagement";
import ManagerTrainingNotifications from "../components/ManagerTrainingNotifications";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import { useAuth } from "../context/AuthContext";
import { managerInboxWithTeamJson } from "../services/leaveClient";
import { USER_ME_TEAM } from "../services/userMeClient";
import { isSupervisor } from "../utils/supervisorAccess";
import { friendlyErrorMessage } from "../services/friendlyError";

export default function TeamPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [meRefreshing, setMeRefreshing] = useState(false);
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [error, setError] = useState("");

  const profile = me || user;

  const showSupervisorTools = isSupervisor(user) || isSupervisor(profile);
  const hasDirectReportsInHierarchy = useMemo(() => {
    const raw = profile?.reporting_hierarchy?.direct_reports;
    return Array.isArray(raw) && raw.length > 0;
  }, [profile]);
  const showLearningSections = showSupervisorTools || hasDirectReportsInHierarchy;

  const reloadTeam = useCallback(async () => {
    if (!showLearningSections) {
      setTeam([]);
      setTeamError("");
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    setTeamError("");
    try {
      const { team: teamData, teamError } = await managerInboxWithTeamJson();
      setTeam(Array.isArray(teamData) ? teamData : []);
      if (teamError) setTeamError(teamError);
    } catch (e) {
      setTeamError(friendlyErrorMessage(e, "Failed to load team progress"));
      setTeam([]);
    } finally {
      setTeamLoading(false);
    }
  }, [showLearningSections]);

  const reloadProfile = useCallback(async () => {
    setMeRefreshing(true);
    setError("");
    try {
      const res = await api.get("/users/me", USER_ME_TEAM);
      setMe(res.data);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to load team"));
    } finally {
      setMeRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setMe((prev) => prev ?? user);
    reloadProfile();
  }, [user?.id, reloadProfile]);

  useEffect(() => {
    if (!user) return;
    reloadTeam();
  }, [user?.id, showLearningSections, reloadTeam]);

  useEffect(() => {
    const refresh = () => {
      reloadProfile();
      reloadTeam();
    };
    window.addEventListener("agc-training-progress", refresh);
    window.addEventListener("agc-training-complete", refresh);
    return () => {
      window.removeEventListener("agc-training-progress", refresh);
      window.removeEventListener("agc-training-complete", refresh);
    };
  }, [reloadProfile, reloadTeam]);

  const selfTraining = useMemo(
    () => ({
      training_summary: profile?.training_summary ?? { avgProgress: 0, total: 0, completed: 0, allComplete: false },
    }),
    [profile]
  );

  if (!profile) {
    return (
      <main className={PAGE_SHELL}>
        <div className="card p-4 text-sm text-slate-500">Loading team…</div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-6 text-2xl font-bold">Team</h1>
      </section>

      {error ? (
        <div className="mb-4 rounded bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>
      ) : null}

      {meRefreshing ? (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Updating team progress…</p>
      ) : null}

      <ReportingHierarchyTree
        hierarchy={profile.reporting_hierarchy}
        currentUserId={profile.id}
        team={team}
        selfTraining={selfTraining}
      />

      {showLearningSections ? (
        <div className="space-y-6">
          <ManagerEmployeeManagement
            team={team}
            loading={teamLoading}
            error={teamError}
            onReload={reloadTeam}
          />
          <ManagerTrainingNotifications />
        </div>
      ) : null}

      {user?.role !== "Admin" ? (
        <details className="group card rounded-portal border border-stone-200/90 p-4 open:ring-1 open:ring-brand-blue/20 dark:border-stone-700 dark:open:ring-brand-blue/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 font-semibold text-slate-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden dark:text-slate-100">
            <span>Leave requests</span>
            <svg
              className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180 dark:text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </summary>
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
            <LeaveRequestPanel embedded />
          </div>
        </details>
      ) : null}
    </main>
  );
}
