import { getApiBaseURL } from "../services/api";

export function resolvePublicMediaUrl(stored) {
  if (stored == null || typeof stored !== "string") return "";
  const s = stored.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) {
    const base = String(getApiBaseURL() || "").replace(/\/+$/, "");
    if (base.startsWith("http://") || base.startsWith("https://")) {
      return `${base}${s}`;
    }
    return s;
  }
  return s;
}
