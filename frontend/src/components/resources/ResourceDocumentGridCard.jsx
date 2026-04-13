import { Link } from "react-router-dom";
import ResourceDocumentPreview from "./ResourceDocumentPreview";

/**
 * Card layout aligned with training video tiles: title row, aspect preview, helper line.
 */
export default function ResourceDocumentGridCard({
  title,
  url,
  metaLine,
  linkTo,
  rightSlot,
  tailHint = "Click to open.",
}) {
  return (
    <div className="rounded-xl border p-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {linkTo ? (
            <Link
              to={linkTo}
              className="font-bold text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green"
            >
              {title}
            </Link>
          ) : (
            <div className="font-bold text-brand-blue dark:text-brand-green">{title}</div>
          )}
          {metaLine ? (
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{metaLine}</div>
          ) : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl bg-black/5 dark:bg-black/30">
        {linkTo ? (
          <Link to={linkTo} className="block">
            <ResourceDocumentPreview url={url} />
          </Link>
        ) : (
          <ResourceDocumentPreview url={url} />
        )}
      </div>

      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tailHint}</div>
    </div>
  );
}
