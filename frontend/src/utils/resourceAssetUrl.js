import { getApiBaseURL } from "../services/api";

export function resolveResourceAssetUrl(url) {
  const path = String(url || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) {
    const b = String(getApiBaseURL() || "").trim();
    if (/^https?:\/\//i.test(b)) {
      try {
        const u = new URL(b.replace(/\/+$/, ""));
        return `${u.origin}${path}`;
      } catch {
      }
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return path;
  }
  return path;
}
