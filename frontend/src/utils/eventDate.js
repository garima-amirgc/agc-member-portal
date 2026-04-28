/**
 * Parse event_at / start_at for comparisons and display.
 * Plain YYYY-MM-DD is treated as local calendar date at noon so it is not shifted to the previous local day
 * when the engine parses it as UTC midnight.
 * @param {Record<string, unknown>} ev
 * @returns {Date | null}
 */
export function getEventDateForCompare(ev) {
  const a = ev?.event_at ?? ev?.EVENT_AT;
  const b = ev?.start_at ?? ev?.START_AT;
  const raw = (a != null && String(a).trim() !== "" ? a : b) ?? "";
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, mo, d] = s.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/** ISO string for keys and `new Date(iso)`; null if no usable time. */
export function getEventTimeIso(ev) {
  const dt = getEventDateForCompare(ev);
  return dt ? dt.toISOString() : null;
}
