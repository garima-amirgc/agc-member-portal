import { useEffect, useState } from "react";
import api from "../services/api";
import { PAGE_SHELL } from "../constants/pageLayout";
import ReportingHierarchyTree from "../components/ReportingHierarchyTree";
import TeamTimeOffBoard from "../components/TeamTimeOffBoard";
import { useAuth } from "../context/AuthContext";
import { USER_ME_TEAM_HIERARCHY } from "../services/userMeClient";
import { isSupervisor } from "../utils/supervisorAccess";
import { friendlyErrorMessage } from "../services/friendlyError";

// 2026-09-21 — this page used to also show two training-tracking widgets
// (ManagerEmployeeManagement's "Team learning details" card and
// ManagerTrainingNotifications' "University learning updates" card) below
// the vacation board. Garima asked for those to come out entirely, on top
// of the leave-request cleanup done earlier the same day — see
// PROJECT_NOTES.md ("Team page — ADP-only vacation data..."). This page's
// state was trimmed down to just what ReportingHierarchyTree and
// TeamTimeOffBoard actually need; the old `team`/`selfTraining` props this
// page used to pass to ReportingHierarchyTree were dead code even before
// this — that component only ever destructures `hierarchy` and
// `currentUserId`.
export default function TeamPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [error, setError] = useState("");

  const profile = me || user;
  const showSupervisorTools = isSupervisor(user) || isSupervisor(profile);

  useEffect(() => {
    if (!user) return;
    setMe((prev) => prev ?? user);
    let cancelled = false;

    (async () => {
      setHierarchyLoading(true);
      setError("");
      try {
        const res = await api.get("/users/me", USER_ME_TEAM_HIERARCHY);
        if (cancelled) return;
        setMe({ ...(user || {}), ...res.data });
      } catch (e) {
        if (cancelled) return;
        setError(friendlyErrorMessage(e, "Failed to load team"));
      } finally {
        if (!cancelled) setHierarchyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

      {hierarchyLoading ? (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Loading team…</p>
      ) : null}

      <ReportingHierarchyTree hierarchy={profile.reporting_hierarchy} currentUserId={profile.id} />

      {showSupervisorTools ? (
        <div className="mt-6 space-y-6">
          {/* Vacation/time-off data on this page is ADP-only now — the portal's
              own pending-leave-request review UI (TeamLeaveRequests, and the
              portal-native calendar it embedded) was removed so this section
              shows exactly what ADP has on record, nothing built before the
              ADP sync existed. See PROJECT_NOTES.md. */}
          <TeamTimeOffBoard />
        </div>
      ) : null}
    </main>
  );
}
