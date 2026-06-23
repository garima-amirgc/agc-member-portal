import { Link } from "react-router-dom";
import {
  IconBuilding,
  IconChevron,
  IconClipboard,
  IconDocument,
  IconHeart,
  IconInfo,
  IconTicket,
} from "./layout/SidebarIcons";

const RESOURCES = [
  { to: "/about-company/about", icon: IconInfo, label: "Employee Handbook" },
  { to: "/about-company/policy", icon: IconDocument, label: "Policies & Procedures" },
  { to: "/about-company/benefits", icon: IconHeart, label: "Benefits Portal" },
  { to: "/about-company/forms", icon: IconClipboard, label: "Forms" },
  { to: "/facilities", icon: IconBuilding, label: "Learning Center" },
  { to: "/it-tickets", icon: IconTicket, label: "IT Service Catalog" },
];

export default function HelpfulResourcesCard() {
  return (
    <div className="card relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        Helpful Resources
      </h2>

      <div className="mt-3 space-y-2">
        {RESOURCES.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:text-slate-200"
          >
            <Icon className="h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" />
            <span className="min-w-0 flex-1">{label}</span>
            <IconChevron className="h-3 w-3 shrink-0 -rotate-90 text-slate-400" />
          </Link>
        ))}
      </div>

      <Link
        to="/about-company/about"
        className="mt-3 inline-flex text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
      >
        Browse all resources →
      </Link>
    </div>
  );
}
