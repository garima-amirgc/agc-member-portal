import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { FACILITY_CODES } from "../constants/facilities";
import { PAGE_SHELL } from "../constants/pageLayout";
import { Link } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";

export default function FacilitiesPage() {
  const [me, setMe] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [facilityCounts, setFacilityCounts] = useState({});
  const [notice, setNotice] = useState(null); // string | null

  useEffect(() => {
    (async () => {
      const [meRes, assignmentsRes] = await Promise.all([api.get("/users/me"), api.get("/assignments/me")]);
      setMe(meRes.data);
      setAssignments(assignmentsRes.data);
    })();
  }, []);

  // Fetch real video + doc counts for all facilities
  useEffect(() => {
    Promise.all(
      FACILITY_CODES.map(async (f) => {
        try {
          const { data } = await api.get(`/resources/facility/${f}/counts`);
          return [f, data];
        } catch {
          return [f, { videos: 0, docs: 0, total: 0 }];
        }
      })
    ).then((results) => setFacilityCounts(Object.fromEntries(results)));
  }, []);

  const accessSet = useMemo(() => new Set(me?.facilities ?? []), [me]);

  const progressByFacility = useMemo(() => {
    const map = {};
    for (const f of FACILITY_CODES) map[f] = { count: 0, avgProgress: 0 };
    for (const a of assignments) {
      const bu = a.course_business_unit;
      if (!map[bu]) continue;
      map[bu].count += 1;
      map[bu].avgProgress += a.progress ?? 0;
    }
    for (const f of FACILITY_CODES) {
      if (map[f].count > 0) map[f].avgProgress = Math.round(map[f].avgProgress / map[f].count);
    }
    return map;
  }, [assignments]);

  return (
    <main className={PAGE_SHELL}>
      <section>
        <h1 className="mb-3 text-2xl font-bold text-[#000000] dark:text-white">Facilities</h1>
      </section>

      <section className="min-w-0">
        {notice ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">Access restricted</div>
                <div className="mt-0.5 text-xs leading-relaxed opacity-90">{notice}</div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-amber-300/70 bg-white/60 px-2 py-1 text-xs font-semibold text-amber-950 transition hover:bg-white dark:border-amber-800/60 dark:bg-white/10 dark:text-amber-100 dark:hover:bg-white/15"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {FACILITY_CODES.map((f) => {
            const hasAccess = accessSet.has(f);
            const meta = progressByFacility[f];
            const counts = facilityCounts[f] || { videos: 0, docs: 0, total: 0 };
            return (
              <Link
                key={f}
                to={`/facilities/${f}`}
                onClick={(e) => {
                  if (hasAccess) return;
                  e.preventDefault();
                  setNotice(
                    `You don’t currently have access to the ${f} facility. If you believe this is a mistake, please contact your administrator to update your facility access.`
                  );
                }}
                className={`card block transition ${
                  hasAccess
                    ? ""
                    : "cursor-not-allowed opacity-70 ring-1 ring-amber-200/80 dark:ring-amber-900/50"
                }`}
                aria-disabled={!hasAccess}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{f}</div>
                  <div className="text-right text-xs font-medium text-[#0B3EAF] dark:text-[#A7D344]">
                    <div>{counts.videos} video{counts.videos !== 1 ? "s" : ""}</div>
                    <div>{counts.docs} doc{counts.docs !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar value={meta.avgProgress} />
                </div>
                <div className="mt-2 text-sm font-medium text-[#000000] dark:text-white/90">{meta.avgProgress}% avg progress</div>
                {!hasAccess && (
                  <div className="mt-2 text-xs font-semibold text-[#E02B20]">Access restricted</div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
