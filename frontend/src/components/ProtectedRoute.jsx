import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasAdminGrant, hasAnyAdminGrant } from "../utils/adminAccess";
import { isSupervisor } from "../utils/supervisorAccess";

export default function ProtectedRoute({ children, roles, adminGrant, adminGrants, supervisor }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (supervisor && !isSupervisor(user)) {
    return (
      <div className="p-6">
        <div className="card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          You don’t have access to this page. Team tools are available when you have people reporting to you in the
          organization chart.
        </div>
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-6">
        <div className="card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          You don’t have access to this page. If you believe this is an error, please contact an administrator.
        </div>
      </div>
    );
  }
  if (adminGrant && !hasAdminGrant(user, adminGrant)) {
    return (
      <div className="p-6">
        <div className="card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          You don’t have access to this administration area. Ask a full administrator to grant the required
          permission on your account.
        </div>
      </div>
    );
  }
  if (adminGrants && !hasAnyAdminGrant(user, adminGrants)) {
    return (
      <div className="p-6">
        <div className="card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          You don’t have access to this administration area. Ask a full administrator to grant the required
          permission on your account.
        </div>
      </div>
    );
  }
  return children;
}
