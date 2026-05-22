import { Fragment, useMemo } from "react";

/** Drop leading Admins when a Manager (or you) still remains — line manager stays visually on top. */
function chainForDisplay(chain) {
  const c = Array.isArray(chain) ? [...chain] : [];
  while (c.length > 2 && c[0]?.role === "Admin") {
    c.shift();
  }
  return c;
}

function HierarchyNode({ node, variant, topManagerStyle, levelHint }) {
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
        {levelHint || (isYou ? "You" : isSupervisor ? "Supervisor" : node.role)}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{node.name}</div>
      <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{node.email}</div>
      {node.business_unit && (
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

/** One direct report column: person on the shared row; their own reports hang below only them. */
function DirectReportColumn({ person }) {
  const subs = Array.isArray(person.direct_reports) ? person.direct_reports : [];
  return (
    <div className="flex min-w-[10rem] max-w-[220px] flex-1 flex-col items-center sm:min-w-[12rem] sm:flex-none">
      <div className="h-4 w-0.5 shrink-0 bg-slate-300 dark:bg-slate-600" aria-hidden />
      <HierarchyNode node={person} variant="report" topManagerStyle={false} levelHint="Direct report · same level" />
      {subs.length > 0 && (
        <div className="mt-1 flex w-full flex-col items-center border-t border-dashed border-slate-300/90 pt-2 dark:border-slate-600">
          <p className="mb-1 max-w-full px-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Reports to {person.name.split(/\s+/)[0] || person.name}
            <span className="mt-0.5 block font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
              (next level down)
            </span>
          </p>
          {subs.map((sub) => (
            <div key={sub.id} className="flex flex-col items-center">
              <VerticalConnector />
              <HierarchyNode node={sub} variant="report" topManagerStyle={false} levelHint="Sub-team" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DirectReportsRow({ reports, supervisorName }) {
  if (!reports.length) return null;
  return (
    <div className="mt-1 w-full max-w-5xl">
      <VerticalConnector tall />
      <div
        className="relative mx-auto flex w-full min-w-[12rem] flex-col items-center px-2"
        role="group"
        aria-label={`Direct reports to ${supervisorName}`}
      >
        <span className="mb-1 rounded-full bg-brand-blue-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-blue dark:bg-white/10 dark:text-brand-green">
          Direct reports — same level
        </span>
        <div className="h-0.5 w-full shrink-0 bg-slate-400 dark:bg-slate-500" aria-hidden />
        <p className="mt-1.5 max-w-lg text-center text-[11px] text-slate-500 dark:text-slate-400">
          Everyone on this row reports directly to {supervisorName}. They are peers, not above or below each other.
        </p>
      </div>
      <div className="mx-auto mt-2 flex w-full flex-row flex-wrap items-start justify-center gap-x-4 gap-y-4 rounded-2xl border border-dashed border-brand-blue/25 bg-brand-blue-soft/30 px-3 py-4 dark:border-brand-green/20 dark:bg-white/5">
        {reports.map((emp) => (
          <DirectReportColumn key={emp.id} person={emp} />
        ))}
      </div>
    </div>
  );
}

function HierarchyLegend() {
  return (
    <div className="mt-6 flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
      <div className="font-semibold text-slate-700 dark:text-slate-200">How to read this chart</div>
      <ul className="list-inside list-disc space-y-1">
        <li>
          <strong>One vertical line</strong> between cards = different levels (e.g. you above your team).
        </li>
        <li>
          <strong>One horizontal line</strong> with several people on it = <strong>same level</strong> (all report to the
          person above that line).
        </li>
        <li>
          Someone shown <strong>under another employee</strong> (not on your row) reports to that employee, not to you.
        </li>
      </ul>
    </div>
  );
}

/**
 * People above you (vertical), then you, then every direct report on one shared row (siblings).
 */
export default function ReportingHierarchyTree({ hierarchy, currentUserId }) {
  const rawChain = Array.isArray(hierarchy?.chain) ? hierarchy.chain : [];
  const chain = useMemo(() => chainForDisplay(rawChain), [rawChain]);
  const rawDirect = Array.isArray(hierarchy?.direct_reports) ? hierarchy.direct_reports : [];

  const directReports = useMemo(() => {
    const ancestorIds = new Set(chain.filter((n) => n.id !== currentUserId).map((n) => n.id));
    return rawDirect.filter((r) => r.id !== currentUserId && !ancestorIds.has(r.id));
  }, [rawDirect, chain, currentUserId]);

  const selfIndex = chain.findIndex((n) => n.id === currentUserId);
  const ancestors = selfIndex >= 0 ? chain.slice(0, selfIndex) : chain.slice(0, -1);
  const selfNode = selfIndex >= 0 ? chain[selfIndex] : chain[chain.length - 1] || null;
  const supervisorLabel = selfNode?.name || "you";

  if (!selfNode && chain.length === 0 && directReports.length === 0) return null;

  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Reporting hierarchy</h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Follow the lines: vertical = different level; horizontal row under you = everyone at the same level reporting
        to you.
      </p>

      <div className="flex min-w-[280px] flex-col items-center pb-2">
        {ancestors.map((node, i) => (
          <Fragment key={node.id}>
            {i > 0 && <VerticalConnector tall />}
            <HierarchyNode
              node={node}
              variant="manager"
              topManagerStyle={i === 0}
              levelHint={i === 0 ? "Top of your line" : "Supervisor"}
            />
          </Fragment>
        ))}

        {selfNode && (
          <>
            {ancestors.length > 0 && <VerticalConnector tall />}
            <HierarchyNode node={selfNode} variant="you" topManagerStyle={false} levelHint="You" />
          </>
        )}

        <DirectReportsRow reports={directReports} supervisorName={supervisorLabel} />

        <HierarchyLegend />

        {ancestors.length === 0 && !selfNode && directReports.length === 0 && (
          <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            No reporting line is set yet. Ask an admin to assign who you report to.
          </p>
        )}

        {selfNode && ancestors.length === 0 && directReports.length === 0 && (
          <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            No one is assigned to report to you yet. When people are added under you in Administration, they appear on
            the shared row below your card.
          </p>
        )}
      </div>
    </section>
  );
}
