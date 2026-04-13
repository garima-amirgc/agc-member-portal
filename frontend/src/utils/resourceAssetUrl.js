import { apiBaseURL } from "../services/api";

/** Backend serves `/uploads` as static files; resolve relative paths against the API host (or Vite proxy origin). */
export function resolveResourceAssetUrl(url) {
  const path = String(url || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) {
    const b = String(apiBaseURL || "").trim();
    if (/^https?:\/\//i.test(b)) {
      try {
        const u = new URL(b.replace(/\/+$/, ""));
        return `${u.origin}${path}`;
      } catch {
        /* fall through */
      }
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return path;
  }
  return path;
}
