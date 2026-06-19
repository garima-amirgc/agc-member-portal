function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/**
 * Public Spaces origin for org-chart headshots. Override with `VITE_ORG_CHART_ASSETS_BASE` (no trailing slash).
 * Matches the project’s default bucket when env is not set, so photos still load in local dev.
 */
const DEFAULT_ORG_CHART_ASSETS_BASE = "https://agc-university-resources.tor1.digitaloceanspaces.com";

function orgChartAssetUrl(relativeKey) {
  const raw = import.meta.env.VITE_ORG_CHART_ASSETS_BASE?.trim() || DEFAULT_ORG_CHART_ASSETS_BASE;
  const base = raw.replace(/\/+$/, "");
  if (!relativeKey) return undefined;
  return `${base}/${String(relativeKey).replace(/^\/+/, "")}`;
}

const LINE = "bg-slate-400 dark:bg-slate-500";

/**
 * @param {{ name: string; title: string; photoSrc?: string; compact?: boolean }} props
 */
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

const TOP = [
  { name: "Sherry Aziz", title: "Founder, Chief Finance Officer", photoSrc: "/sherry-aziz.png" },
  { name: "Tony Aziz", title: "Chief Executive Officer", photoSrc: orgChartAssetUrl("org-chart/tony-aziz.png") },
  { name: "Tom Heliotis", title: "Chief Commercial Officer", photoSrc: orgChartAssetUrl("org-chart/tom-heliotis.png") },
];

const SPINE_ROWS = [
  { side: "right", name: "Adam Aziz", title: "Director of Operations", photoSrc: orgChartAssetUrl("org-chart/adam-aziz.png") },
  { side: "left", name: "Tatiana Bairydost", title: "Plant Manager — AQM", photoSrc: orgChartAssetUrl("org-chart/tatiana-bairydost.png") },
  {
    side: "right",
    name: "Gene Massa",
    title: "Director of Human Resources — AGC",
    photoSrc: orgChartAssetUrl("org-chart/gene-massa.png"),
    reports: [
      {
        name: "Maurizio Calconi",
        title: "Head of Talent Acquisition",
        photoSrc: `${orgChartAssetUrl("org-chart/maurizio-calconi.png")}?v=3`,
      },
    ],
  },
  { side: "left", name: "Carol Maia", title: "FSQA Manager — AQM", photoSrc: orgChartAssetUrl("org-chart/carol-maia.png") },
  { side: "right", name: "Tallib Deen", title: "Maintenance Manager — ASP", photoSrc: orgChartAssetUrl("org-chart/tallib-deen.png") },
  { side: "left", name: "Enid Gonzalez Acosta", title: "FSQA Manager — Sierra", photoSrc: orgChartAssetUrl("org-chart/enid-gonzalez-acosta.png") },
  { side: "right", name: "Richard Wark", title: "Production Manager — ASP", photoSrc: orgChartAssetUrl("org-chart/richard-wark.png") },
  { side: "left", name: "Martin Thangaraj", title: "Group Maintenance Manager — AGC", photoSrc: orgChartAssetUrl("org-chart/martin-thangaraj.png") },
  { side: "right", name: "Montasser Abdelkodouss", title: "AQM & ASP", photoSrc: orgChartAssetUrl("org-chart/montasser-abdelkodouss.png") },
  { side: "left", name: "Shamir Aziz", title: "Project Manager", photoSrc: orgChartAssetUrl("org-chart/shamir-aziz.png") },
  { side: "right", name: "Colin Frost", title: "Project Manager — ASP", photoSrc: orgChartAssetUrl("org-chart/colin-frost.png") },
];

function VBar({ className = "" }) {
  return <div className={[`w-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

function HBar({ className = "" }) {
  return <div className={[`h-px shrink-0 ${LINE}`, className].filter(Boolean).join(" ")} aria-hidden />;
}

/**
 * @param {{ row: { name: string; title: string; photoSrc?: string; reports?: Array<{ name: string; title: string; photoSrc?: string }> }; align: 'start' | 'end' }} props
 */
function SpinePersonBlock({ row, align }) {
  const colAlign = align === "end" ? "items-end" : "items-start";
  return (
    <div className={["flex min-w-0 flex-col", colAlign].join(" ")}>
      <OrgPersonNode name={row.name} title={row.title} photoSrc={row.photoSrc} />
      {row.reports?.length ? (
        <div className={["mt-1 flex min-w-0 flex-col gap-1", colAlign].join(" ")}>
          <VBar className="h-2.5" />
          {row.reports.map((r) => (
            <OrgPersonNode key={r.name} compact name={r.name} title={r.title} photoSrc={r.photoSrc} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpineList() {
  return (
    <div className="relative mx-auto w-full pt-1">
      <div className={`absolute top-0 bottom-0 left-1/2 z-0 w-px -translate-x-1/2 ${LINE}`} aria-hidden />
      <ul className="relative z-[1] m-0 list-none space-y-1.5 p-0 sm:space-y-2">
        {SPINE_ROWS.map((row) => (
          <li
            key={row.name}
            className={[
              "flex min-h-[40px] items-start gap-0 sm:min-h-[44px]",
              row.side === "left"
                ? "flex-row justify-end pr-[calc(50%+2px)]"
                : "flex-row justify-start pl-[calc(50%+2px)]",
            ].join(" ")}
          >
            {row.side === "left" ? (
              <>
                <div className="flex min-w-0 flex-1 justify-end pr-0.5">
                  <SpinePersonBlock row={row} align="end" />
                </div>
                <div className="flex h-10 shrink-0 items-center sm:h-11">
                  <HBar className="order-none w-3 sm:w-5" />
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 shrink-0 items-center sm:h-11">
                  <HBar className="w-3 sm:w-5" />
                </div>
                <div className="flex min-w-0 flex-1 justify-start pl-0.5">
                  <SpinePersonBlock row={row} align="start" />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AgcFacilityOrgChart() {
  // The AGC leadership spine (col 2) carries far more entries than the Finance branch (col 1) or
  // the empty third track, so it gets a wider share of the row — an even three-way split was
  // squeezing long titles like "Director of Human Resources — AGC" until names got clipped.
  const colGrid = "mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-[0.9fr_2.1fr_0.6fr] lg:gap-6";

  return (
    <div className="w-full min-w-0">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">AGC leadership</h2>
      </div>

      {/*
        Mobile (<sm): the zigzag connector spine below gets ambiguous and the long job titles
        overflow once everything is squeezed to phone width, so phones get an explicit indented
        "reports to" list instead — the same approach already used for the AQM and ASP charts.
        Tablet/desktop keep the connector-line spine.
      */}
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

        {/* Reports to Sherry Aziz */}
        <div className="ml-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <OrgPersonNode
            compact
            name="David Schlosser"
            title="VP Finance"
            photoSrc={orgChartAssetUrl("org-chart/david-schlosser.png")}
          />
          <div className="ml-2 mt-1.5 flex flex-col items-stretch gap-1.5 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
            <OrgPersonNode
              compact
              name="Steven Chow"
              title="Director of Finance"
              photoSrc={orgChartAssetUrl("org-chart/steven-show.png")}
            />
            <OrgPersonNode
              compact
              name="Dhannjaykumar Patel"
              title="Financial Controller"
              photoSrc={orgChartAssetUrl("org-chart/dhannjaykumar-patel.png")}
            />
          </div>
        </div>

        {/* Reports to Tony Aziz */}
        <div className="ml-2 mt-3 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <div className="flex flex-col items-stretch gap-2">
            {SPINE_ROWS.map((row) => (
              <div key={row.name}>
                <OrgPersonNode compact name={row.name} title={row.title} photoSrc={row.photoSrc} />
                {row.reports?.length ? (
                  <div className="ml-2 mt-1.5 flex flex-col items-stretch gap-1.5 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
                    {row.reports.map((r) => (
                      <OrgPersonNode key={r.name} compact name={r.name} title={r.title} photoSrc={r.photoSrc} />
                    ))}
                  </div>
                ) : null}
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
        <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-x-6 gap-y-4 sm:gap-x-10 lg:grid lg:grid-cols-[0.9fr_2.1fr_0.6fr] lg:justify-items-center lg:gap-x-6">
          {TOP.map((p) => (
            <div key={p.name} className="flex flex-col items-center">
              <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
              <VBar className="mt-2 h-4" />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-0 flex w-full max-w-5xl justify-center px-4">
          <HBar className="h-px w-full max-w-xl lg:max-w-5xl" />
        </div>

        <div className={`${colGrid} mt-6 lg:mt-4`}>
          <section className="flex min-w-0 flex-col items-center border-t border-slate-200/80 pt-6 lg:border-t-0 lg:pt-0 dark:border-slate-700/80">
            <VBar className="h-3" />
            <div className="mt-2">
              <OrgPersonNode
                name="David Schlosser"
                title="VP Finance"
                photoSrc={orgChartAssetUrl("org-chart/david-schlosser.png")}
              />
            </div>
            <div className="mt-3 flex w-full max-w-[min(100%,560px)] flex-col items-center sm:max-w-[min(100%,640px)]">
              <VBar className="h-4" />
              <HBar className="-mt-px w-[min(100%,520px)]" />
              <div className="grid w-full grid-cols-2 gap-x-2 sm:gap-x-3">
                <div className="flex flex-col items-center">
                  <VBar className="-mt-px h-3" />
                  <OrgPersonNode
                    compact
                    name="Steven Chow"
                    title="Director of Finance"
                    photoSrc={orgChartAssetUrl("org-chart/steven-show.png")}
                  />
                </div>
                <div className="flex flex-col items-center">
                  <VBar className="-mt-px h-3" />
                  <OrgPersonNode
                    compact
                    name="Dhannjaykumar Patel"
                    title="Financial Controller"
                    photoSrc={orgChartAssetUrl("org-chart/dhannjaykumar-patel.png")}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-col items-center border-t border-slate-200/80 pt-6 lg:border-t-0 lg:pt-0 dark:border-slate-700/80">
            <VBar className="h-4" />
            <div className="mt-3 w-full min-w-0">
              <SpineList />
            </div>
          </section>

          {/* Third track: keeps column alignment under Tom; no stub line */}
          <section
            className="flex min-w-0 flex-col items-center border-t border-slate-200/80 pt-6 lg:border-t-0 lg:pt-0 dark:border-slate-700/80"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
