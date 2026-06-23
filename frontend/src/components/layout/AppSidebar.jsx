import { NavLink, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../../constants/branding";
import { useAuth } from "../../context/AuthContext";
import { usePortalNavItems } from "../../hooks/usePortalNavItems";
import { useMyOpenTicketCount } from "../../hooks/useMyOpenTicketCount";
import { adminNavGroupLabel } from "../../constants/adminNavGroups";
import { isFacilityUniversityOnlyPortal } from "../../utils/facilityUniversityOnly";
import { COMPANY_CONTENT_NAV_TITLE } from "../../constants/companyContentConfig";
import { IconBuilding, IconChevron, IconHelp, IconSearch, IconSparkle } from "./SidebarIcons";
import { SidebarAdminGroupDropdown } from "./AdminNavGroupDropdown";
import api from "../../services/api";
import { resolvePublicMediaUrl } from "../../utils/mediaUrl";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const CATEGORY_COLORS = {
  "People": "text-[#0B3EAF]",
  "New Hires": "text-[#0B3EAF]",
  "Employee of the Month": "text-[#A7D344]",
  "Leadership Update": "text-[#0B3EAF]",
  "Customer Win": "text-[#A7D344]",
  "Community Involvement": "text-[#0B3EAF]",
  "Upcoming Event": "text-[#A7D344]",
  "IT Ticket": "text-slate-500",
};

function SearchResultItem({ result, onNavigate }) {
  const navigate = useNavigate();
  const img = result.image ? resolvePublicMediaUrl(result.image) : "";
  const initials = String(result.subtitle || result.title || "?")[0]?.toUpperCase() || "?";

  const handleClick = () => {
    navigate(result.link);
    onNavigate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-white/10"
    >
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 dark:bg-white/10">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[#0B3EAF] dark:text-[#A7D344]">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-white">{result.title}</p>
        {result.subtitle ? (
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{result.subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}

function SearchDropdown({ results, loading, query, onNavigate }) {
  if (!query || query.length < 2) return null;

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category).push(r);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#1a1a1a]">
      {loading ? (
        <p className="px-3 py-3 text-[11px] text-slate-500">Searching…</p>
      ) : grouped.length === 0 ? (
        <p className="px-3 py-3 text-[11px] text-slate-500">No results for "{query}"</p>
      ) : (
        <div className="p-1.5">
          {grouped.map(([category, items]) => (
            <div key={category} className="mb-2 last:mb-0">
              <p className={`px-2 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest ${CATEGORY_COLORS[category] || "text-slate-400"}`}>
                {category}
              </p>
              {items.map((r, i) => (
                <SearchResultItem key={`${category}-${i}`} result={r} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SIDEBAR_WIDTH_PX = 200;
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

function NavSection({ title, icon: Icon, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
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
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchWrapRef = useRef(null);
  const debouncedQuery = useDebounce(query.trim(), 300);

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

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }
    let alive = true;
    setSearchLoading(true);
    setDropdownOpen(true);
    api.get("/search", { params: { q: debouncedQuery } })
      .then((r) => {
        if (!alive) return;
        setSearchResults(Array.isArray(r.data?.results) ? r.data.results : []);
      })
      .catch(() => { if (alive) setSearchResults([]); })
      .finally(() => { if (alive) setSearchLoading(false); });
    return () => { alive = false; };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setQuery("");
    setSearchResults([]);
  }, []);

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

        <div ref={searchWrapRef} className="relative mt-4">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5c5f66]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (debouncedQuery.length >= 2) setDropdownOpen(true); }}
              onKeyDown={(e) => { if (e.key === "Escape") closeDropdown(); }}
              placeholder="Search…"
              className="h-8 w-full rounded-portal border border-white/40 bg-white/95 py-1 pl-8 pr-2.5 text-xs leading-tight text-[#000000] placeholder:text-[#5c5f66] shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-2 focus:ring-[#0B3EAF]/30 dark:border-white/30 dark:bg-white/95"
            />
          </label>
          {dropdownOpen ? (
            <SearchDropdown
              results={searchResults}
              loading={searchLoading}
              query={debouncedQuery}
              onNavigate={closeDropdown}
            />
          ) : null}
        </div>
      </div>

      <nav className="agc-sidebar-nav-scroll flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2.5">
        <div className="space-y-0.5">
          {filteredMain.map((item) => (
            <NavItem
              key={item.to + (item.end ? "-e" : "")}
              {...item}
              badge={item.to === "/it-tickets" ? ticketBadgeCount : 0}
            />
          ))}
        </div>

        {filteredAboutCompany.length > 0 ? (
          <NavSection title={COMPANY_CONTENT_NAV_TITLE} icon={IconBuilding} defaultOpen={!!q}>
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
          <p className="px-2 py-4 text-center text-xs text-white/80">No matches</p>
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
