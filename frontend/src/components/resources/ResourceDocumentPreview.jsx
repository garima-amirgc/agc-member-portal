import { useState } from "react";
import { resolveResourceAssetUrl } from "../../utils/resourceAssetUrl";

function inferKind(url) {
  const p = String(url || "").split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(p)) return "image";
  if (p.endsWith(".pdf")) return "pdf";
  if (/\.(doc|docx|ppt|pptx|xls|xlsx|txt)$/i.test(p)) return "office";
  return "generic";
}

function extLabel(url) {
  const p = String(url || "").split("?")[0];
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1].toUpperCase().slice(0, 5) : "FILE";
}

function Placeholder({ kind, url }) {
  const label = kind === "pdf" ? "PDF" : extLabel(url);
  const bg =
    kind === "pdf"
      ? "from-rose-600/90 to-rose-800/90"
      : kind === "office"
        ? "from-slate-600/85 to-slate-800/90"
        : "from-[#0B3EAF]/85 to-[#082d82]/90";

  return (
    <div
      className={`flex aspect-video w-full flex-col items-center justify-center bg-gradient-to-br px-4 text-center ${bg}`}
      aria-hidden
    >
      <svg className="mb-2 h-12 w-12 text-white/95" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
      </svg>
      <span className="text-xs font-bold uppercase tracking-wide text-white/95">{label}</span>
    </div>
  );
}

/**
 * Thumbnail-style preview for resource documents (category grid). Images use the public URL; other types use a styled placeholder.
 */
export default function ResourceDocumentPreview({ url }) {
  const kind = inferKind(url);
  const src = resolveResourceAssetUrl(url);
  const [imgFailed, setImgFailed] = useState(false);

  if (kind === "image" && src && !imgFailed) {
    return (
      <img
        src={src}
        alt=""
        className="aspect-video w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <Placeholder kind={imgFailed ? "generic" : kind} url={url} />;
}
