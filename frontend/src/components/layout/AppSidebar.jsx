import { NavLink } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { usePortalNavItems } from "../../hooks/usePortalNavItems";
import {
  IconChevron,
  IconHelp,
  IconSearch,
  IconSparkle,
} from "./SidebarIcons";

function NavItem({ to, end, icon: Icon, label, desc }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "group relative flex items-start gap-3 rounded-portal px-3 py-2.5 pl-3.5 transition",
          isActive
            ? "agc-nav-active"
            : "text-white hover:bg-black/10 dark:text-white dark:hover:bg-white/10",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-[#E02B20]"
              aria-hidden
            />
          ) : null}
          <Icon
            className={[
              "mt-0.5 h-5 w-5 shrink-0 transition",
              isActive ? "text-inherit" : "text-white/90 dark:text-white/90",
            ].join(" ")}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{label}</div>
            <div
              className={[
                "mt-0.5 text-xs leading-snug",
                isActive ? "text-black/70 dark:text-black/70" : "text-white/75 dark:text-white/75",
              ].join(" ")}
            >
              {desc}
            </div>
          </div>
        </>
      )}
    </NavLink>
  );
}

function NavSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-portal px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-black/10 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        <span>{title}</span>
        <IconChevron open={open} className="h-4 w-4 text-white/80" />
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 border-l-2 border-white/35 pl-3 dark:border-white/25">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function AppSidebar() {
  const { user } = useAuth();
  const { mainItems, adminItems, homeTo } = usePortalNavItems(user?.role);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const match = (item) =>
    !q || item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q);

  const filteredMain = mainItems.filter(match);
  const filteredAdmin = adminItems.filter(match);
  const showAdminSection = user?.role === "Admin" && (filteredAdmin.length > 0 || !q);

  if (!user) return null;

  return (
    <aside className="agc-sidebar-shell z-20 hidden w-[288px] shrink-0 flex-col border-r border-black/10 lg:sticky lg:top-0 lg:flex lg:h-dvh">
      <div className="border-b border-black/10 px-4 py-5 dark:border-white/15">
        <NavLink
          to={homeTo}
          className="flex flex-col items-center gap-2.5 text-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B3EAF] rounded-portal"
        >
          <img
            src="/agc-group-logo.png"
            alt="AGC GROUP"
            className="h-[4.5rem] w-auto max-w-[200px] object-contain object-center"
          />
          <div>
            <div className="text-lg font-bold leading-tight tracking-tight text-white">AGC University</div>
            <div className="mt-1 text-xs font-medium leading-snug text-white/75">Learning &amp; compliance</div>
          </div>
        </NavLink>

        <label className="relative mt-4 block">
          <span className="sr-only">Search menu</span>
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5c5f66]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 w-full rounded-portal border border-white/40 bg-white/95 py-1 pl-8 pr-2.5 text-xs leading-tight text-[#000000] placeholder:text-[#5c5f66] shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/30 dark:border-white/30 dark:bg-white/95"
          />
        </label>
      </div>

      <nav className="agc-sidebar-nav-scroll flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3">
        <div className="space-y-0.5">
          {filteredMain.map((item) => (
            <NavItem key={item.to + (item.end ? "-e" : "")} {...item} />
          ))}
        </div>

        {showAdminSection ? (
          <NavSection title="Administration" defaultOpen>
            {filteredAdmin.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </NavSection>
        ) : null}

        {q && !filteredMain.length && !(showAdminSection && filteredAdmin.length) ? (
          <p className="px-2 py-4 text-center text-sm text-white/80">No matches</p>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-black/10 p-3 dark:border-white/15">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 rounded-portal px-3 py-2 text-sm font-medium text-white hover:bg-black/10 dark:hover:bg-white/10"
        >
          <IconHelp className="h-5 w-5 text-white" />
          Help
        </NavLink>
        <a
          href="#"
          className="mt-0.5 flex items-center gap-3 rounded-portal px-3 py-2 text-sm font-medium text-white hover:bg-black/10 dark:hover:bg-white/10"
          onClick={(e) => e.preventDefault()}
        >
          <IconSparkle className="h-5 w-5 text-[#E02B20]" />
          What&apos;s new
        </a>
      </div>
    </aside>
  );
}
