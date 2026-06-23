import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function initialsFromName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function Avatar({ src, name, accent = "green" }) {
  const ring = accent === "blue" ? "ring-[#0B3EAF]/15 bg-[#0B3EAF]/10" : "ring-[#A7D344]/25 bg-[#A7D344]/20";
  return (
    <div className={`h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ${ring} dark:bg-white/10 dark:ring-white/15`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-[#0B3EAF] dark:text-[#A7D344]">
          {initialsFromName(name)}
        </div>
      )}
    </div>
  );
}

function CelebrationRow({ item, kind, onClick }) {
  const img = resolvePublicMediaUrl(item?.profile_image_url);
  const isAnniversary = kind === "anniversary";
  const years = Number(item?.years_employed);
  const sub = isAnniversary
    ? (Number.isFinite(years) && years >= 1 ? `${years} yr${years === 1 ? "" : "s"} anniversary` : "Work anniversary")
    : "Birthday";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
    >
      <Avatar src={img} name={item?.name} accent={isAnniversary ? "blue" : "green"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item?.name || "—"}</p>
        {sub ? <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{sub}</p> : null}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">{item?.label || ""}</span>
    </button>
  );
}

export default function BirthdaysCard({ birthdayCards, anniversaryCards, birthdaysLoading, onCelebrationClick }) {
  const hasCelebrations = (birthdayCards?.length || 0) > 0 || (anniversaryCards?.length || 0) > 0;

  if (!birthdaysLoading && !hasCelebrations) return null;

  return (
    <div className="card relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#A7D344] to-[#0B3EAF]" aria-hidden />
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        Birthdays &amp; Anniversaries
      </h2>

      <div className="mt-3">
        {birthdaysLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-0.5">
            {(birthdayCards || []).map((b) => (
              <CelebrationRow
                key={`bday-${b?.id ?? "b"}`}
                item={b}
                kind="birthday"
                onClick={() => onCelebrationClick?.({ ...b, in_days: Number(b?.in_days) || 0, celebrationKind: "birthday" })}
              />
            ))}
            {(anniversaryCards || []).map((a) => (
              <CelebrationRow
                key={`ann-${a?.id ?? "a"}`}
                item={a}
                kind="anniversary"
                onClick={() => onCelebrationClick?.({ ...a, celebrationKind: "anniversary" })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
