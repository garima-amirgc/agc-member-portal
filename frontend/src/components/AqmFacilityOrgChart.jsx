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

function VBar({ className = "" }) {
  return <div className={[`w-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

function HBar({ className = "" }) {
  return <div className={[`h-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

const TOP = [
  { name: "Tony Aziz", title: "Chief Executive Officer", photoSrc: orgChartAssetUrl("org-chart/tony-aziz.png") },
  { name: "Sherry Aziz", title: "Chief Finance Officer", photoSrc: "/sherry-aziz.png" },
  { name: "Tom Heliotis", title: "President", photoSrc: orgChartAssetUrl("org-chart/tom-heliotis.png") },
  { name: "Adam Aziz", title: "Director of Operations", photoSrc: orgChartAssetUrl("org-chart/adam-aziz.png") },
];

const MID = [
  { name: "Carol Maia", title: "FSQA Manager - AQM", photoSrc: orgChartAssetUrl("org-chart/carol-maia.png") },
  { name: "Tatiana Bairydost", title: "Plant Manager", photoSrc: orgChartAssetUrl("org-chart/tatiana-bairydost.png") },
];

const FSQA_REPORTS = [{ name: "Aastha Juneja", title: "HACCP Coordinator" }];

const PLANT_REPORTS = [
  { name: "Tushar Soni", title: "Production Supervisor" },
  { name: "Trevor Whalen", title: "Production Supervisor" },
  { name: "Gary", title: "Senior Production Supervisor" },
  { name: "Doris Eghan", title: "Production Planner" },
  { name: "Emmy Bucyana", title: "Shipping Supervisor" },
];

export default function AqmFacilityOrgChart() {
  return (
    <div className="w-full min-w-0">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">AQM organization</h2>
      </div>

      <div className="block rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 sm:hidden dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mb-2 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-600">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Leadership (peers)
          </div>
          <div className="flex flex-col items-stretch gap-1.5">
            <OrgPersonNode compact name="Tony Aziz" title="Chief Executive Officer" photoSrc={orgChartAssetUrl("org-chart/tony-aziz.png")} />
            <OrgPersonNode compact name="Sherry Aziz" title="Chief Finance Officer" photoSrc="/sherry-aziz.png" />
            <OrgPersonNode compact name="Tom Heliotis" title="President" photoSrc={orgChartAssetUrl("org-chart/tom-heliotis.png")} />
            <OrgPersonNode compact name="Adam Aziz" title="Director of Operations" photoSrc={orgChartAssetUrl("org-chart/adam-aziz.png")} />
          </div>
        </div>

        <div className="ml-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Reports to Tony Aziz
          </div>

          <div className="space-y-3">
            <div>
              <OrgPersonNode compact name={MID[0].name} title={MID[0].title} photoSrc={MID[0].photoSrc} />
              <div className="ml-2 mt-1.5 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reports to {MID[0].name}
                </div>
                <div className="flex flex-col items-stretch gap-1.5">
                  {FSQA_REPORTS.map((p) => (
                    <OrgPersonNode key={p.name} compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <OrgPersonNode compact name={MID[1].name} title={MID[1].title} photoSrc={MID[1].photoSrc} />
              <div className="ml-2 mt-1.5 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reports to {MID[1].name}
                </div>
                <div className="flex flex-col items-stretch gap-1.5">
                  {PLANT_REPORTS.map((p) => (
                    <OrgPersonNode key={p.name} compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={[
          "hidden rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-4 sm:block sm:px-5 dark:border-slate-700 dark:bg-slate-900/40",
          "overflow-x-auto",
        ].join(" ")}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-center gap-x-4 gap-y-4 sm:flex-nowrap sm:gap-x-6">
          {TOP.map((p, i) => (
            <div key={p.name} className="flex flex-col items-center">
              <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
              {i === 0 ? <VBar className="mt-2 h-4" /> : <div className="mt-2 h-4" />}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-0 flex w-full max-w-5xl justify-center px-2 sm:px-8">
          <HBar className="h-px w-full" />
        </div>

        <div className="mx-auto mt-0 flex w-full max-w-5xl justify-center">
          <VBar className="h-4" />
        </div>
        <div className="mx-auto flex w-full max-w-5xl justify-center px-6 sm:px-24">
          <HBar className="h-px w-full" />
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-center gap-x-10 gap-y-4 sm:flex-nowrap sm:gap-x-16">
          {MID.map((p) => (
            <div key={p.name} className="flex flex-col items-center">
              <VBar className="mb-2 h-4" />
              <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
              <VBar className="mt-2 h-4" />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-0 flex w-full max-w-5xl justify-center px-6 sm:px-24">
          <HBar className="h-px w-full" />
        </div>

        <div className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-1 gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
          <div className="flex flex-col items-center border-t border-slate-200/80 pt-4 sm:border-t-0 sm:pt-0 dark:border-slate-700/80">
            <VBar className="h-3" />
            <div className="mt-2 flex flex-col items-center gap-2">
              {FSQA_REPORTS.map((p) => (
                <OrgPersonNode key={p.name} compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center border-t border-slate-200/80 pt-4 sm:border-t-0 sm:pt-0 dark:border-slate-700/80">
            <VBar className="h-3" />
            <HBar className="-mt-px w-full max-w-xs sm:max-w-lg" />
            <div className="mt-2 flex flex-wrap items-start justify-center gap-x-3 gap-y-3">
              {PLANT_REPORTS.map((p) => (
                <div key={p.name} className="flex flex-col items-center">
                  <VBar className="-mt-2 mb-1 h-3" />
                  <OrgPersonNode compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
