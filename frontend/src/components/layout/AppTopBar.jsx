import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { PAGE_GUTTER_X } from "../../constants/pageLayout";
import { usePortalNavItems } from "../../hooks/usePortalNavItems";

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function firstName(name = "") {
  const part = String(name).trim().split(/\s+/).filter(Boolean)[0];
  return part || "there";
}

function greetingForHour(h) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function TopBarNavLink({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-start gap-3 px-4 py-2.5 text-left text-sm transition",
          isActive
            ? "bg-[#eef2fb] font-semibold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]"
            : "text-[#000000] hover:bg-[#eef2fb] dark:text-white dark:hover:bg-white/5",
        ].join(" ")
      }
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block font-semibold leading-tight">{item.label}</span>
        <span className="mt-0.5 block text-xs text-[#5c5f66] dark:text-white/70">
          {item.desc}
        </span>
      </span>
    </NavLink>
  );
}

export default function AppTopBar({ darkMode, setDarkMode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { mainItems, adminItems } = usePortalNavItems(user?.role);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const greeting = `${greetingForHour(new Date().getHours())}, ${firstName(user?.name)}`;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!user) return null;

  const closeMenu = () => setOpen(false);

  return (
    <header
      className={`sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 py-3.5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-[#0f0f0f]/95 ${PAGE_GUTTER_X}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          AGC University
        </p>
        <p className="mt-0.5 truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl dark:text-white">
          {greeting}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
        </div>

        <Link
          to="/profile"
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0B3EAF] text-sm font-bold text-white shadow-md ring-2 ring-[#A7D344] ring-offset-2 ring-offset-white transition hover:bg-[#082d82] dark:ring-offset-[#0f0f0f]"
          aria-label="Open profile"
          title="Profile"
        >
          {user.profile_image_url ? (
            <img src={user.profile_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(user.name)
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-portal border border-slate-200/90 bg-white text-[#000000] shadow-sm transition hover:border-brand-red/35 hover:bg-[#fff8f7] dark:border-white/15 dark:bg-[#1a1a1a] dark:hover:border-brand-red/40 dark:hover:bg-[#221a1a]"
            aria-label="Open menu"
            aria-expanded={open ? "true" : "false"}
            aria-haspopup="true"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="flex w-[1.125rem] flex-col gap-[5px]" aria-hidden>
              <span className="h-[2px] w-full rounded-full bg-brand-red" />
              <span className="h-[2px] w-full rounded-full bg-brand-red" />
              <span className="h-[2px] w-full rounded-full bg-brand-red" />
            </span>
          </button>

          {open && (
            <div
              className="absolute right-0 z-50 mt-2 max-h-[min(32rem,78svh)] w-[min(20rem,calc(100vw-1.25rem))] overflow-y-auto rounded-portal border-2 border-[#0B3EAF]/15 bg-white py-1 shadow-lg dark:border-[#A7D344]/20 dark:bg-[#141414] lg:max-h-none lg:w-56 lg:overflow-visible"
              role="menu"
            >
              <div className="lg:hidden">
                <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[#5c5f66] dark:text-white/55">
                  Navigate
                </p>
                <div className="pb-1">
                  {mainItems.map((item) => (
                    <TopBarNavLink
                      key={item.to + (item.end ? "-e" : "")}
                      item={item}
                      onNavigate={closeMenu}
                    />
                  ))}
                </div>
                {adminItems.length > 0 ? (
                  <>
                    <p className="px-4 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#5c5f66] dark:text-white/55">
                      Administration
                    </p>
                    <div className="border-b border-[#0B3EAF]/10 pb-2 dark:border-white/10">
                      {adminItems.map((item) => (
                        <TopBarNavLink key={item.to} item={item} onNavigate={closeMenu} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="border-b border-[#0B3EAF]/10 dark:border-white/10" />
                )}
              </div>

              <button
                type="button"
                role="menuitem"
                className="w-full px-4 py-3 text-left text-sm text-[#000000] transition hover:bg-[#eef2fb] dark:text-white dark:hover:bg-white/5"
                onClick={() => {
                  setDarkMode(!darkMode);
                  setOpen(false);
                }}
              >
                <span className="font-semibold">Theme</span>
                <span className="mt-0.5 block text-xs text-[#0B3EAF] dark:text-[#A7D344]">
                  {darkMode ? "Dark" : "Light"} — tap to switch
                </span>
              </button>
              <div className="mx-2 border-t border-[#0B3EAF]/10 dark:border-white/10" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[#E02B20] transition hover:bg-[#E02B20]/10 dark:hover:bg-[#E02B20]/15"
                onClick={() => {
                  setOpen(false);
                  logout();
                  navigate("/login");
                }}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#E02B20] text-xs">
                  →
                </span>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
