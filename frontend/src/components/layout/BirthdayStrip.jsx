import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { PAGE_GUTTER_X } from "../../constants/pageLayout";
import { friendlyErrorMessage } from "../../services/friendlyError";

function uniqById(arr) {
  const seen = new Set();
  const out = [];
  for (const it of arr || []) {
    const id = it?.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

function safeText(v) {
  return String(v ?? "").trim();
}

export default function BirthdayStrip() {
  const [data, setData] = useState({ today: [], upcoming: [], range_days: 365 });
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    api
      .get("/birthdays/feed", { params: { days: 365 } })
      .then((res) => {
        if (!alive) return;
        const d = res.data || {};
        setData({
          today: Array.isArray(d.today) ? d.today : [],
          upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
          range_days: Number(d.range_days) || 365,
        });
      })
      .catch((e) => {
        if (!alive) return;
        const st = e.response?.status;
        if (st === 401) return; // not logged in (shouldn't happen inside AuthenticatedLayout)
        setError(friendlyErrorMessage(e, "Could not load birthdays."));
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = useMemo(() => uniqById(data.today).slice(0, 6), [data.today]);
  const todayLine = useMemo(() => {
    if (today.length === 0) return "";
    return today
      .map((b) => {
        const name = safeText(b.name) || "—";
        const facility = safeText(b.facility_name || b.company_name);
        return facility ? `${name} (${facility})` : name;
      })
      .join(", ");
  }, [today]);

  // Keep the UI minimal: show only the celebration line (and only when we have someone to celebrate).
  if (!todayLine && !error) return null;

  return (
    <div className={`border-b border-slate-200/90 bg-white/80 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f0f0f]/75 ${PAGE_GUTTER_X}`}>
      <div className="rounded-2xl border border-[#0B3EAF]/15 bg-gradient-to-r from-[#eef2fb] via-white to-[#fff8f7] px-4 py-2.5 shadow-sm ring-1 ring-white/60 dark:border-[#A7D344]/20 dark:from-white/5 dark:via-[#141414] dark:to-[#221a1a] dark:ring-white/5">
        {error ? (
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">{error}</div>
        ) : (
          <div className="overflow-hidden">
            <div className="flex w-max motion-reduce:translate-x-0 motion-reduce:animate-none [animation:agc-bday-marquee_14s_linear_infinite] hover:[animation-play-state:paused]">
              <div className="flex shrink-0 items-center pr-10">
                <p className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">
                  🎉 Everyone, let’s wish{" "}
                  <span className="rounded-full bg-[#0B3EAF]/10 px-2 py-0.5 font-extrabold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                    {todayLine}
                  </span>{" "}
                  a very Happy Birthday!
                </p>
              </div>
              {/* Duplicate immediately after the first track for a continuous loop */}
              <div className="flex shrink-0 items-center pr-10" aria-hidden>
                <p className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">
                  🎉 Everyone, let’s wish{" "}
                  <span className="rounded-full bg-[#0B3EAF]/10 px-2 py-0.5 font-extrabold text-[#0B3EAF] dark:bg-white/10 dark:text-[#A7D344]">
                    {todayLine}
                  </span>{" "}
                  a very Happy Birthday!
                </p>
              </div>
            </div>
            <style>{`
              @keyframes agc-bday-marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}

