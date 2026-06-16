/** Lightweight profile fields only — skips hierarchy, assignment sync, and training summary. */
export const USER_ME_PROFILE = { params: { scope: "profile" } };

/** Nav + auth refresh — facilities, grants, supervisor flag; no hierarchy or assignment sync. */
export const USER_ME_SESSION = { params: { scope: "session" } };

/** Team page — hierarchy only (training loaded via manager-team-overview). */
export const USER_ME_TEAM_HIERARCHY = { params: { scope: "team" } };

/** @deprecated Use USER_ME_TEAM_HIERARCHY + manager team overview for training. */
export const USER_ME_WITH_TRAINING = USER_ME_TEAM_HIERARCHY;

/** Full payload including hierarchy and assignment sync (Facilities, legacy callers). */
export const USER_ME_FULL = {};
