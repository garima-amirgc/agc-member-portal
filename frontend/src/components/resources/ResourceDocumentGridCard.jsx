import { Link } from "react-router-dom";
import ResourceDocumentPreview from "./ResourceDocumentPreview";

export default function ResourceDocumentGridCard({
  title,
  url,
  description,
  metaLine,
  addedLabel,
  linkTo,
  rightSlot,
  tailHint,
  openButtonLabel = "Open document",
  compactPreview = false,
}) {
  const descText = description || metaLine;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="min-w-0">
        {linkTo ? (
          <Link
            to={linkTo}
            className="text-lg font-bold text-brand-blue hover:text-brand-blue-hover hover:underline dark:text-brand-green"
          >
            {title}
          </Link>
        ) : (
          <div className="text-lg font-bold text-brand-blue dark:text-brand-green">{title}</div>
        )}
        {descText ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{descText}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {linkTo ? (
          <Link to={linkTo} className="btn-primary inline-flex text-sm no-underline">
            {openButtonLabel}
          </Link>
        ) : null}
        {rightSlot ? <div className="flex flex-wrap gap-2">{rightSlot}</div> : null}
      </div>

      {addedLabel ? (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Uploaded on {addedLabel}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-black/5 dark:bg-black/30">
        {linkTo ? (
          <Link to={linkTo} className="block">
            <ResourceDocumentPreview url={url} compact={compactPreview} />
          </Link>
        ) : (
          <ResourceDocumentPreview url={url} compact={compactPreview} />
        )}
      </div>

      {tailHint ? <p className="text-xs text-slate-500 dark:text-slate-400">{tailHint}</p> : null}
    </div>
  );
}
