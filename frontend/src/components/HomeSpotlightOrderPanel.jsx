import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import { BOTTOM_ROW_FEEDS } from "../constants/spotlightFeedConfig";

const WIDGET_LABELS = Object.fromEntries(BOTTOM_ROW_FEEDS.map((feed) => [feed.widgetKey, feed.cardTitle]));
const ALLOWED_KEYS = BOTTOM_ROW_FEEDS.map((feed) => feed.widgetKey);

function normalizeOrder(raw) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const key = String(item || "").trim();
      if (!ALLOWED_KEYS.includes(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  for (const key of ALLOWED_KEYS) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

export default function HomeSpotlightOrderPanel() {
  const [order, setOrder] = useState(normalizeOrder(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/home-spotlight/layout");
      setOrder(normalizeOrder(data?.order));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not load home page order."));
      setOrder(normalizeOrder(null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveOrder = async (nextOrder) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/home-spotlight/layout", { order: nextOrder });
      setOrder(normalizeOrder(data?.order));
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save home page order."));
    } finally {
      setSaving(false);
    }
  };

  const moveWidget = (index, direction) => {
    const next = [...order];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setOrder(next);
    void saveOrder(next);
  };

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Second row card order</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Employee of the Month and Leadership Updates stay on the first row. Choose whether New Hires or Customer
          Wins appears on the left below the divider.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading order…</p>
      ) : (
        <ul className="space-y-2">
          {order.map((key, index) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/20"
            >
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {index + 1}. {WIDGET_LABELS[key] || key}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-outline px-2 py-1 text-xs"
                  disabled={saving || index === 0}
                  onClick={() => moveWidget(index, "up")}
                  aria-label={`Move ${WIDGET_LABELS[key]} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-outline px-2 py-1 text-xs"
                  disabled={saving || index === order.length - 1}
                  onClick={() => moveWidget(index, "down")}
                  aria-label={`Move ${WIDGET_LABELS[key]} down`}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
