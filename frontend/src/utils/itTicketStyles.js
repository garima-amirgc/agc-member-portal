/** Brand-aligned chips and badges for IT ticket UI */

/** Issue type as stored in ticket title prefix, e.g. `[Hardware] …` */
export function issueTypeFromTicketTitle(title) {
  const raw = String(title || "");
  const m = raw.match(/^\s*\[([^\]]+)\]\s*/);
  return (m?.[1] || "").trim();
}

export function ticketMatchesIssueTypeFilter(ticket, typeFilterKey) {
  if (typeFilterKey === "all") return true;
  const label = issueTypeFromTicketTitle(ticket?.title);
  return label === typeFilterKey;
}

export const IT_TYPE_FILTER_TABS = [
  {
    key: "all",
    label: "All types",
    active:
      "bg-white text-[#0B3EAF] shadow-md ring-2 ring-white/80 dark:bg-[#141414] dark:text-[#A7D344] dark:ring-[#A7D344]/40",
    idle: "bg-white/15 text-white hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20",
  },
  {
    key: "Hardware",
    label: "Hardware",
    active: "bg-sky-300 text-sky-950 shadow-md ring-2 ring-sky-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "Software",
    label: "Software",
    active: "bg-violet-300 text-violet-950 shadow-md ring-2 ring-violet-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "Report Access",
    label: "Report access",
    active: "bg-amber-300 text-amber-950 shadow-md ring-2 ring-amber-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "Report",
    label: "Report",
    active: "bg-orange-300 text-orange-950 shadow-md ring-2 ring-orange-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "Other",
    label: "Other",
    active: "bg-rose-300 text-rose-950 shadow-md ring-2 ring-rose-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
];

export const IT_FILTER_TABS = [
  {
    key: "all",
    label: "All",
    active: "bg-white text-[#0B3EAF] shadow-md ring-2 ring-white/80 dark:bg-[#141414] dark:text-[#A7D344] dark:ring-[#A7D344]/40",
    idle: "bg-white/15 text-white hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20",
  },
  {
    key: "open",
    label: "Open",
    active: "bg-[#A7D344] text-[#0a0a0a] shadow-md ring-2 ring-[#A7D344]/60",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "in_progress",
    label: "In progress",
    active: "bg-amber-300 text-amber-950 shadow-md ring-2 ring-amber-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
  {
    key: "closed",
    label: "Completed",
    active: "bg-emerald-300 text-emerald-950 shadow-md ring-2 ring-emerald-200/80",
    idle: "bg-white/15 text-white hover:bg-white/25",
  },
];

export function issueTypeBadgeClass(label) {
  const k = String(label || "").toLowerCase();
  if (k.includes("hardware")) {
    return "bg-sky-100 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-800";
  }
  if (k.includes("software")) {
    return "bg-violet-100 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:ring-violet-800";
  }
  if (k.includes("report access")) {
    return "bg-amber-100 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800";
  }
  if (k === "report" || k.includes("report")) {
    return "bg-orange-100 text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-800";
  }
  if (k.includes("other")) {
    return "bg-rose-100 text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800";
  }
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15";
}

export const ISSUE_TYPE_PILL_STYLES = {
  hardware: {
    active: "border-[#0B3EAF] bg-[rgba(11,62,175,0.12)] text-[#0B3EAF] ring-2 ring-[#0B3EAF]/30 dark:bg-[rgba(11,62,175,0.35)] dark:text-white",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-[#0B3EAF]/40 hover:bg-sky-50 dark:border-white/10 dark:bg-[#141414] dark:text-slate-200",
  },
  software: {
    active: "border-violet-600 bg-violet-50 text-violet-900 ring-2 ring-violet-300/50 dark:bg-violet-950/40 dark:text-violet-200",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-[#141414]",
  },
  report_access: {
    active: "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-300/50 dark:bg-amber-950/40 dark:text-amber-200",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 dark:border-white/10 dark:bg-[#141414]",
  },
  report: {
    active: "border-orange-500 bg-orange-50 text-orange-950 ring-2 ring-orange-300/50 dark:bg-orange-950/40 dark:text-orange-200",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-[#141414]",
  },
  other: {
    active: "border-rose-500 bg-rose-50 text-rose-950 ring-2 ring-rose-300/50 dark:bg-rose-950/40 dark:text-rose-200",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 dark:border-white/10 dark:bg-[#141414]",
  },
};

export const FORM_FIELD =
  "w-full rounded-xl border-2 border-slate-200/90 bg-white px-4 py-3 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#0B3EAF] focus:ring-4 focus:ring-[#0B3EAF]/12 dark:border-white/12 dark:bg-[#141414] dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/15";

export const FORM_LABEL = "mb-2 block text-xs font-bold uppercase tracking-wide text-[#0B3EAF] dark:text-[#A7D344]";

export const TICKET_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function priorityBadgeLabel(priority) {
  const key = String(priority || "medium").toLowerCase();
  return TICKET_PRIORITY_OPTIONS.find((o) => o.value === key)?.label || "Medium";
}

export function priorityBadgeClass(priority) {
  const key = String(priority || "medium").toLowerCase();
  if (key === "urgent") {
    return "bg-red-100 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800";
  }
  if (key === "high") {
    return "bg-orange-100 text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-800";
  }
  if (key === "low") {
    return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15";
  }
  return "bg-blue-100 text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800";
}
