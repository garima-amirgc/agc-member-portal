import { useEffect, useState } from "react";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function FacilityBadge({ label }) {
  return (
    <span className="rounded bg-[#0B3EAF]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B3EAF] dark:bg-[#A7D344]/15 dark:text-[#A7D344]">
      {label}
    </span>
  );
}

function DepartmentBadge({ label }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {label}
    </span>
  );
}

function NewsfeedCard({ item }) {
  const imgSrc = item.image_url ? resolvePublicMediaUrl(item.image_url) : null;

  return (
    <div className="card overflow-hidden rounded-2xl p-0">
      {/* Image */}
      {imgSrc && (
        <div className="relative h-48 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          <img
            src={imgSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Badges */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {Array.isArray(item.facilities) &&
            item.facilities.map((f) => <FacilityBadge key={f} label={f} />)}
          {item.department ? <DepartmentBadge label={item.department} /> : null}
        </div>

        <h2 className="text-base font-bold leading-snug text-slate-900 dark:text-white">
          {item.title}
        </h2>

        {item.body ? (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {item.body}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function NewsfeedPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/hr-newsfeed/current")
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className={PAGE_SHELL}>
      <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">Newsfeed</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#0B3EAF] dark:border-slate-700 dark:border-t-[#A7D344]" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No news items have been published yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <NewsfeedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
