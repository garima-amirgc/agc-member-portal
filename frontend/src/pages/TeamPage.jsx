import { useEffect, useMemo, useState, useCallback } from "react";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import LeaveRequestPanel from "../components/LeaveRequestPanel";
import ManagerEmployeeManagement from "../components/ManagerEmployeeManagement";
import ManagerTrainingNotifications from "../components/ManagerTrainingNotifications";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import { useAuth } from "../context/AuthContext";
import { managerInboxWithTeamJson } from "../services/leaveClient";
import { USER_ME_WITH_TRAINING } from "../services/userMeClient";
import { isSupervisor } from "../utils/supervisorAccess";
import { friendlyErrorMessage } from "../services/friendlyError";

export default function TeamPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const showSupervisorTools = isSupervisor(user) || isSupervisor(me);
  const hasDirectReportsInHierarchy = useMemo(() => {
    const raw = me?.reporting_hierarchy?.direct_reports;
    return Array.isArray(raw) && raw.length > 0;
  }, [me]);
  const showLearningSections = showSupervisorTools || hasDirectReportsInHierarchy;

  const reloadProfile = useCallback(async () => {
    try {
      const res = await api.get("/users/me", USER_ME_WITH_TRAINING);
      setMe(res.data);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Failed to load team"));
    }
  }, []);

  const reloadTeam = useCallback(async () => {
    if (!showLearningSections) return;
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/users/me", USER_ME_WITH_TRAINING);
        setMe(res.data);
      } catch (e) {
        setError(friendlyErrorMessage(e, "Failed to load team"));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !showLearningSections) {
      setTeam([]);
      setTeamError("");
      setTeamLoading(false);
      return;
    }
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
      training_summary: me?.training_summary ?? { avgProgress: 0, total: 0, completed: 0, allComplete: false },
    }),
    [me]
  );

  if (loading) {
    return (
      <main className={PAGE_SHELL}>
        <div className="card p-4 text-sm text-slate-500">Loading team…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={PAGE_SHELL}>
        <div className="rounded bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className={PAGE_SHELL}>
        <div className="card p-4 text-sm text-slate-500">Team information is unavailable.</div>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-6 text-2xl font-bold">Team</h1>
      </section>

      <ReportingHierarchyTree
        hierarchy={me.reporting_hierarchy}
        currentUserId={me.id}
        team={team}
        selfTraining={selfTraining}
      />

      {showLearningSections ? (
        <div className="space-y-6">
          {teamLoading && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading course completion…</p>
          )}
          {teamError && (
            <div className="rounded bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {teamError}
            </div>
          )}
          <ManagerEmployeeManagement />
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
