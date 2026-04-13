import { Fragment, useMemo } from "react";

/** Drop leading Admins when a Manager (or you) still remains — line manager stays visually on top. */
function chainForDisplay(chain) {
  const c = Array.isArray(chain) ? [...chain] : [];
  while (c.length > 2 && c[0]?.role === "Admin") {
    c.shift();
  }
  return c;
}

function HierarchyNode({ node, variant, topManagerStyle }) {
  const isYou = variant === "you";
  const isReport = variant === "report";
  const isSupervisor = variant === "manager";

  return (
    <div
      className={[
        "relative z-10 max-w-xs rounded-2xl border px-5 py-3 text-center shadow-sm",
        isYou
          ? "border-[#86BC25] bg-gradient-to-br from-emerald-50 to-white ring-2 ring-[#86BC25]/50 dark:border-[#86BC25]/70 dark:from-emerald-950/40 dark:to-slate-800 dark:ring-[#86BC25]/30"
          : isReport
            ? "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800/80"
            : topManagerStyle
              ? "border-2 border-brand-blue bg-brand-blue-soft shadow-brand dark:border-brand-blue/70 dark:bg-white/10"
              : "border border-stone-200/90 bg-brand-surface dark:border-stone-600 dark:bg-[#2a2520]",
      ].join(" ")}
    >
      <div
        className={[
          "text-[10px] font-semibold uppercase tracking-wider",
          isYou ? "text-emerald-700 dark:text-emerald-300" : "text-brand-blue dark:text-brand-green",
        ].join(" ")}
      >
        {isYou ? "You" : isSupervisor ? (node.role === "Manager" ? "Manager" : node.role) : node.role}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{node.name}</div>
      <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{node.email}</div>
      {node.business_unit && !isYou && (
        <div className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{node.business_unit}</div>
      )}
      {isYou && node.business_unit && (
        <div className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{node.business_unit}</div>
      )}
    </div>
  );
}

function VerticalConnector({ tall }) {
  return (
    <div
      className={[
        "w-0.5 shrink-0 bg-gradient-to-b from-brand-blue to-stone-300 dark:from-brand-green dark:to-stone-600",
        tall ? "h-6" : "h-4",
      ].join(" ")}
    />
  );
}

/** Manager (or you as team lead) on top; full team row beneath; your direct reports only under your card. */
function TeamUnderManagerTree({ team, viewerDirectReports, currentUserId }) {
  const { manager, members, viewer_is_manager_node: viewerIsRoot } = team;
  const topVariant = viewerIsRoot && manager.id === currentUserId ? "you" : "manager";

  return (
    <div className="flex min-w-[280px] flex-col items-center pb-2">
      <HierarchyNode
        node={manager}
        variant={topVariant}
        topManagerStyle={topVariant === "manager" || (viewerIsRoot && topVariant === "you")}
      />
      {members.length > 0 && (
        <>
          <VerticalConnector tall />
          <div className="h-0.5 w-full max-w-4xl shrink-0 bg-slate-300 dark:bg-slate-600" />
          <div className="flex w-full max-w-5xl flex-wrap justify-center gap-2 px-2 pt-1">
            {viewerIsRoot
              ? members.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex flex-col items-center"
                    style={{ flex: "1 1 140px", maxWidth: 220 }}
                  >
                    <div className="h-4 w-0.5 bg-slate-300 dark:bg-slate-600" />
                    <HierarchyNode node={emp} variant="report" topManagerStyle={false} />
                  </div>
                ))
              : members.map((m) => {
                  const isYou = m.id === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className="flex flex-col items-center"
                      style={{ flex: "1 1 140px", maxWidth: 220 }}
                    >
                      <div className="h-4 w-0.5 bg-slate-300 dark:bg-slate-600" />
                      <HierarchyNode node={m} variant={isYou ? "you" : "report"} topManagerStyle={false} />
                      {isYou && viewerDirectReports.length > 0 && (
                        <>
                          <VerticalConnector tall />
                          <div className="flex w-full flex-wrap justify-center gap-2">
                            {viewerDirectReports.map((emp) => (
                              <div key={emp.id} className="flex flex-col items-center" style={{ flex: "1 1 120px" }}>
                                <div className="h-3 w-0.5 bg-slate-300 dark:bg-slate-600" />
                                <HierarchyNode node={emp} variant="report" topManagerStyle={false} />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
          </div>
        </>
      )}

      {!viewerIsRoot && members.length === 0 && (
        <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
          No teammates are listed under this manager yet.
        </p>
      )}
    </div>
  );
}

/**
 * Shows line manager on top with everyone who reports to them (including you), then your own
 * direct reports under your card. If you have no manager but manage people, you appear on top with your team below.
 */
export default function ReportingHierarchyTree({ hierarchy, currentUserId }) {
  const team = hierarchy?.team_under_manager;
  const rawChain = Array.isArray(hierarchy?.chain) ? hierarchy.chain : [];
  const chain = useMemo(() => chainForDisplay(rawChain), [rawChain]);
  const rawDirect = Array.isArray(hierarchy?.direct_reports) ? hierarchy.direct_reports : [];
  const directReports = useMemo(() => {
    const ancestorIds = new Set(rawChain.filter((n) => n.id !== currentUserId).map((n) => n.id));
    return rawDirect.filter((r) => r.id !== currentUserId && !ancestorIds.has(r.id));
  }, [rawDirect, rawChain, currentUserId]);

  const useTeamView = team?.manager && Array.isArray(team.members);

  if (!useTeamView && chain.length === 0) return null;

  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Reporting hierarchy</h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        {useTeamView
          ? "Your manager is at the top; you and your teammates who share the same manager are listed together. If you manage people, they appear under your card."
          : "Managers above you in the org, your position, and—if you manage people—your direct reports."}
      </p>

      {useTeamView ? (
        <TeamUnderManagerTree team={team} viewerDirectReports={rawDirect} currentUserId={currentUserId} />
      ) : (
        <div className="flex min-w-[280px] flex-col items-center pb-2">
          {chain.map((node, i) => {
            const variant = node.id === currentUserId ? "you" : "manager";
            const topManagerStyle = variant === "manager" && i === 0;

            return (
              <Fragment key={node.id}>
                {i > 0 && <VerticalConnector tall />}
                <HierarchyNode node={node} variant={variant} topManagerStyle={topManagerStyle} />
              </Fragment>
            );
          })}

          {directReports.length > 0 && (
            <>
              <VerticalConnector tall />
              <div className="h-0.5 w-full max-w-2xl shrink-0 bg-slate-300 dark:bg-slate-600" />
              <div className="flex w-full max-w-4xl flex-wrap justify-center gap-0 px-2">
                {directReports.map((emp) => (
                  <div key={emp.id} className="flex flex-col items-center" style={{ flex: "1 1 140px", maxWidth: 200 }}>
                    <div className="h-4 w-0.5 bg-slate-300 dark:bg-slate-600" />
                    <HierarchyNode node={emp} variant="report" topManagerStyle={false} />
                  </div>
                ))}
              </div>
            </>
          )}

          {chain.length === 1 && directReports.length === 0 && (
            <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
              No manager is assigned in the directory yet. Ask an admin to set your manager if you should report to
              someone.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
