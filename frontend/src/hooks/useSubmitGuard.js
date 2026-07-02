import { useRef, useCallback } from "react";

/**
 * Returns a guard wrapper that blocks concurrent / double submissions.
 *
 * How it works:
 *  - Uses a ref (synchronous) instead of state so the very first re-render
 *    doesn't matter — rapid double-clicks are blocked immediately.
 *  - Pair with a `saving` state + `disabled` button for visual feedback.
 *
 * Usage:
 *   const guard = useSubmitGuard();
 *
 *   const handleSubmit = () => guard(async () => {
 *     setSaving(true);
 *     try { await api.post(...) }
 *     finally { setSaving(false); }
 *   });
 */
export function useSubmitGuard() {
  const inFlight = useRef(false);

  return useCallback(async (fn) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      return await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);
}
