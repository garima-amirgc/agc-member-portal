function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

const DEFAULT_ORG_CHART_ASSETS_BASE = "https://agc-university-resources.tor1.digitaloceanspaces.com";

function orgChartAssetUrl(relativeKey) {
  const raw = import.meta.env.VITE_ORG_CHART_ASSETS_BASE?.trim() || DEFAULT_ORG_CHART_ASSETS_BASE;
  const base = raw.replace(/\/+$/, "");
  if (!relativeKey) return undefined;
  return `${base}/${String(relativeKey).replace(/^\/+/, "")}`;
}

const LINE = "bg-slate-400 dark:bg-slate-500";

function OrgPersonNode({ name, title, photoSrc, compact }) {
  const ini = initials(name);
  return (
    <div
      className={[
        "inline-flex min-w-0 w-max max-w-full items-center rounded-full border border-white/15",
        "bg-[#0C3EB0] text-white shadow-sm ring-1 ring-black/10 dark:border-white/10 dark:bg-[#0B3EAF]",
        compact
          ? "gap-1 py-0.5 pl-0 pr-2"
          : "gap-1.5 py-1 pl-0 pr-2.5 sm:gap-2 sm:pr-3",
      ].join(" ")}
    >
      <div
        className={[
          "relative shrink-0 overflow-hidden rounded-full bg-white/15 ring-1 ring-inset ring-white/25",
          compact ? "h-7 w-7" : "h-8 w-8",
        ].join(" ")}
      >
        {photoSrc ? (
          <img src={photoSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span
            className={[
              "flex h-full w-full items-center justify-center font-bold tracking-tight text-white",
              compact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]",
            ].join(" ")}
          >
            {ini}
          </span>
        )}
      </div>
      <div className="min-w-0 text-left leading-tight">
        <div
          className={[
            "whitespace-nowrap font-bold text-white",
            compact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]",
          ].join(" ")}
        >
          {name}
        </div>
        <div
          className={[
            "mt-px whitespace-nowrap font-medium leading-snug text-white/90",
            compact ? "text-[7.5px] sm:text-[8px]" : "text-[7.5px] sm:text-[8.5px]",
          ].join(" ")}
        >
          {title}
        </div>
      </div>
    </div>
  );
}

function VBar({ className = "", dashed = false }) {
  if (dashed) {
    return (
      <div
        className={["w-0 shrink-0 border-l border-dashed border-slate-400 dark:border-slate-500", className]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      />
    );
  }
  return <div className={[`w-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

function HBar({ className = "", dashed = false }) {
  if (dashed) {
    return (
      <div
        className={["h-0 shrink-0 border-t border-dashed border-slate-400 dark:border-slate-500", className]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      />
    );
  }
  return <div className={[`h-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

const TOP = [
  { name: "Sherry Aziz", title: "Chief Finance Officer", photoSrc: "/sherry-aziz.png" },
  { name: "Tony Aziz", title: "Chief Executive Officer", photoSrc: orgChartAssetUrl("org-chart/tony-aziz.png") },
  { name: "Adam Aziz", title: "Director of Operations", photoSrc: orgChartAssetUrl("org-chart/adam-aziz.png") },
];

const TONY_REPORTS = [
  { name: "Montasser Abdelkodouss", title: "Senior Specialist QA", photoSrc: orgChartAssetUrl("org-chart/montasser-abdelkodouss.png") },
  { name: "Richard Wark", title: "Production Manager", photoSrc: orgChartAssetUrl("org-chart/richard-wark.png") },
  { name: "Tallib Deen", title: "Maintenance Manager", photoSrc: orgChartAssetUrl("org-chart/tallib-deen.png") },
];

const ADAM_REPORTS = [
  { name: "Martin Thangaraj", title: "Group Maintenance Manager - AGC", photoSrc: orgChartAssetUrl("org-chart/martin-thangaraj.png") },
];

const DOTTED_LINK = { from: "Tallib Deen", to: "Martin Thangaraj" };

export default function AspFacilityOrgChart() {
  return (
    <div className="w-full min-w-0">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">ASP organization</h2>
      </div>

      <div className="block rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 sm:hidden dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mb-2 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-600">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Leadership (peers)
          </div>
          <div className="flex flex-col items-stretch gap-1.5">
            {TOP.map((p) => (
              <OrgPersonNode key={p.name} compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
            ))}
          </div>
        </div>

        <div className="ml-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <div className="flex flex-col items-stretch gap-1.5">
            {TONY_REPORTS.map((p) => (
              <div key={p.name}>
                <OrgPersonNode compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
                {p.name === DOTTED_LINK.from && (
                  <div className="mt-1 ml-1 flex items-center gap-1.5">
                    <span className="h-0 w-4 shrink-0 border-t border-dashed border-slate-400 dark:border-slate-500" aria-hidden />
                    <span className="text-[8px] italic text-slate-500 dark:text-slate-400">{DOTTED_LINK.to}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="ml-2 mt-3 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <div className="flex flex-col items-stretch gap-1.5">
            {ADAM_REPORTS.map((p) => (
              <div key={p.name}>
                <OrgPersonNode compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
                {p.name === DOTTED_LINK.to && (
                  <div className="mt-1 ml-1 flex items-center gap-1.5">
                    <span className="h-0 w-4 shrink-0 border-t border-dashed border-slate-400 dark:border-slate-500" aria-hidden />
                    <span className="text-[8px] italic text-slate-500 dark:text-slate-400">{DOTTED_LINK.from}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={[
          "hidden rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-4 sm:block sm:px-5 dark:border-slate-700 dark:bg-slate-900/40",
          "overflow-x-auto",
        ].join(" ")}
      >
        <div className="mx-auto grid w-full max-w-4xl grid-cols-3 items-start justify-center gap-x-6 sm:gap-x-10">
          {TOP.map((p) => (
            <div key={p.name} className="flex flex-col items-center">
              <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
              <VBar className="mt-2 h-4" />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-0 flex w-full max-w-4xl justify-center px-4 sm:px-16">
          <HBar className="h-px w-full" />
        </div>

        <div className="mx-auto grid w-full max-w-4xl grid-cols-3 items-start justify-center gap-x-6 sm:gap-x-10">
          <div aria-hidden />
          <div className="flex flex-col items-center" aria-hidden>
            <VBar className="h-[52px]" />
          </div>
          <div className="flex flex-col items-center">
            <VBar className="h-3" />
            <HBar className="h-px w-10" />
            <VBar className="h-3" />
            <OrgPersonNode name={ADAM_REPORTS[0].name} title={ADAM_REPORTS[0].title} photoSrc={ADAM_REPORTS[0].photoSrc} />
            <VBar dashed className="mt-2 h-6" />
          </div>
        </div>

        <div className="mx-auto mt-0 flex w-full max-w-4xl justify-center px-16 sm:px-28">
          <HBar className="h-px w-full" />
        </div>

        <div className="mx-auto grid w-full max-w-4xl grid-cols-3 items-start justify-center gap-x-6 sm:gap-x-10">
          {TONY_REPORTS.map((p) => (
            <div key={p.name} className="flex flex-col items-center">
              <VBar dashed={p.name === DOTTED_LINK.from} className="mb-2 h-4" />
              <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
