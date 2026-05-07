import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PAGE_SHELL } from "../constants/pageLayout";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import {
  DEFAULT_CALENDAR_MONTHS,
  DEFAULT_CALENDAR_SUBTITLE,
  DEFAULT_CALENDAR_YEAR,
  ENGAGEMENT_ART_KINDS,
  normalizeEngagementMonths,
} from "../data/engagementCalendarDefault";

function deepCloneMonths(m) {
  return JSON.parse(JSON.stringify(m));
}

export default function AdminEngagementCalendarPage() {
  const [year, setYear] = useState(DEFAULT_CALENDAR_YEAR);
  const [subtitle, setSubtitle] = useState(DEFAULT_CALENDAR_SUBTITLE);
  const [months, setMonths] = useState(() => deepCloneMonths(DEFAULT_CALENDAR_MONTHS));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  /** Which month panels are expanded (accordion — avoid native <details> + React state bugs). */
  const [openMonths, setOpenMonths] = useState(() => new Set([0]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/engagement-calendar");
      setYear(Number(data.year) || DEFAULT_CALENDAR_YEAR);
      setSubtitle(data.subtitle != null ? String(data.subtitle) : DEFAULT_CALENDAR_SUBTITLE);
      const normalized = normalizeEngagementMonths(data.months);
      setMonths(deepCloneMonths(normalized || DEFAULT_CALENDAR_MONTHS));
      setUpdatedAt(data.updatedAt || null);
      setOpenMonths(new Set([0]));
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load engagement calendar."));
      setMonths(deepCloneMonths(DEFAULT_CALENDAR_MONTHS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMonth = (idx, patch) => {
    setMonths((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const updateTheme = (idx, key, value) => {
    setMonths((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        theme: { ...next[idx].theme, [key]: value },
      };
      return next;
    });
  };

  const updateItem = (mIdx, iIdx, field, value) => {
    setMonths((prev) => {
      const next = [...prev];
      const items = [...(next[mIdx].items || [])];
      items[iIdx] = { ...items[iIdx], [field]: value };
      next[mIdx] = { ...next[mIdx], items };
      return next;
    });
  };

  const addItem = (mIdx) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      next.add(mIdx);
      return next;
    });
    setMonths((prev) => {
      const next = [...prev];
      next[mIdx] = {
        ...next[mIdx],
        items: [...(next[mIdx].items || []), { title: "New event", meta: "" }],
      };
      return next;
    });
  };

  const removeItem = (mIdx, iIdx) => {
    setMonths((prev) => {
      const next = [...prev];
      const items = (next[mIdx].items || []).filter((_, j) => j !== iIdx);
      next[mIdx] = { ...next[mIdx], items };
      return next;
    });
  };

  const toggleMonth = (mi) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(mi)) next.delete(mi);
      else next.add(mi);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const monthsPayload = normalizeEngagementMonths(months);
      if (!monthsPayload) {
        setError("Month data looks invalid (need 12 months). Try reloading the page.");
        return;
      }
      const { data } = await api.put("/api/engagement-calendar", {
        year,
        subtitle,
        months: monthsPayload,
      });
      setUpdatedAt(data.updatedAt || null);
      setMessage("Calendar saved.");
      if (Array.isArray(data.months)) {
        const savedNorm = normalizeEngagementMonths(data.months);
        if (savedNorm) setMonths(deepCloneMonths(savedNorm));
      }
      if (data.subtitle != null) setSubtitle(String(data.subtitle));
      if (data.year != null) setYear(Number(data.year));
    } catch (e) {
      setError(friendlyErrorMessage(e, "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  const fieldLabel = "block text-xs font-semibold text-slate-700 dark:text-slate-300";
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#0B3EAF] focus:outline-none focus:ring-1 focus:ring-[#0B3EAF] dark:border-white/15 dark:bg-[#141414] dark:text-white";

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        title="Engagement calendar (admin)"
        subtitle="Edit the same calendar everyone sees under Engagement calendar. Twelve months; theme colors use Tailwind classes."
      />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link to="/employee-engagement-calendar" className="btn-secondary text-sm">
            View public calendar
          </Link>
          <Link to="/admin" className="btn-secondary text-sm">
            Learning admin
          </Link>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-slate-600 dark:text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-6">
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/50 dark:text-emerald-100">
                {message}
              </div>
            ) : null}

            <section className="card space-y-4 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={fieldLabel} htmlFor="ec-year">
                    Calendar year (badge)
                  </label>
                  <input
                    id="ec-year"
                    type="number"
                    min={2000}
                    max={2100}
                    className={inputClass}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={fieldLabel} htmlFor="ec-sub">
                    Intro line (under header)
                  </label>
                  <textarea
                    id="ec-sub"
                    rows={2}
                    className={inputClass}
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                  />
                </div>
              </div>
              {updatedAt ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Last updated: {updatedAt}</p>
              ) : null}
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save calendar"}
              </button>
            </section>

            <div className="space-y-3">
              {months.map((m, mi) => (
                <div
                  key={`eng-cal-month-${mi}`}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#101010]"
                >
                  <button
                    type="button"
                    className="flex w-full list-none items-center justify-between gap-2 px-4 py-3 text-left font-semibold text-[#0B3EAF] ring-1 ring-slate-100 dark:text-[#A7D344] dark:ring-white/5"
                    aria-expanded={openMonths.has(mi)}
                    onClick={() => toggleMonth(mi)}
                  >
                    <span>
                      Month {mi + 1}: {m.name || "—"}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-slate-500 dark:text-slate-400">
                      {openMonths.has(mi) ? "Collapse" : "Expand"}
                    </span>
                  </button>
                  {openMonths.has(mi) ? (
                  <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-white/10">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={fieldLabel}>Month name</label>
                        <input
                          className={inputClass}
                          value={m.name}
                          onChange={(e) => updateMonth(mi, { name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={fieldLabel}>Art icon</label>
                        <select
                          className={inputClass}
                          value={m.art || "fireworks"}
                          onChange={(e) => updateMonth(mi, { art: e.target.value })}
                        >
                          {ENGAGEMENT_ART_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={fieldLabel}>Theme bar (Tailwind class)</label>
                        <input
                          className={inputClass}
                          value={m.theme?.bar || ""}
                          onChange={(e) => updateTheme(mi, "bar", e.target.value)}
                          placeholder="e.g. bg-[#b23b44]"
                        />
                      </div>
                      <div>
                        <label className={fieldLabel}>Theme accent (Tailwind class)</label>
                        <input
                          className={inputClass}
                          value={m.theme?.accent || ""}
                          onChange={(e) => updateTheme(mi, "accent", e.target.value)}
                          placeholder="e.g. text-[#b23b44]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={fieldLabel}>Events</span>
                        <button
                          type="button"
                          className="text-sm font-semibold text-[#0B3EAF] underline dark:text-[#A7D344]"
                          onClick={(e) => {
                            e.preventDefault();
                            addItem(mi);
                          }}
                        >
                          + Add event
                        </button>
                      </div>
                      <ul className="space-y-3">
                        {(m.items || []).map((it, ii) => (
                          <li key={`${mi}-${ii}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-white/10 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1">
                              <label className={fieldLabel}>Title</label>
                              <input
                                className={inputClass}
                                value={it.title}
                                onChange={(e) => updateItem(mi, ii, "title", e.target.value)}
                              />
                            </div>
                            <div className="w-full sm:w-40">
                              <label className={fieldLabel}>Date note</label>
                              <input
                                className={inputClass}
                                value={it.meta || ""}
                                onChange={(e) => updateItem(mi, ii, "meta", e.target.value)}
                                placeholder="e.g. 10th"
                              />
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              onClick={() => removeItem(mi, ii)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex justify-end pb-8">
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save calendar"}
              </button>
            </div>
          </div>
        )}
    </main>
  );
}
