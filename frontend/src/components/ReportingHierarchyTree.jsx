import { Fragment, useMemo } from "react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function chainForDisplay(chain) {
  const c = Array.isArray(chain) ? [...chain] : [];
  while (c.length > 2 && c[0]?.role === "Admin") c.shift();
  return c;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

function designation(node) {
  return node?.adp_job_title || node?.designation || "";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_SIZES = {
  xl: "h-20 w-20 text-xl",
  lg: "h-14 w-14 text-base",
  md: "h-12 w-12 text-sm",
  sm: "h-9  w-9  text-xs",
};

function Avatar({ name, imageUrl, size = "md", variant = "default" }) {
  const sz = AVATAR_SIZES[size] ?? AVATAR_SIZES.md;
  const ring = {
    you:        "shadow-[0_0_0_4px_rgba(167,211,68,0.28)]",
    supervisor: "shadow-[0_0_0_4px_rgba(11,62,175,0.25)]",
    report:     "shadow-[0_0_0_3px_rgba(11,62,175,0.18)]",
    default:    "shadow-sm",
  }[variant] ?? "shadow-sm";
  const bg = {
    you:        "from-[#A7D344] to-[#6ea017]",
    supervisor: "from-[#0B3EAF] to-[#0d4fd9]",
    report:     "from-[#1a5fd4] to-[#0B3EAF]",
    default:    "from-slate-400 to-slate-500",
  }[variant] ?? "from-slate-400 to-slate-500";

  const base = `${sz} ${ring} ring-[3px] ring-white dark:ring-slate-900 rounded-full shrink-0 relative z-10`;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <div className={`${base} bg-gradient-to-br ${bg} flex items-center justify-center font-bold text-white`}>
      {initials(name)}
    </div>
  );
}

// ─── ADP badge ────────────────────────────────────────────────────────────────

function AdpBadge() {
  return (
    <span
      title="Reporting line sourced from ADP Workforce Now"
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#0B3EAF]/10 text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]"
    >
      ✦ ADP
    </span>
  );
}

// ─── Connectors ───────────────────────────────────────────────────────────────

const LINE = "bg-[#0B3EAF]/20 dark:bg-[#A7D344]/15";

function VLine({ h = "h-8" }) {
  return (
    <div className="flex justify-center">
      <div className={`w-px ${h} ${LINE}`} />
    </div>
  );
}

/**
 * Top connector for each child in a multi-child row.
 *
 * position:
 *   "only"   → straight vertical line
 *   "first"  → bar center→right + vertical stub
 *   "middle" → bar full width + vertical stub
 *   "last"   → bar left→center + vertical stub
 *
 * Columns must have gap-0 so bar segments from adjacent columns join.
 */
function BranchConnector({ position }) {
  if (position === "only") return <VLine />;

  return (
    <div className="relative h-8 w-full">
      {position === "first"  && <div className={`absolute top-0 left-1/2 right-0 h-px ${LINE}`} />}
      {position === "middle" && <div className={`absolute top-0 inset-x-0 h-px ${LINE}`} />}
      {position === "last"   && <div className={`absolute top-0 left-0 right-1/2 h-px ${LINE}`} />}
      <div className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${LINE}`} />
    </div>
  );
}

// ─── Org node: avatar floating above a name card ──────────────────────────────

/**
 * cardW controls the card (and therefore column) width.
 * The avatar overlaps the top edge of the card using negative margin.
 */
function OrgNode({ node, variant = "default", size = "md", showAdp = false, cardW = "w-32" }) {
  const desig = designation(node);
  const isYou  = variant === "you";
  const isSup  = variant === "supervisor";

  // Card border colour
  const border = isYou
    ? "border-2 border-[#A7D344]"
    : isSup
    ? "border-2 border-[#0B3EAF]/60 dark:border-[#0B3EAF]/40"
    : "border border-slate-200 dark:border-slate-600/70";

  // Avatar size in px (for the overlap offset)
  const avatarPx = { xl: 80, lg: 56, md: 48, sm: 36 }[size] ?? 48;
  const overlap  = 20; // px the card slides up under the avatar
  const cardPtPx = avatarPx - overlap + 8; // padding-top so text clears avatar

  return (
    <div className={`flex flex-col items-center ${cardW}`}>
      {/* Avatar — z-10 so it renders above the card */}
      <Avatar name={node.name} imageUrl={node.profile_image_url} size={size} variant={variant} />

      {/* Card slides up under avatar */}
      <div
        className={`w-full rounded-2xl bg-white dark:bg-slate-800 shadow-sm ${border} text-center px-2 pb-2.5`}
        style={{ marginTop: -overlap, paddingTop: cardPtPx }}
      >
        <p className={`text-[11px] font-bold leading-snug ${isYou ? "text-[#4a7a00] dark:text-[#A7D344]" : "text-slate-800 dark:text-slate-100"}`}>
          {node.name}
        </p>
        {desig && (
          <p className="mt-0.5 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
            {desig}
          </p>
        )}
        {showAdp && (
          <div className="mt-1.5 flex justify-center">
            <AdpBadge />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── One column in the direct-reports row ─────────────────────────────────────

function DirectReportCol({ person, position }) {
  const subs      = Array.isArray(person.direct_reports) ? person.direct_reports : [];
  const adpPlaced = person.manager_source === "adp";

  return (
    <div className="flex flex-col items-center w-24">
      <BranchConnector position={position} />
      <OrgNode node={person} variant="report" size="md" showAdp={adpPlaced} cardW="w-full" />

      {/* Second-level reports */}
      {subs.length > 0 && (
        <div className="flex flex-col items-center w-full">
          <VLine h="h-6" />
          {subs.length === 1 ? (
            <OrgNode node={subs[0]} variant="default" size="sm" showAdp={subs[0].manager_source === "adp"} cardW="w-full" />
          ) : (
            <div className="flex gap-0">
              {subs.map((s, si) => (
                <div key={s.id} className="w-20">
                  <BranchConnector
                    position={si === 0 ? "first" : si === subs.length - 1 ? "last" : "middle"}
                  />
                  <OrgNode node={s} variant="default" size="sm" showAdp={s.manager_source === "adp"} cardW="w-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Full direct-reports row ───────────────────────────────────────────────────

function DirectReportsSection({ reports }) {
  if (!reports.length) return null;
  const single = reports.length === 1;

  return (
    <div className="flex flex-col items-center">
      <VLine h="h-8" />
      {/* gap-0 so BranchConnector segments join into one continuous bar */}
      <div className="flex gap-0">
        {reports.map((emp, i) => (
          <DirectReportCol
            key={emp.id}
            person={emp}
            position={
              single          ? "only"
              : i === 0       ? "first"
              : i === reports.length - 1 ? "last"
              : "middle"
            }
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ReportingHierarchyTree({ hierarchy, currentUserId, team = [] }) {
  const rawChain  = Array.isArray(hierarchy?.chain) ? hierarchy.chain : [];
  const chain     = useMemo(() => chainForDisplay(rawChain), [rawChain]);
  const rawDirect = Array.isArray(hierarchy?.direct_reports) ? hierarchy.direct_reports : [];

  const directReports = useMemo(() => {
    const ancestorIds = new Set(chain.filter((n) => n.id !== currentUserId).map((n) => n.id));
    return rawDirect.filter((r) => r.id !== currentUserId && !ancestorIds.has(r.id));
  }, [rawDirect, chain, currentUserId]);

  const selfIndex = chain.findIndex((n) => n.id === currentUserId);
  const ancestors = selfIndex >= 0 ? chain.slice(0, selfIndex) : chain.slice(0, -1);
  const selfNode  = selfIndex >= 0 ? chain[selfIndex] : chain[chain.length - 1] ?? null;

  if (!selfNode && chain.length === 0 && directReports.length === 0) return null;

  const hasAdp = [
    ...ancestors,
    ...directReports,
    ...directReports.flatMap((r) => r.direct_reports ?? []),
  ].some((n) => n?.manager_source === "adp");

  return (
    <section className="card">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Reporting hierarchy
        </h2>
        {hasAdp && (
          <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
            </svg>
            Reporting lines synced from ADP Workforce Now
          </span>
        )}
      </div>

      {/* Tree */}
      <div className="overflow-x-auto">
        <div className="flex flex-col items-center pb-4 min-w-max mx-auto">

          {/* Supervisor chain */}
          {ancestors.map((node, i) => {
            const subordinate = i < ancestors.length - 1 ? ancestors[i + 1] : selfNode;
            const adpPlaced   = subordinate?.manager_source === "adp";
            return (
              <Fragment key={node.id}>
                {i > 0 && <VLine h="h-8" />}
                <OrgNode
                  node={adpPlaced ? { ...node, manager_source: "adp" } : node}
                  variant="supervisor"
                  size="lg"
                  showAdp={adpPlaced}
                  cardW="w-32"
                />
              </Fragment>
            );
          })}

          {/* "You" node */}
          {selfNode && (
            <>
              {ancestors.length > 0 && <VLine h="h-8" />}
              <OrgNode node={selfNode} variant="you" size="xl" showAdp={selfNode?.manager_source === "adp"} cardW="w-36" />
            </>
          )}

          {/* Direct reports */}
          <DirectReportsSection reports={directReports} />

          {/* Empty states */}
          {selfNode && ancestors.length === 0 && directReports.length === 0 && (
            <p className="mt-6 max-w-xs text-center text-sm text-slate-500 dark:text-slate-400">
              No one is linked to your reporting line yet.
            </p>
          )}
          {!selfNode && (
            <p className="mt-6 max-w-xs text-center text-sm text-slate-500 dark:text-slate-400">
              No reporting line is set up yet — ask an admin to assign your manager.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
