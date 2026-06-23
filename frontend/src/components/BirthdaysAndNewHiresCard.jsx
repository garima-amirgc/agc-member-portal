import { Link } from "react-router-dom";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { formatSpotlightFeedDate } from "../utils/spotlightFeedDisplay";

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
  const sub = isAnniversary && Number.isFinite(years) && years >= 1 ? `${years} yr${years === 1 ? "" : "s"}` : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5"
    >
      <Avatar src={img} name={item?.name} accent={isAnniversary ? "blue" : "green"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item?.name || "—"}</p>
        {sub ? <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{sub} anniversary</p> : null}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">{item?.label || ""}</span>
    </button>
  );
}

function NewHireRow({ entry }) {
  const img = entry.image_url ? resolvePublicMediaUrl(entry.image_url) : "";
  const name = String(entry.title || "").trim();
  const role = String(entry.description || "").trim();
  const dateLabel = formatSpotlightFeedDate(entry.created_at);

  return (
    <div className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-slate-50 dark:hover:bg-white/5">
      <Avatar src={img} name={name} accent="blue" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
        {role ? <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{role}</p> : null}
      </div>
      {dateLabel ? (
        <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">{dateLabel}</span>
      ) : null}
    </div>
  );
}

export default function BirthdaysAndNewHiresCard({
  birthdayCards,
  anniversaryCards,
  birthdaysLoading,
  onCelebrationClick,
  newHireEntries,
  newHireLoading,
  canManageNewHires,
}) {
  const hasCelebrations = (birthdayCards?.length || 0) > 0 || (anniversaryCards?.length || 0) > 0;
  const hasNewHires = (newHireEntries?.length || 0) > 0;

  return (
    <div className="card relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#A7D344] to-[#0B3EAF]" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          Birthdays &amp; New Hires
        </h2>
      </div>

      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Birthdays &amp; Anniversaries
          </h3>
          {birthdaysLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !hasCelebrations ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No birthdays or anniversaries coming up.</p>
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

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              New Hires
            </h3>
            {canManageNewHires ? (
              <Link
                to="/admin/new-hires"
                className="text-[10px] font-bold text-[#0B3EAF] underline underline-offset-2 dark:text-[#A7D344]"
              >
                Manage
              </Link>
            ) : null}
          </div>
          {newHireLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
          ) : !hasNewHires ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No new hires have been published yet.</p>
          ) : (
            <div className="space-y-0.5">
              {newHireEntries.map((entry) => (
                <NewHireRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
