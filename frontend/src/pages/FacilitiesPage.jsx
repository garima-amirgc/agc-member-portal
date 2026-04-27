import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { FACILITY_CODES } from "../constants/facilities";
import { PAGE_SHELL } from "../constants/pageLayout";
import { Link } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";

export default function FacilitiesPage() {
  const [me, setMe] = useState(null);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    (async () => {
      const [meRes, assignmentsRes] = await Promise.all([api.get("/users/me"), api.get("/assignments/me")]);
      setMe(meRes.data);
      setAssignments(assignmentsRes.data);
    })();
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
        <p className="text-sm text-[#0B3EAF] dark:text-[#A7D344]">
          Training assignments and progress by facility.
        </p>
      </section>

      <section className="min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {FACILITY_CODES.map((f) => {
            const hasAccess = accessSet.has(f);
            const meta = progressByFacility[f];
            return (
              <Link
                key={f}
                to={`/facilities/${f}`}
                className={`card block transition ${hasAccess ? "" : "opacity-70 ring-1 ring-amber-200/80 dark:ring-amber-900/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{f}</div>
                  <div className="text-sm font-medium text-[#0B3EAF] dark:text-[#A7D344]">{meta.count} course(s)</div>
                </div>
                <div className="mt-3">
                  <ProgressBar value={meta.avgProgress} />
                </div>
                <div className="mt-2 text-sm font-medium text-[#000000] dark:text-white/90">{meta.avgProgress}% avg progress</div>
                {!hasAccess && (
                  <div className="mt-2 text-xs font-semibold text-[#E02B20]">View page — course access not assigned</div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
