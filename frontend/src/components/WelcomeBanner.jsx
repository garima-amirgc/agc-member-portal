import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function greetingForHour(h) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name = "") {
  const part = String(name).trim().split(/\s+/).filter(Boolean)[0];
  return part || "there";
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function WelcomeBanner({ user }) {
  const photo = resolvePublicMediaUrl(user?.profile_image_url);
  const place = String(user?.business_unit || user?.facility_name || "").trim() || "the portal";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3EAF] to-[#082d82] p-5 shadow-sm sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#A7D344]/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden />

      <div className="relative flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/40 sm:h-20 sm:w-20">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-white sm:text-xl">{initials(user?.name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white sm:text-xl">
            {greetingForHour(new Date().getHours())}, {firstName(user?.name)}! 👋
          </h1>
          <p className="mt-0.5 text-sm text-white/85">Here&apos;s what&apos;s happening at {place} today.</p>
          <p className="mt-2 text-xs text-white/65">{todayLabel()}</p>
        </div>
      </div>
    </div>
  );
}
