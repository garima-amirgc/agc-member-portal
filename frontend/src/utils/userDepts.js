import { DEPARTMENTS } from "../constants/departments";

export function departmentsList(userLike) {
  if (!userLike) return ["Production"];
  // If the API returned an explicit departments array, use it as-is (including empty = no dept).
  if (Array.isArray(userLike.departments)) {
    if (userLike.departments.length > 0) return [...userLike.departments].sort();
    // Empty array means explicitly no department — honour it.
    return [];
  }
  // Fallback for legacy objects that only carry the single-department string field.
  const d = userLike.department != null ? String(userLike.department).trim() : "";
  return d ? [d] : ["Production"];
}

export function formatDepartments(userLike) {
  const list = departmentsList(userLike);
  if (list.length === DEPARTMENTS.length) return "All";
  return list.join(", ");
}

export function userHasDepartment(user, dept) {
  if (!user || !dept) return false;
  return departmentsList(user).includes(dept);
}
