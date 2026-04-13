import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PAGE_SHELL } from "../constants/pageLayout";
import DashboardAssignmentNotice from "../components/DashboardAssignmentNotice";

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  return (
    <>
      <main className={PAGE_SHELL}>
        <div className="space-y-6">
          <DashboardAssignmentNotice user={user} />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-2 text-lg font-semibold">Your role</h2>
              <p className="text-sm text-[#000000] dark:text-white/90">
                <span className="inline-flex items-center rounded-full border-2 border-[#0B3EAF] bg-[rgba(167,211,68,0.2)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:border-[#A7D344] dark:bg-[rgba(11,62,175,0.25)] dark:text-[#A7D344]">
                  {user?.role || "Guest"}
                </span>
                <span className="mt-2 block text-[#0B3EAF] dark:text-[#A7D344]">account access</span>
              </p>
            </div>

            <div className="card">
              <h2 className="mb-2 text-lg font-semibold">Quick links</h2>
              <div className="space-y-2 text-sm">
                <Link
                  className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                  to="/facilities"
                >
                  Facilities
                </Link>
                <Link
                  className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                  to="/profile"
                >
                  Profile & leave requests
                </Link>
                {isAdmin && (
                  <Link
                    className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                    to="/admin"
                  >
                    Learning admin
                  </Link>
                )}
                {user?.role === "Manager" && (
                  <Link
                    className="block rounded-portal border border-transparent px-2 py-1.5 font-bold text-[#0B3EAF] underline decoration-[#A7D344] decoration-2 underline-offset-2 transition hover:bg-[rgba(167,211,68,0.12)] hover:text-[#082d82] dark:text-[#A7D344] dark:decoration-[#0B3EAF] dark:hover:bg-[rgba(11,62,175,0.2)]"
                    to="/manager"
                  >
                    Manager hub
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
