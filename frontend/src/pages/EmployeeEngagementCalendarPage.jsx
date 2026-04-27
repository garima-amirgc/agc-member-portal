import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";

const MONTHS = [
  {
    name: "January",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [{ title: "New Year Month", meta: "" }],
    art: "fireworks",
  },
  {
    name: "February",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [
      { title: "Black History Week", meta: "" },
      { title: "Chinese New Year", meta: "17th" },
    ],
    art: "ribbon",
  },
  {
    name: "March",
    theme: { bar: "bg-[#6aa0b7]", accent: "text-[#24566a]" },
    items: [{ title: "International Women’s Day", meta: "8th" }],
    art: "women",
  },
  {
    name: "April",
    theme: { bar: "bg-[#4e7b5d]", accent: "text-[#2f5c3f]" },
    items: [{ title: "Earth Day (Tree Planting Day)", meta: "TBD · 22nd" }],
    art: "earth",
  },
  {
    name: "May",
    theme: { bar: "bg-[#d59aa2]", accent: "text-[#7a3a45]" },
    items: [{ title: "Mother’s Day", meta: "10th" }],
    art: "mother",
  },
  {
    name: "June",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [
      { title: "Father’s Day", meta: "21st" },
      { title: "National Donut Day", meta: "5th" },
    ],
    art: "donut",
  },
  {
    name: "July",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [{ title: "Canada Day", meta: "July 1st" }],
    art: "canada",
  },
  {
    name: "August",
    theme: { bar: "bg-[#6aa0b7]", accent: "text-[#24566a]" },
    items: [{ title: "Employee Appreciation BBQ Month", meta: "" }],
    art: "bbq",
  },
  {
    name: "September",
    theme: { bar: "bg-[#4e7b5d]", accent: "text-[#2f5c3f]" },
    items: [{ title: "National Day for Truth and Reconciliation", meta: "30th" }],
    art: "orange",
  },
  {
    name: "October",
    theme: { bar: "bg-[#d59aa2]", accent: "text-[#7a3a45]" },
    items: [{ title: "Thanksgiving potluck", meta: "23rd" }],
    art: "pumpkin",
  },
  {
    name: "November",
    theme: { bar: "bg-[#b23b44]", accent: "text-[#b23b44]" },
    items: [{ title: "Remembrance Day", meta: "Nov 11" }],
    art: "poppy",
  },
  {
    name: "December",
    theme: { bar: "bg-[#c1a33b]", accent: "text-[#8a6a00]" },
    items: [
      { title: "Year End Gala Party", meta: "" },
      { title: "Festive Fusion Week", meta: "" },
    ],
    art: "party",
  },
];

function TinyArt({ kind }) {
  const common = "h-12 w-12 sm:h-14 sm:w-14";
  const base =
    "drop-shadow-[0_8px_18px_rgba(15,23,42,0.12)] dark:drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)]";
  const stroke = 2.25;
  const cap = "round";
  const join = "round";
  switch (kind) {
    case "fireworks":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <defs>
            <linearGradient id="fwg" x1="12" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0B3EAF" />
              <stop offset="0.5" stopColor="#A7D344" />
              <stop offset="1" stopColor="#E02B20" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="26" fill="url(#fwg)" opacity="0.12" />
          <circle cx="32" cy="32" r="22" fill="#ffffff" opacity="0.7" className="dark:opacity-[0.12]" />
          <path
            d="M32 14v8M32 42v8M14 32h8M42 32h8M20.8 20.8l5.7 5.7M37.5 37.5l5.7 5.7M43.2 20.8l-5.7 5.7M26.5 37.5l-5.7 5.7"
            stroke="url(#fwg)"
            strokeWidth={stroke}
            strokeLinecap={cap}
          />
          <path
            d="M32 22l2.3 6.4 6.7-.3-5.4 4 2 6.4-5.6-3.7-5.6 3.7 2-6.4-5.4-4 6.7.3L32 22z"
            fill="#E02B20"
            opacity="0.9"
          />
        </svg>
      );
    case "ribbon":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M16 42c8-16 22-24 36-18"
            stroke="#E02B20"
            strokeWidth={6}
            strokeLinecap={cap}
          />
          <path
            d="M16 28c10 6 22 16 34 20"
            stroke="#A7D344"
            strokeWidth={6}
            strokeLinecap={cap}
          />
          <path
            d="M22 36c4-6 8-9 12-10"
            stroke="#0B3EAF"
            strokeWidth={stroke}
            strokeLinecap={cap}
            strokeLinejoin={join}
            opacity="0.85"
          />
          <circle cx="22" cy="36" r="3.5" fill="#0B3EAF" opacity="0.85" />
        </svg>
      );
    case "women":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <circle cx="26" cy="24" r="8" fill="#A7D344" opacity="0.25" />
          <circle cx="40" cy="26" r="7" fill="#0B3EAF" opacity="0.18" />
          <path
            d="M18 42c0-11 7-18 14-18s14 7 14 18"
            stroke="#0B3EAF"
            strokeWidth={4.5}
            strokeLinecap={cap}
            strokeLinejoin={join}
          />
          <path
            d="M26 46l-6 10M38 46l6 10"
            stroke="#E02B20"
            strokeWidth={4.5}
            strokeLinecap={cap}
          />
        </svg>
      );
    case "earth":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <defs>
            <radialGradient id="globe" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(26 22) rotate(55) scale(28 28)">
              <stop stopColor="#93C5FD" />
              <stop offset="1" stopColor="#0B3EAF" />
            </radialGradient>
          </defs>
          <circle cx="30" cy="32" r="18" fill="url(#globe)" />
          <path
            d="M20 30c6 2 10-7 15-8 7-2 13 5 10 12-3 7-12 12-20 10-6-2-8-9-5-14z"
            fill="#A7D344"
            opacity="0.95"
          />
          <path
            d="M12 32h36M30 14c-6 6-8 14-8 18s2 12 8 18M30 14c6 6 8 14 8 18s-2 12-8 18"
            stroke="#ffffff"
            strokeWidth={stroke}
            strokeLinecap={cap}
            strokeLinejoin={join}
            opacity="0.7"
          />
        </svg>
      );
    case "mother":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <defs>
            <linearGradient id="heartg" x1="18" y1="18" x2="46" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E02B20" />
              <stop offset="1" stopColor="#0B3EAF" />
            </linearGradient>
          </defs>
          <path
            d="M32 50s-16-10-16-22c0-5 4-9 9-9 3 0 6 2 7 4 1-2 4-4 7-4 5 0 9 4 9 9 0 12-16 22-16 22z"
            fill="url(#heartg)"
            opacity="0.9"
          />
          <path
            d="M22 28c2-3 6-3 8 0"
            stroke="#ffffff"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.85"
          />
        </svg>
      );
    case "donut":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <defs>
            <linearGradient id="donutg" x1="18" y1="20" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E02B20" />
              <stop offset="1" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <circle cx="34" cy="30" r="16" fill="url(#donutg)" opacity="0.95" />
          <circle cx="34" cy="30" r="7.5" fill="#fff" opacity="0.9" />
          <path
            d="M24 24l2 2M42 22l-2 2M44 34l-2-1M26 38l2-2"
            stroke="#ffffff"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.9"
          />
        </svg>
      );
    case "canada":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M32 14l3.2 7.2 8.1-2.2-4.4 7.1 7.3 3.1-7.3 3.1 4.4 7.1-8.1-2.2L32 46l-3.2-7.2-8.1 2.2 4.4-7.1-7.3-3.1 7.3-3.1-4.4-7.1 8.1 2.2L32 14z"
            fill="#E02B20"
          />
          <path
            d="M18 46h28"
            stroke="#0B3EAF"
            strokeWidth={4.5}
            strokeLinecap={cap}
            opacity="0.85"
          />
        </svg>
      );
    case "bbq":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M18 30h28"
            stroke="#0F172A"
            strokeWidth={4.5}
            strokeLinecap={cap}
            className="dark:stroke-white"
          />
          <path
            d="M18 30c0 12 6 20 14 20s14-8 14-20"
            stroke="#0F172A"
            strokeWidth={4.5}
            strokeLinecap={cap}
            strokeLinejoin={join}
            className="dark:stroke-white"
          />
          <path d="M24 50v6M40 50v6" stroke="#0F172A" strokeWidth={4.5} strokeLinecap={cap} className="dark:stroke-white" />
          <path
            d="M20 16c-2 2-2 5 0 7M28 14c-2 3-2 6 0 9M36 16c-2 2-2 5 0 7"
            stroke="#E02B20"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.9"
          />
        </svg>
      );
    case "orange":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M22 18c6-4 14-4 20 0l3 6v15c0 11-7 16-13 16s-13-5-13-16V24l3-6z"
            fill="#F97316"
            opacity="0.95"
          />
          <path
            d="M26 24h12"
            stroke="#ffffff"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.9"
          />
          <circle cx="32" cy="32" r="4" fill="#0F172A" opacity="0.18" />
        </svg>
      );
    case "pumpkin":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M32 22c-10 0-16 8-16 18s6 14 16 14 16-4 16-14-6-18-16-18z"
            fill="#D97706"
            opacity="0.95"
          />
          <path
            d="M22 30c2-6 6-8 10-8M42 30c-2-6-6-8-10-8"
            stroke="#FCD34D"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.9"
          />
          <path
            d="M32 16c-2 4-2 6 0 10"
            stroke="#16A34A"
            strokeWidth={4}
            strokeLinecap={cap}
          />
        </svg>
      );
    case "poppy":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M18 28c4-9 12-12 14-6 2-6 10-3 14 6-6 10-22 10-28 0z"
            fill="#E02B20"
            opacity="0.95"
          />
          <circle cx="32" cy="28" r="5.5" fill="#0F172A" opacity="0.9" />
          <path
            d="M32 33v18"
            stroke="#0F172A"
            strokeWidth={4}
            strokeLinecap={cap}
            className="dark:stroke-white"
          />
        </svg>
      );
    case "party":
      return (
        <svg className={`${common} ${base}`} viewBox="0 0 64 64" fill="none" aria-hidden>
          <defs>
            <linearGradient id="hat" x1="18" y1="18" x2="48" y2="50" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0B3EAF" />
              <stop offset="1" stopColor="#A7D344" />
            </linearGradient>
          </defs>
          <path d="M20 46l14-26 14 26H20z" fill="url(#hat)" opacity="0.95" />
          <path
            d="M24 46h20"
            stroke="#0F172A"
            strokeWidth={4}
            strokeLinecap={cap}
            className="dark:stroke-white"
          />
          <circle cx="34" cy="18" r="3.2" fill="#E02B20" />
          <path
            d="M14 22l6 2M50 24l-6 2M46 14l-3 5"
            stroke="#E02B20"
            strokeWidth={stroke}
            strokeLinecap={cap}
            opacity="0.85"
          />
        </svg>
      );
    default:
      return null;
  }
}

export default function EmployeeEngagementCalendarPage() {
  return (
    <>
      <PageHeader
        title="Employee engagement calendar"
        subtitle="Monthly moments and activities — consistent across all facilities."
      />
      <main className={PAGE_SHELL}>
        <section className="card overflow-hidden p-0">
          <div className="relative border-b border-slate-200/80 bg-white px-4 py-5 dark:border-white/10 dark:bg-[#0f0f0f] sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
              <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[#0B3EAF]/10 blur-2xl dark:bg-[#A7D344]/10" />
              <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-[#E02B20]/10 blur-2xl dark:bg-[#E02B20]/10" />
            </div>
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#eef2fb] px-3 py-1 text-xs font-extrabold text-[#0B3EAF] ring-1 ring-[#0B3EAF]/10 dark:bg-white/10 dark:text-[#A7D344] dark:ring-white/10">
                    2026
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Employee Engagement Calendar</p>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/70">
                  Quick reference for the year — events are coordinated by HR/Leadership.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-5 dark:bg-white/5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {MONTHS.map((m) => (
                <section
                  key={m.name}
                  className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-200/60 transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-md dark:border-white/10 dark:bg-[#0f0f0f] dark:ring-white/5"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${m.theme.bar}`} aria-hidden />
                        <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{m.name}</p>
                      </div>
                    </div>
                    <div className="shrink-0">{m.art ? <TinyArt kind={m.art} /> : null}</div>
                  </div>
                  <div className="border-t border-slate-200/70 px-3 py-3 dark:border-white/10">
                    <ul className="space-y-1.5">
                      {m.items.map((it) => (
                        <li key={it.title} className="text-sm font-semibold text-slate-900 dark:text-white">
                          {it.title}
                          {it.meta ? (
                            <span className={`ml-1 font-bold ${m.theme.accent}`}>{it.meta}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
