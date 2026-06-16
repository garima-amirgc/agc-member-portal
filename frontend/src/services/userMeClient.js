/** Lightweight profile fields only — skips hierarchy, assignment sync, and training summary. */
export const USER_ME_PROFILE = { params: { scope: "profile" } };

/** Nav + auth refresh — facilities, grants, supervisor flag; no hierarchy or assignment sync. */
export const USER_ME_SESSION = { params: { scope: "session" } };

/** Team page — hierarchy and training progress; skips assignment sync. */
export const USER_ME_TEAM = { params: { scope: "team", include_training_summary: "true" } };

/** @deprecated Use USER_ME_TEAM */
export const USER_ME_WITH_TRAINING = USER_ME_TEAM;

/** Full payload including hierarchy and assignment sync (Facilities, legacy callers). */
export const USER_ME_FULL = {};
