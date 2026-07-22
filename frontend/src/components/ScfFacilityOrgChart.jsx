import { useState } from "react";

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

function OrgPersonNode({ name, title, photoSrc, compact, tbd }) {
  const [imgError, setImgError] = useState(false);
  const ini = tbd ? "TBD" : initials(name);
  const showImg = photoSrc && !tbd && !imgError;
  return (
    <div
      className={[
        "inline-flex min-w-0 w-max max-w-full items-center rounded-full border border-white/15",
        tbd
          ? "bg-[#3a5fb5]/70 text-white shadow-sm ring-1 ring-black/10 dark:border-white/10 dark:bg-[#2a4a9a]/70"
          : "bg-[#0C3EB0] text-white shadow-sm ring-1 ring-black/10 dark:border-white/10 dark:bg-[#0B3EAF]",
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
        {showImg ? (
          <img src={photoSrc} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setImgError(true)} />
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
          {tbd ? "TBD" : name}
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

// ─── Data ────────────────────────────────────────────────────────────────────

const LEADERSHIP = [
  { name: "Sherry Aziz", title: "Founder, Chief Finance Officer", photoSrc: "/sherry-aziz.png" },
  { name: "Tony Aziz",   title: "Chief Executive Officer",        photoSrc: orgChartAssetUrl("org-chart/tony-aziz.png") },
  { name: "Tom Heliotis",title: "President",                      photoSrc: orgChartAssetUrl("org-chart/tom-heliotis.png") },
];

const ADAM = {
  name: "Adam Aziz", title: "Director of Operations",
  photoSrc: orgChartAssetUrl("org-chart/adam-aziz.png"),
};

// Production tree — under TBD Production Manager → Parth Patel
const PARTH = {
  name: "Parth Patel", title: "Sr Production Supervisor",
  photoSrc: orgChartAssetUrl("org-chart/parth-patel.png"),
};
const PARTH_REPORTS = [
  { name: "Parasdeep Singh", title: "Sr. Team Leader", photoSrc: orgChartAssetUrl("org-chart/parasdeep-singh.png") },
  { name: "Hai Wen Wang",    title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/hai-wen-wang.png") },
  { name: "Lovepreet Singh", title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/lovepreet-singh.png") },
  { tbd: true,               title: "Team Leader" },
  { tbd: true,               title: "Team Leader" },
];

// Production tree — under TBD Production Manager → TBD Supervisor
const TBD_SUPERVISOR_REPORTS = [
  { name: "Amandeep Singh",  title: "Sr. Team Leader", photoSrc: orgChartAssetUrl("org-chart/amandeep-singh.png") },
  { name: "David Azeez",     title: "Team Leader",     photoSrc: orgChartAssetUrl("org-chart/david-azeez.png") },
  { name: "Mayank Dhingra",  title: "Team Leader",     photoSrc: orgChartAssetUrl("org-chart/mayank-dhingra.png") },
  { name: "Jaswinder Cheema",title: "Team Leader",     photoSrc: orgChartAssetUrl("org-chart/jaswinder-cheema.png") },
  { name: "Mandeep Singh",   title: "Team Leader",     photoSrc: orgChartAssetUrl("org-chart/mandeep-singh.png") },
];

// Production tree — under TBD Plant Manager → Olakunle Odufuwa
const OLAKUNLE = {
  name: "Olakunle Odufuwa", title: "Production Supervisor",
  photoSrc: orgChartAssetUrl("org-chart/olakunle-odufuwa.png"),
};
const OLAKUNLE_REPORTS = [
  { name: "Ahasan Ali",         title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/ahasan-ali.png") },
  { name: "Gurloverleen Singh", title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/gurloverleen-singh.png") },
  { name: "Gurjeet Singh",      title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/gurjeet-singh.png") },
  { name: "Mark Nanlall",       title: "Team Leader",      photoSrc: orgChartAssetUrl("org-chart/mark-nanlall.png") },
  { name: "Ayana Banerjee",     title: "Coat Room Clerk",  photoSrc: orgChartAssetUrl("org-chart/ayana-banerjee.png") },
];

// Production tree — under TBD Plant Manager → Roy Marales → Mohit Gupta
const ROY = {
  name: "Roy Marales", title: "Production Supervisor",
  photoSrc: orgChartAssetUrl("org-chart/roy-marales.png"),
};
const MOHIT = {
  name: "Mohit Gupta", title: "Production Supervisor",
  photoSrc: orgChartAssetUrl("org-chart/mohit-gupta.png"),
};
const MOHIT_REPORTS = [
  { name: "Jawahar Balu",       title: "Inventory Control/Logistics", photoSrc: orgChartAssetUrl("org-chart/jawahar-balu.png") },
  { name: "Fred Facciolo",      title: "Logistics Coordinator",       photoSrc: orgChartAssetUrl("org-chart/fred-facciolo.png") },
  { name: "Sheba Sunilkumar",   title: "Shipping Clerk",              photoSrc: orgChartAssetUrl("org-chart/sheba-sunilkumar.png") },
  { name: "Radcliffe Williams", title: "Warehouse Forklift Driver",   photoSrc: orgChartAssetUrl("org-chart/radcliffe-williams.png") },
  { name: "Pankaj Sethi",       title: "Shipper/Receiver",            photoSrc: orgChartAssetUrl("org-chart/pankaj-sethi.png") },
];

// Supply chain section (parallel column)
const SEYED = {
  name: "Seyed Ali Mirtaheri", title: "Production Planner",
  photoSrc: orgChartAssetUrl("org-chart/seyed-ali-mirtaheri.png"),
};
const MELISSA = {
  name: "Melissa Rivera", title: "Supply Chain Manager",
  photoSrc: orgChartAssetUrl("org-chart/melissa-rivera.png"),
};
const MELISSA_REPORTS = [
  { name: "Joel Holder",            title: "Sr Shipping Supervisor",   photoSrc: orgChartAssetUrl("org-chart/joel-holder.png") },
  { name: "Vinni Munjal",           title: "Jr Warehouse Supervisor",  photoSrc: orgChartAssetUrl("org-chart/vinni-munjal.png") },
  { name: "Gurpreet Singh Dhaliwal",title: "Team Leader - Shipping",   photoSrc: orgChartAssetUrl("org-chart/gurpreet-singh-dhaliwal.png") },
  { name: "Roopnarine Seowdat",     title: "Team Leader - Shipping",   photoSrc: orgChartAssetUrl("org-chart/roopnarine-seowdat.png") },
  { name: "Ninder Singh Sidhu",     title: "Shipper/Receiver",         photoSrc: orgChartAssetUrl("org-chart/ninder-singh-sidhu.png") },
  { name: "Avtinder Chahal",        title: "Team Leader - Shipping",   photoSrc: orgChartAssetUrl("org-chart/avtinder-chahal.png") },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function TeamColumn({ supervisor, tbd: tbdSup, reports }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <VBar className="h-3" />
      {tbdSup ? (
        <OrgPersonNode tbd title={supervisor} />
      ) : (
        <OrgPersonNode name={supervisor.name} title={supervisor.title} photoSrc={supervisor.photoSrc} />
      )}
      <VBar className="mt-1 h-3" />
      <HBar className="w-full" />
      <div className="flex w-full flex-col items-center gap-1 pt-0.5">
        {reports.map((r, i) => (
          <div key={r.name || i} className="flex flex-col items-center">
            <VBar className="h-2.5" />
            <OrgPersonNode compact tbd={r.tbd} name={r.name} title={r.title} photoSrc={r.photoSrc} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile helpers ──────────────────────────────────────────────────────────

function MobileIndent({ children }) {
  return (
    <div className="ml-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
      {children}
    </div>
  );
}

function MobileNode({ name, title, photoSrc, tbd }) {
  return (
    <div className="py-0.5">
      <OrgPersonNode compact tbd={tbd} name={name} title={title} photoSrc={photoSrc} />
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function ScfFacilityOrgChart() {
  return (
    <div className="w-full min-w-0">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">SCF organisation</h2>
      </div>

      {/* ── Mobile view ─────────────────────────────────────── */}
      <div className="block rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 sm:hidden dark:border-slate-700 dark:bg-slate-900/40">
        {/* Leadership */}
        <div className="mb-2 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-600">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Leadership
          </div>
          <div className="flex flex-col items-stretch gap-1.5">
            {LEADERSHIP.map((p) => (
              <OrgPersonNode key={p.name} compact name={p.name} title={p.title} photoSrc={p.photoSrc} />
            ))}
          </div>
        </div>
        <MobileIndent>
        {/* Adam */}
        <MobileNode name={ADAM.name} title={ADAM.title} photoSrc={ADAM.photoSrc} />

        <MobileIndent>
          {/* Production Manager branch */}
          <MobileNode tbd title="Production Manager" />
          <MobileIndent>
            <MobileNode name={PARTH.name} title={PARTH.title} photoSrc={PARTH.photoSrc} />
            <MobileIndent>
              {PARTH_REPORTS.map((r, i) => <MobileNode key={r.name || i} tbd={r.tbd} name={r.name} title={r.title} photoSrc={r.photoSrc} />)}
            </MobileIndent>
            <MobileNode tbd title="Production Supervisor" />
            <MobileIndent>
              {TBD_SUPERVISOR_REPORTS.map((r) => <MobileNode key={r.name} name={r.name} title={r.title} photoSrc={r.photoSrc} />)}
            </MobileIndent>
          </MobileIndent>

          {/* Plant Manager branch */}
          <MobileNode tbd title="Plant Manager" />
          <MobileIndent>
            <MobileNode name={OLAKUNLE.name} title={OLAKUNLE.title} photoSrc={OLAKUNLE.photoSrc} />
            <MobileIndent>
              {OLAKUNLE_REPORTS.map((r) => <MobileNode key={r.name} name={r.name} title={r.title} photoSrc={r.photoSrc} />)}
            </MobileIndent>
            <MobileNode name={ROY.name} title={ROY.title} photoSrc={ROY.photoSrc} />
            <MobileIndent>
              <MobileNode name={MOHIT.name} title={MOHIT.title} photoSrc={MOHIT.photoSrc} />
              <MobileIndent>
                {MOHIT_REPORTS.map((r) => <MobileNode key={r.name} name={r.name} title={r.title} photoSrc={r.photoSrc} />)}
              </MobileIndent>
            </MobileIndent>
          </MobileIndent>
        </MobileIndent>
        </MobileIndent>

        {/* Supply chain section */}
        <div className="mt-3 border-t border-slate-300 pt-3 dark:border-slate-600">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supply Chain</div>
          <MobileNode name={SEYED.name} title={SEYED.title} photoSrc={SEYED.photoSrc} />
          <MobileNode name={MELISSA.name} title={MELISSA.title} photoSrc={MELISSA.photoSrc} />
          <MobileIndent>
            {MELISSA_REPORTS.map((r) => <MobileNode key={r.name} name={r.name} title={r.title} photoSrc={r.photoSrc} />)}
          </MobileIndent>
        </div>
      </div>

      {/* ── Desktop view ────────────────────────────────────── */}
      <div className="hidden rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-4 sm:block sm:px-5 dark:border-slate-700 dark:bg-slate-900/40 overflow-x-auto">
        <div className="min-w-[900px]">

          {/* Row 1: Leadership — Sherry, Tony, Tom */}
          <div className="flex justify-center gap-x-6 sm:gap-x-10">
            {LEADERSHIP.map((p) => (
              <div key={p.name} className="flex flex-col items-center">
                <OrgPersonNode name={p.name} title={p.title} photoSrc={p.photoSrc} />
              </div>
            ))}
          </div>
          <div className="my-0 flex justify-center">
            <VBar className="mt-2 h-4" />
          </div>
          <div className="flex justify-center">
            <HBar className="w-24" />
          </div>
          <div className="flex justify-center">
            <VBar className="h-4" />
          </div>

          {/* Row 2: Adam Aziz */}
          <div className="flex flex-col items-center">
            <OrgPersonNode name={ADAM.name} title={ADAM.title} photoSrc={ADAM.photoSrc} />
            <VBar className="mt-2 h-4" />
          </div>

          {/* Row 2: Horizontal bar spanning Production columns */}
          <div className="flex w-full items-start">
            {/* Production side: 4 supervisor columns */}
            <div className="flex flex-1 flex-col">
              <HBar className="w-[calc(100%-8px)] ml-1" />
              <div className="grid grid-cols-2 gap-x-4 mt-0">
                {/* Col A: TBD Production Manager */}
                <div className="flex flex-col items-center">
                  <VBar className="h-3" />
                  <OrgPersonNode tbd title="Production Manager" />
                  <VBar className="mt-1 h-3" />
                  <HBar className="w-full" />
                  <div className="grid grid-cols-2 w-full gap-x-3 mt-0">
                    <TeamColumn supervisor={PARTH} reports={PARTH_REPORTS} />
                    <TeamColumn tbd supervisor="Production Supervisor" reports={TBD_SUPERVISOR_REPORTS} />
                  </div>
                </div>

                {/* Col B: TBD Plant Manager */}
                <div className="flex flex-col items-center">
                  <VBar className="h-3" />
                  <OrgPersonNode tbd title="Plant Manager" />
                  <VBar className="mt-1 h-3" />
                  <HBar className="w-full" />
                  <div className="grid grid-cols-2 w-full gap-x-3 mt-0">
                    <TeamColumn supervisor={OLAKUNLE} reports={OLAKUNLE_REPORTS} />
                    {/* Roy → Mohit → reports */}
                    <div className="flex flex-col items-center">
                      <VBar className="h-3" />
                      <OrgPersonNode name={ROY.name} title={ROY.title} photoSrc={ROY.photoSrc} />
                      <VBar className="mt-1 h-3" />
                      <OrgPersonNode name={MOHIT.name} title={MOHIT.title} photoSrc={MOHIT.photoSrc} />
                      <VBar className="mt-1 h-3" />
                      <HBar className="w-full" />
                      <div className="flex w-full flex-col items-center gap-1 pt-0.5">
                        {MOHIT_REPORTS.map((r) => (
                          <div key={r.name} className="flex flex-col items-center">
                            <VBar className="h-2.5" />
                            <OrgPersonNode compact name={r.name} title={r.title} photoSrc={r.photoSrc} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Supply chain: right column, separated with a gap + left border */}
            <div className="ml-6 w-48 shrink-0 border-l-2 border-slate-300 pl-4 dark:border-slate-600">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supply Chain</div>
              {/* Seyed Ali — standalone */}
              <div className="mb-3">
                <OrgPersonNode name={SEYED.name} title={SEYED.title} photoSrc={SEYED.photoSrc} />
              </div>
              {/* Melissa → reports */}
              <OrgPersonNode name={MELISSA.name} title={MELISSA.title} photoSrc={MELISSA.photoSrc} />
              <div className="mt-2 ml-2 flex flex-col gap-1 border-l-2 border-slate-300 pl-2.5 dark:border-slate-600">
                {MELISSA_REPORTS.map((r) => (
                  <OrgPersonNode key={r.name} compact name={r.name} title={r.title} photoSrc={r.photoSrc} />
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
