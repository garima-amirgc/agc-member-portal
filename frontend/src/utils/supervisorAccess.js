/** User has at least one direct report (org supervisor), regardless of role label. */
export function isSupervisor(user) {
  return Boolean(user?.has_direct_reports);
}
