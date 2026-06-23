export function isSupervisor(user) {
  return Boolean(user?.has_direct_reports);
}
