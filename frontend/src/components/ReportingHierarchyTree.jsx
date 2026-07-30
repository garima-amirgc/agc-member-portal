import { Fragment, useMemo } from "react";
import ProgressBar from "./ProgressBar";

function chainForDisplay(chain) {
  const c = Array.isArray(chain) ? [...chain] : [];
  while (c.length > 2 && c[0]?.role === "Admin") c.shift();
  return c;
}

function trainingStats(member) {
  const summary = member?.training_summary;
  const assigns = member?.assignments || [];
  const avg =
    summary?.avgProgress ??
    (assigns.length === 0 ? 0 : Math.round(assigns.reduce((s, a) => s + (a.progress ?? 0), 0) / assigns.length));
  return { avg: Math.min(100, Math.max(0, Math.round(avg))) };
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name, size = "md", color = "blue" }) {
  const sz = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs";
  const bg =
    color === "green"
      ? "bg-gradient-to-br from-[#A7D344] to-[#86BC25] text-white"
      : color === "slate"
        ? "bg-gradient-to-br from-slate-400 to-slate-500 text-white"
        : "bg-gradient-to-br from-[#0B3EAF] to-[#1a5fd4] text-white";
  return (
    <div className={`${sz} ${bg} shrink-0 rounded-full flex items-center justify-center font-bold shadow-sm`}>
      {initials(name)}
    </div>
  );
}

function AdpBadge() {
  return (
    <span
      title="Reporting line is sourced from ADP Workforce Now and updates automatically"
      className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
      ADP
    </span>
  );
}

function Connector({ tall = false }) {
  return (
    <div className="flex justify-center">
      <div className={`w-px ${tall ? "h-8" : "h-5"} bg-gradient-to-b from-[#0B3EAF]/40 to-[#0B3EAF]/20 dark:from-[#A7D344]/40 dark:to-[#A7D344]/20`} />
    </div>
  );
}

function HierarchyCard({ node, variant, levelHint, training }) {
  const isYou = variant === "you";
  const isReport = variant === "report";
  const stats = (isYou || isReport) ? trainingStats(training) : null;
  const isAdp = node?.manager_source === "adp";

  const cardCls = isYou
    ? "border-2 border-[#A7D344] bg-gradient-to-br from-[#f0f9e0] to-white shadow-md ring-2 ring-[#A7D344]/20 dark:from-[#1a2e05] dark:to-slate-800 dark:border-[#A7D344]/60"
    : variant === "manager"
      ? "border-2 border-[#0B3EAF]/60 bg-gradient-to-br from-[#eef2fb] to-white shadow-md dark:from-[#0d1a3a] dark:to-slate-800 dark:border-[#0B3EAF]/40"
      : "border border-slate-200 bg-white shadow-sm dark:border-slate-600/60 dark:bg-slate-800/80";

  const avatarColor = isYou ? "green" : variant === "manager" ? "blue" : "slate";

  return (
    <div className={`relative w-52 rounded-2xl px-4 py-3.5 ${cardCls}`}>
      {/* Label row */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className={`text-[9px] font-bold uppercase tracking-widest ${isYou ? "text-[#5a8a00] dark:text-[#A7D344]" : "text-[#0B3EAF] dark:text-[#A7D344]"}`}>
          {levelHint}
        </span>
        {isAdp && <AdpBadge />}
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <Avatar name={node.name} size={isYou ? "lg" : "md"} color={avatarColor} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{node.name}</div>
          <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{node.email}</div>
          {node.business_unit && (
            <span className="mt-1 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {node.business_unit}
            </span>
          )}
        </div>
      </div>

      {/* Training progress */}
      {stats !== null && (
        <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-700/60">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Training</span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{stats.avg}%</span>
          </div>
          <ProgressBar value={stats.avg} />
        </div>
      )}
    </div>
  );
}

function DirectReportColumn({ person, teamMember }) {
  const subs = Array.isArray(person.direct_reports) ? person.direct_reports : [];
  return (
    <div className="flex flex-col items-center">
      <Connector />
      <HierarchyCard node={person} variant="report" levelHint="Direct report" training={teamMember} />
      {subs.length > 0 && (
        <div className="mt-1 flex flex-col items-center">
          {subs.map((sub) => (
            <div key={sub.id} className="flex flex-col items-center">
              <Connector />
              <HierarchyCard node={sub} variant="report" levelHint="Reports to above" training={null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DirectReportsRow({ reports, supervisorName, teamById }) {
  if (!reports.length) return null;
  const multi = reports.length > 1;
  return (
    <div className="mt-1 w-full">
      <Connector tall />
      {multi && (
        <div className="flex justify-center">
          <div className="h-px w-3/4 max-w-2xl bg-gradient-to-r from-transparent via-[#0B3EAF]/30 to-transparent dark:via-[#A7D344]/30" />
        </div>
      )}
      <div
        className="mt-3 flex flex-row flex-wrap items-start justify-center gap-4 rounded-2xl border border-dashed border-[#0B3EAF]/20 bg-[#0B3EAF]/[0.03] px-4 py-5 dark:border-[#A7D344]/20 dark:bg-[#A7D344]/[0.03]"
        role="group"
        aria-label={`Direct reports to ${supervisorName}`}
      >
        {reports.map((emp) => (
          <DirectReportColumn key={emp.id} person={emp} teamMember={teamById.get(emp.id)} />
        ))}
      </div>
    </div>
  );
}

export default function ReportingHierarchyTree({ hierarchy, currentUserId, team = [], selfTraining = null }) {
  const rawChain = Array.isArray(hierarchy?.chain) ? hierarchy.chain : [];
  const chain = useMemo(() => chainForDisplay(rawChain), [rawChain]);
  const rawDirect = Array.isArray(hierarchy?.direct_reports) ? hierarchy.direct_reports : [];

  const teamById = useMemo(() => {
    const map = new Map();
    for (const m of team) if (m?.id != null) map.set(m.id, m);
    return map;
  }, [team]);

  const directReports = useMemo(() => {
    const ancestorIds = new Set(chain.filter((n) => n.id !== currentUserId).map((n) => n.id));
    return rawDirect.filter((r) => r.id !== currentUserId && !ancestorIds.has(r.id));
  }, [rawDirect, chain, currentUserId]);

  const selfIndex = chain.findIndex((n) => n.id === currentUserId);
  const ancestors = selfIndex >= 0 ? chain.slice(0, selfIndex) : chain.slice(0, -1);
  const selfNode = selfIndex >= 0 ? chain[selfIndex] : chain[chain.length - 1] || null;

  if (!selfNode && chain.length === 0 && directReports.length === 0) return null;

  const hasAdpNode = [...ancestors, selfNode, ...directReports].some((n) => n?.manager_source === "adp");

  return (
    <section className="card overflow-x-auto">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reporting hierarchy</h2>
        {hasAdpNode && (
          <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
            ADP — reporting lines synced automatically from ADP Workforce Now
          </span>
        )}
      </div>

      <div className="flex min-w-[280px] flex-col items-center pb-2">
        {ancestors.map((node, i) => {
          // Show ADP badge on a supervisor when the person directly below them
          // in the chain was placed there by ADP (subordinate has adp_reports_to_oid set).
          const subordinate = i < ancestors.length - 1 ? ancestors[i + 1] : selfNode;
          const adpPlaced = subordinate?.manager_source === "adp";
          return (
            <Fragment key={node.id}>
              {i > 0 && <Connector tall />}
              <HierarchyCard
                node={adpPlaced ? { ...node, manager_source: "adp" } : node}
                variant="manager"
                levelHint="Supervisor"
              />
            </Fragment>
          );
        })}

        {selfNode && (
          <>
            {ancestors.length > 0 && <Connector tall />}
            <HierarchyCard node={selfNode} variant="you" levelHint="You" training={selfTraining} />
          </>
        )}

        <DirectReportsRow reports={directReports} supervisorName={selfNode?.name || "you"} teamById={teamById} />

        {!selfNode && chain.length === 0 && directReports.length === 0 && (
          <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            No reporting line is set yet. Ask an admin to assign who you report to.
          </p>
        )}
        {selfNode && ancestors.length === 0 && directReports.length === 0 && (
          <p className="mt-4 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            No one is assigned to report to you yet.
          </p>
        )}
      </div>
    </section>
  );
}
