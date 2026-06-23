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

export function getEventTimeIso(ev) {
  const dt = getEventDateForCompare(ev);
  return dt ? dt.toISOString() : null;
}
