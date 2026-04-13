import { resolvePublicMediaUrl } from "../utils/mediaUrl";

/**
 * Pick ISO strings from API row (snake_case; tolerate odd casings).
 * @param {Record<string, unknown>} ev
 */
function getEventTimeIso(ev) {
  const a = ev?.event_at ?? ev?.EVENT_AT;
  const b = ev?.start_at ?? ev?.START_AT;
  const s = (a != null && String(a).trim() !== "" ? a : b) ?? "";
  const t = s ? new Date(String(s)).getTime() : NaN;
  return Number.isFinite(t) ? String(s) : null;
}

function getVisibleFromIso(ev) {
  const a = ev?.show_from_at ?? ev?.SHOW_FROM_AT;
  const s = a != null ? String(a).trim() : "";
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? s : null;
}

/**
 * Published facility upcoming events.
 * @param {boolean} showFacility - when true, show AGC/AQM/… badge (e.g. merged home feed).
 * @param {boolean} compact - sidebars: smaller type; order is image (if any) → title → date → detail.
 */
export default function UpcomingEventCards({ items, loading, showFacility = false, compact = false }) {
  if (loading) {
    return (
      <p className={compact ? "text-[11px] text-slate-500 dark:text-slate-400" : "text-sm text-slate-500 dark:text-slate-400"}>
        Loading upcoming…
      </p>
    );
  }
  if (!items?.length) {
    return (
      <p className={compact ? "text-[11px] text-slate-500 dark:text-slate-400" : "text-sm text-slate-500 dark:text-slate-400"}>
        No upcoming events right now.
      </p>
    );
  }
  const now = Date.now();
  const gap = compact ? "space-y-2.5" : "space-y-4";
  return (
    <div className={`${gap} ${compact ? "text-xs" : "text-sm"}`}>
      {items.map((ev) => {
        const eventIso = getEventTimeIso(ev);
        const eventMs = eventIso ? new Date(eventIso).getTime() : NaN;
        const hasEventTime = Number.isFinite(eventMs);
        const isFuture = hasEventTime && eventMs > now;

        const visibleIso = !hasEventTime ? getVisibleFromIso(ev) : null;
        const visibleMs = visibleIso ? new Date(visibleIso).getTime() : NaN;
        const hasVisibleLine = Boolean(visibleIso && Number.isFinite(visibleMs));

        const imgSrc = resolvePublicMediaUrl(ev.image_url);
        const hasImage = Boolean(imgSrc);

        const pad = compact ? "p-3" : "p-4";
        const titleCls = compact
          ? "text-sm font-semibold leading-snug text-white"
          : "text-base font-semibold leading-snug text-white";
        const bodyCls = compact
          ? "line-clamp-2 break-words text-[11px] leading-relaxed text-white/85"
          : "line-clamp-3 break-words text-sm leading-relaxed text-white/90";

        const dateBlock = hasEventTime ? (
          compact ? (
            <p className="text-[11px] font-medium leading-snug text-brand-green">
              {isFuture ? formatEventWhen(eventIso) : `Started ${formatEventWhen(eventIso)}`}
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-brand-green">
              {isFuture ? `Event time: ${formatEventWhen(eventIso)}` : `Started: ${formatEventWhen(eventIso)}`}
            </p>
          )
        ) : hasVisibleLine ? (
          compact ? (
            <p className="text-[11px] font-medium leading-snug text-brand-green">From {formatEventWhen(visibleIso)}</p>
          ) : (
            <p className="mt-2 text-xs font-medium text-brand-green">In listings from: {formatEventWhen(visibleIso)}</p>
          )
        ) : compact ? (
          <p className="text-[11px] leading-snug text-white/55">
            Event date &amp; time not set — add it in <span className="text-white/80">Upcoming admin</span>.
          </p>
        ) : null;

        return (
          <article
            key={ev.id}
            className={`upcoming-event-card flex flex-col overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-[#1558d6] via-[#0C3EB0] to-[#06245c] shadow-md ring-1 ring-white/10 ${compact ? "" : "rounded-2xl shadow-lg"}`}
          >
            {hasImage ? (
              <div
                className={`flex w-full shrink-0 items-center justify-center border-b border-white/10 bg-black/20 px-2 ${
                  compact ? "py-2" : "py-3"
                }`}
              >
                <img
                  src={imgSrc}
                  alt=""
                  className={`w-full max-w-full ${compact ? "max-h-36 rounded-t-[10px] object-cover" : "max-h-48 object-contain"}`}
                  loading="lazy"
                />
              </div>
            ) : null}

            <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${pad}`}>
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                {showFacility && ev.business_unit ? (
                  <span
                    className={
                      compact
                        ? "rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        : "rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                    }
                  >
                    {ev.business_unit}
                  </span>
                ) : null}
                <h3 className={titleCls}>{ev.title}</h3>
              </div>

              {dateBlock}

              {ev.detail ? <p className={`${compact ? "mt-0.5" : "mt-2"} ${bodyCls}`}>{ev.detail}</p> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatEventWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
