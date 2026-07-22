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
  { to: "/profile",     icon: IconUser,     label: "My Profile",  accent: false },
  { to: "/team",        icon: IconTeam,     label: "Team",        accent: false },
  { to: "/reports",     icon: IconChart,    label: "Reports",     accent: false },
  { to: "/facilities",  icon: IconBuilding, label: "UofAGC",      accent: true  },
  { to: "/upcoming",    icon: IconCalendar, label: "Upcoming",    accent: false },
  { to: "/it-tickets",  icon: IconTicket,   label: "IT Support",  accent: false },
];

export default function QuickActionsRow() {
  return (
    <div className="flex items-center justify-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 scrollbar-none">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
        Quick Actions
      </span>

      {ACTIONS.map(({ to, icon: Icon, label, accent }) => (
        <Link
          key={to}
          to={to}
          className={[
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
            "hover:scale-[1.04] active:scale-[0.98]",
            accent
              ? "bg-[#A7D344] text-[#0f0f0f] hover:bg-[#96c030]"
              : "bg-[#0B3EAF] text-white hover:bg-[#082d82]",
          ].join(" ")}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </Link>
      ))}
    </div>
  );
}
