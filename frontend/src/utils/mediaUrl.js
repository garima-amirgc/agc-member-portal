import { getApiBaseURL } from "../services/api";

/**
 * Turn stored `/uploads/...` paths into a browser-loadable URL.
 * In dev, API is often on :5000 while the page is on :5173 — relative `/uploads` would hit Vite; prefix the API origin when `apiBaseURL` is absolute.
 */
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
