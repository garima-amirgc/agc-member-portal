import { NavLink } from "react-router-dom";
import { useState } from "react";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../../constants/branding";
import { useAuth } from "../../context/AuthContext";
import { usePortalNavItems } from "../../hooks/usePortalNavItems";
import { useMyOpenTicketCount } from "../../hooks/useMyOpenTicketCount";
import { useMyNpdActionCount } from "../../hooks/useMyNpdActionCount";
import { isFacilityUniversityOnlyPortal } from "../../utils/facilityUniversityOnly";
import { IconBuilding, IconChevron, IconHelp, IconSparkle } from "./SidebarIcons";
import { SidebarAdminGroupDropdown } from "./AdminNavGroupDropdown";
import { COMPANY_CONTENT_NAV_TITLE } from "../../constants/companyContentConfig";

const SIDEBAR_WIDTH_PX = 260;
const sidebarShellStyle = {
  width: SIDEBAR_WIDTH_PX,
  minWidth: SIDEBAR_WIDTH_PX,
  maxWidth: SIDEBAR_WIDTH_PX,
  flexBasis: SIDEBAR_WIDTH_PX,
};

function NavItem({ to, end, icon: Icon, label, desc, badge }) {
  const sub = desc?.trim();
  const showBadge = Number(badge) > 0;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "group relative flex items-start gap-2.5 rounded-portal px-2.5 py-2 pl-3 transition",
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
              "mt-0.5 h-4 w-4 shrink-0 transition",
              isActive ? "text-inherit" : "text-white/90 dark:text-white/90",
            ].join(" ")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-semibold leading-tight">{label}</div>
              {showBadge ? (
                <span
                  className={[
                    "inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                    isActive ? "bg-[#0B3EAF] text-white" : "bg-[#E02B20] text-white",
                  ].join(" ")}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </div>
            {sub ? (
              <div
                className={[
                  "mt-0.5 text-[11px] leading-snug",
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

function NavSection({ title, icon: Icon, defaultOpen, to, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      {to ? (
        /* Title = NavLink to hub; chevron = separate collapse toggle */
        <div className="flex items-center">
          <NavLink
            to={to}
            end
            className={({ isActive }) =>
              [
                "flex flex-1 items-center gap-2.5 rounded-l-portal px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-black/10 dark:hover:bg-white/10",
                isActive ? "bg-white/10" : "",
              ].join(" ")
            }
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0 text-white/90" aria-hidden /> : null}
            <span className="min-w-0 flex-1">{title}</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center rounded-r-portal px-2 py-2 text-white/80 transition hover:bg-black/10 dark:hover:bg-white/10"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          >
            <IconChevron open={open} className="h-3.5 w-3.5 text-white/80" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-portal px-2.5 py-2 text-left text-xs font-semibold text-white transition hover:bg-black/10 dark:hover:bg-white/10"
          aria-expanded={open}
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-white/90" aria-hidden /> : null}
          <span className="min-w-0 flex-1">{title}</span>
          <IconChevron open={open} className="h-3.5 w-3.5 shrink-0 text-white/80" />
        </button>
      )}
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
  const ticketBadgeCount = useMyOpenTicketCount(user);
  const npdBadgeCount = useMyNpdActionCount(user);
  const showAdminSection = adminGroups.length > 0 || user?.role === "Admin";

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
          <div className="text-sm font-bold leading-tight tracking-tight text-white">{APP_DISPLAY_NAME}</div>
        </NavLink>

      </div>

      <nav className="agc-sidebar-nav-scroll flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2.5">
        <div className="space-y-0.5">
          {mainItems.map((item) => (
            <NavItem
              key={item.to + (item.end ? "-e" : "")}
              {...item}
              badge={item.to === "/it-tickets" ? ticketBadgeCount : item.to === "/npd" ? npdBadgeCount : 0}
            />
          ))}
        </div>

        <NavItem to="/about-company" end icon={IconBuilding} label={COMPANY_CONTENT_NAV_TITLE} />

        {showAdminSection ? (
          <NavSection title="Administration" defaultOpen>
            {adminGroups.map((group) => (
              <SidebarAdminGroupDropdown key={group.key} label={group.label} forceOpen={false}>
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </SidebarAdminGroupDropdown>
            ))}
          </NavSection>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-black/10 p-3 dark:border-white/15">
        {!universityOnly ? (
          <>
            <button
              type="button"
              className="group relative flex w-full items-center gap-2.5 rounded-portal px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-black/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.18)] active:scale-[0.99] dark:hover:bg-white/10"
              onClick={() => {
                window.dispatchEvent(new Event("agc:whats-new"));
              }}
            >
              <span className="relative">
                <IconSparkle className="h-4 w-4 text-white transition-transform duration-300 group-hover:scale-[1.08]" />
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
                  className="ml-1.5 inline-flex items-center rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/90 ring-1 ring-white/20 transition group-hover:bg-white/20"
                >
                  NEW
                </span>
              </span>
            </button>
            <NavLink
              to="/help"
              className="flex items-center gap-2.5 rounded-portal px-2.5 py-2 text-xs font-medium text-white hover:bg-black/10 dark:hover:bg-white/10"
            >
              <IconHelp className="h-4 w-4 text-white" />
              Help
            </NavLink>
          </>
        ) : null}
      </div>
    </aside>
  );
}
