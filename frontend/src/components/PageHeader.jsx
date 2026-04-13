import { useAuth } from "../context/AuthContext";
import { PAGE_GUTTER_X } from "../constants/pageLayout";

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function PageHeader({ title = "Dashboard", subtitle, sectionTitle, showGreeting = false }) {
  const { user } = useAuth();
  const first = user?.name?.split(/\s+/)[0] || "there";

  return (
    <header
      className={`relative overflow-hidden border-b border-slate-200/90 bg-white py-8 dark:border-white/10 dark:bg-[#0f0f0f] ${PAGE_GUTTER_X}`}
    >
      <div className="agc-page-header-stripe absolute inset-x-0 top-0" aria-hidden />
      <div className="relative pt-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">{title}</h1>
        {showGreeting ? (
          <p className="mt-2 text-base text-slate-600 dark:text-white/70">
            {greetingForNow()},{" "}
            <span className="font-semibold text-[#0B3EAF] dark:text-[#A7D344]">{first}</span>
          </p>
        ) : null}
        {subtitle != null && subtitle !== "" && (
          <p className="mt-1 text-sm text-slate-600 dark:text-[#A7D344]/90">{subtitle}</p>
        )}
        {sectionTitle ? (
          <p className="mt-5 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{sectionTitle}</p>
        ) : null}
      </div>
    </header>
  );
}
