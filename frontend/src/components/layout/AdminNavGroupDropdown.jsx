import { useState } from "react";
import { IconChevron } from "./SidebarIcons";

export function SidebarAdminGroupDropdown({ label, forceOpen = false, children }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-portal px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-white/85 transition hover:bg-black/10 dark:hover:bg-white/10"
        aria-expanded={isOpen}
      >
        <span>{label}</span>
        <IconChevron open={isOpen} className="h-3.5 w-3.5 shrink-0 text-white/75" />
      </button>
      {isOpen ? (
        <div className="mt-0.5 space-y-0.5 border-l-2 border-white/30 pl-2 dark:border-white/20">{children}</div>
      ) : null}
    </div>
  );
}

export function TopBarAdminGroupDropdown({ label, forceOpen = false, children }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#5c5f66] transition hover:bg-[#eef2fb] dark:text-white/55 dark:hover:bg-white/5"
        aria-expanded={isOpen}
      >
        <span>{label}</span>
        <IconChevron open={isOpen} className="h-3.5 w-3.5 shrink-0 text-[#0B3EAF]/70 dark:text-[#A7D344]/80" />
      </button>
      {isOpen ? (
        <div className="ml-3 border-l-2 border-[#0B3EAF]/15 dark:border-white/10">{children}</div>
      ) : null}
    </div>
  );
}
