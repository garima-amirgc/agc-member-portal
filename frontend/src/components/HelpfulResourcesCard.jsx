import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import {
  IconInfo,
  IconHeart,
  IconLink,
  IconGlobe,
  IconClipboard,
  IconDocument,
  IconChevron,
} from "./layout/SidebarIcons";

// Static section links (all open the about-company page)
const SECTION_ITEMS = [
  { label: "Employee Handbook", icon: IconInfo,      to: "/about-company" },
  { label: "Benefits",          icon: IconHeart,     to: "/about-company" },
  { label: "Links to Portal",   icon: IconLink,      to: "/about-company" },
  { label: "Links to websites", icon: IconGlobe,     to: "/about-company" },
  { label: "Forms",             icon: IconClipboard, to: "/about-company" },
];

export default function HelpfulResourcesCard() {
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    api
      .get("/resources/facility/AGC/category/general/documents")
      .then((r) => setDocs(Array.isArray(r.data?.documents) ? r.data.documents : []))
      .catch(() => setDocs([]));
  }, []);

  return (
    <div className="card relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B3EAF] to-[#A7D344]" aria-hidden />
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        Helpful Resources
      </h2>

      <div className="mt-3 space-y-2">
        {/* Static section links */}
        {SECTION_ITEMS.map(({ to, icon: Icon, label }) => (
          <Link
            key={label}
            to={to}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:text-slate-200"
          >
            <Icon className="h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" />
            <span className="min-w-0 flex-1">{label}</span>
            <IconChevron className="h-3 w-3 shrink-0 -rotate-90 text-slate-400" />
          </Link>
        ))}

        {/* Dynamic AGC resource documents */}
        {docs.map((doc) => {
          const href = doc.url ? resolvePublicMediaUrl(doc.url) : doc.file_url || "";
          return (
            <a
              key={doc.id}
              href={href || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-[#0B3EAF]/30 hover:shadow-sm dark:border-slate-700 dark:text-slate-200"
            >
              <IconDocument className="h-4 w-4 shrink-0 text-[#0B3EAF] dark:text-[#A7D344]" />
              <span className="min-w-0 flex-1">{doc.title}</span>
              <IconChevron className="h-3 w-3 shrink-0 -rotate-90 text-slate-400" />
            </a>
          );
        })}
      </div>

      <Link
        to="/about-company"
        className="mt-3 inline-flex text-[11px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
      >
        Browse all resources →
      </Link>
    </div>
  );
}
