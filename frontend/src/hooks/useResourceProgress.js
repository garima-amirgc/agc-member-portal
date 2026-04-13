import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

/** @returns {{ resource_kind: 'lesson'|'document', resource_id: number } | null} */
export function parseResourceItemId(id) {
  const m = /^lesson-(\d+)$/.exec(String(id || ""));
  if (m) return { resource_kind: "lesson", resource_id: Number(m[1]) };
  const d = /^doc-(\d+)$/.exec(String(id || ""));
  if (d) return { resource_kind: "document", resource_id: Number(d[1]) };
  return null;
}

/**
 * Server-backed completion for a facility resources category (same ids as list API: lesson-N, doc-N).
 * @param {string} facilityNorm e.g. AGC
 * @param {string} categoryKey e.g. finance
 * @param {boolean} enabled fetch only when true (e.g. user signed in and route valid)
 */
export function useResourceProgress(facilityNorm, categoryKey, enabled = true) {
  const [completed, setCompleted] = useState(() => new Set());
  const completedRef = useRef(completed);
  completedRef.current = completed;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !facilityNorm || !categoryKey) {
      setCompleted(new Set());
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get(`/resources/me/progress/${facilityNorm}/${categoryKey}`)
      .then((r) => {
        if (cancelled) return;
        const ids = Array.isArray(r.data?.ids) ? r.data.ids : [];
        setCompleted(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setCompleted(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityNorm, categoryKey, enabled]);

  const setItemCompleted = useCallback(
    async (id, completedVal) => {
      const parsed = parseResourceItemId(id);
      if (!parsed || !facilityNorm || !categoryKey) return false;
      await api.put("/resources/me/progress", {
        business_unit: facilityNorm,
        category: categoryKey,
        resource_kind: parsed.resource_kind,
        resource_id: parsed.resource_id,
        completed: completedVal,
      });
      setCompleted((prev) => {
        const next = new Set(prev);
        if (completedVal) next.add(id);
        else next.delete(id);
        return next;
      });
      return true;
    },
    [facilityNorm, categoryKey]
  );

  const toggleComplete = useCallback(
    async (id) => {
      const parsed = parseResourceItemId(id);
      if (!parsed) return false;
      const nextVal = !completedRef.current.has(id);
      return setItemCompleted(id, nextVal);
    },
    [setItemCompleted]
  );

  return { completed, loading, setItemCompleted, toggleComplete };
}
