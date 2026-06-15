import { NavLink } from "react-router-dom";
import { useMemo, useState } from "react";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../../constants/branding";
import { useAuth } from "../../context/AuthContext";
import { usePortalNavItems } from "../../hooks/usePortalNavItems";
import { adminNavGroupLabel } from "../../constants/adminNavGroups";
import { isFacilityUniversityOnlyPortal } from "../../utils/facilityUniversityOnly";
import { IconBuilding, IconChevron, IconHelp, IconSearch, IconSparkle } from "./SidebarIcons";
import { SidebarAdminGroupDropdown } from "./AdminNavGroupDropdown";

const SIDEBAR_WIDTH_PX = 200;
const sidebarShellStyle = {
  width: SIDEBAR_WIDTH_PX,
  minWidth: SIDEBAR_WIDTH_PX,
  maxWidth: SIDEBAR_WIDTH_PX,
  flexBasis: SIDEBAR_WIDTH_PX,
};

function NavItem({ to, end, icon: Icon, label, desc }) {
  const sub = desc?.trim();
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
            {sub ? (
              <div
                className={[
                  "mt-0.5 text-xs leading-snug",
                  isActive ? "text-black/70 dark:text-black/70" : "text-white/75 dark:text-white/75",
                ].join(" ")}
              >
                {sub}
              </div>
            ) : null}
          </div>
        </>
      )}
    </NavLink>
  );
}

function NavSection({ title, icon: Icon, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-portal px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-black/10 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-white/90" aria-hidden /> : null}
        <span className="min-w-0 flex-1">{title}</span>
        <IconChevron open={open} className="h-4 w-4 shrink-0 text-white/80" />
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
  const { mainItems, adminGroups, aboutCompanyItems, homeTo } = usePortalNavItems(user);
  const universityOnly = isFacilityUniversityOnlyPortal(user);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const match = (item) =>
    !q ||
    item.label.toLowerCase().includes(q) ||
    (item.desc && String(item.desc).toLowerCase().includes(q)) ||
    (item.group && adminNavGroupLabel(item.group).toLowerCase().includes(q));

  const filteredMain = mainItems.filter(match);
  const filteredAboutCompany = aboutCompanyItems.filter(match);
  const filteredAdminGroups = useMemo(
    () =>
      adminGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(match),
        }))
        .filter((group) => group.items.length > 0),
    [adminGroups, q],
  );
  const filteredAdminCount = filteredAdminGroups.reduce((sum, group) => sum + group.items.length, 0);
  const showAdminSection = filteredAdminCount > 0 || (user?.role === "Admin" && !q);

  if (!user) return null;

  return (
    <aside
      className="agc-sidebar-shell z-20 hidden shrink-0 flex-col border-r border-black/10 lg:sticky lg:top-0 lg:flex lg:h-dvh"
      style={sidebarShellStyle}
    >
      <div className="border-b border-black/10 px-3 py-4 dark:border-white/15">
        <NavLink
          to={homeTo}
          className="flex flex-col items-center gap-2.5 text-center text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B3EAF] rounded-portal"
        >
          <img
            src={AMIR_GROUP_LOGO_SRC}
            alt="AMIR Group of Companies"
            className="h-auto w-[168px] max-w-full shrink-0 object-contain object-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
          />
          <div className="text-base font-bold leading-tight tracking-tight text-white">{APP_DISPLAY_NAME}</div>
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

      <nav className="agc-sidebar-nav-scroll flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2.5">
        <div className="space-y-0.5">
          {filteredMain.map((item) => (
            <NavItem key={item.to + (item.end ? "-e" : "")} {...item} />
          ))}
        </div>

        {filteredAboutCompany.length > 0 ? (
          <NavSection title="About Company" icon={IconBuilding} defaultOpen={!!q}>
            {filteredAboutCompany.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </NavSection>
        ) : null}

        {showAdminSection ? (
          <NavSection title="Administration" defaultOpen>
            {filteredAdminGroups.map((group) => (
              <SidebarAdminGroupDropdown key={group.key} label={group.label} forceOpen={!!q}>
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </SidebarAdminGroupDropdown>
            ))}
          </NavSection>
        ) : null}

        {q && !filteredMain.length && !(showAdminSection && filteredAdminCount) ? (
          <p className="px-2 py-4 text-center text-sm text-white/80">No matches</p>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-black/10 p-3 dark:border-white/15">
        {!universityOnly ? (
          <>
            <button
              type="button"
              className="group relative flex w-full items-center gap-3 rounded-portal px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.18)] active:scale-[0.99] dark:hover:bg-white/10"
              onClick={() => {
                window.dispatchEvent(new Event("agc:whats-new"));
              }}
            >
              <span className="relative">
                <IconSparkle className="h-5 w-5 text-white transition-transform duration-300 group-hover:scale-[1.08]" />
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#A7D344] shadow-[0_0_0_2px_rgba(255,255,255,0.25)]"
                />
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-[#A7D344]/80"
                />
              </span>
              <span className="relative">
                What's new
                <span
                  aria-hidden
                  className="ml-2 inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white/90 ring-1 ring-white/20 transition group-hover:bg-white/20"
                >
                  NEW
                </span>
              </span>
            </button>
            <NavLink
              to="/help"
              className="flex items-center gap-3 rounded-portal px-3 py-2 text-sm font-medium text-white hover:bg-black/10 dark:hover:bg-white/10"
            >
              <IconHelp className="h-5 w-5 text-white" />
              Help
            </NavLink>
          </>
        ) : null}
      </div>
    </aside>
  );
}
