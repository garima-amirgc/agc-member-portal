/** Departments list for display (API returns `departments` array; legacy may only have `department`). */
export function departmentsList(userLike) {
  if (!userLike) return ["Production"];
  if (Array.isArray(userLike.departments) && userLike.departments.length > 0) {
    return [...userLike.departments].sort();
  }
  const d = userLike.department != null ? String(userLike.department).trim() : "";
  return d ? [d] : ["Production"];
}

export function formatDepartments(userLike) {
  return departmentsList(userLike).join(", ");
}

export function userHasDepartment(user, dept) {
  if (!user || !dept) return false;
  return departmentsList(user).includes(dept);
}
