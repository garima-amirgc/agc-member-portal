import { Link } from "react-router-dom";
import {
  IconBuilding,
  IconCalendar,
  IconChart,
  IconTeam,
  IconTicket,
  IconUser,
} from "./layout/SidebarIcons";

const ACTIONS = [
  { to: "/profile", icon: IconUser, label: "My Profile" },
  { to: "/team", icon: IconTeam, label: "Team" },
  { to: "/reports", icon: IconChart, label: "Reports" },
  { to: "/facilities", icon: IconBuilding, label: "UofAGC" },
  { to: "/upcoming", icon: IconCalendar, label: "Upcoming" },
  { to: "/it-tickets", icon: IconTicket, label: "IT Support" },
];

export default function QuickActionsRow() {
  return (
    <div className="card rounded-2xl">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        Quick Actions
      </h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ACTIONS.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
