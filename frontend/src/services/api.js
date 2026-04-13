import axios from "axios";

/** Prefer 127.0.0.1 on Windows — `localhost` can hit IPv6 (::1) while Node listens on IPv4 only, causing odd failures. */
const LOOPBACK_API = "http://127.0.0.1:5000";

const DEV_LIKE_PORTS = new Set([
  "5173",
  "5174",
  "4173",
  "3000",
  "8080",
  "5500",
  "5501",
  "4200",
  "4321",
]);

/**
 * - `VITE_API_URL`: set when API is on another host (build time).
 * - Browser on a local dev port (Vite, preview, Live Server, etc.): use loopback API on :5000.
 * - `import.meta.env.DEV`: same.
 * - Otherwise same-origin `/api` (reverse proxy).
 */
function resolveApiBaseURL() {
  try {
    const fromStorage = typeof localStorage !== "undefined" && localStorage.getItem("AGC_API_URL");
    if (fromStorage && String(fromStorage).trim()) {
      const u = String(fromStorage).trim().replace(/\/+$/, "");
      if (typeof window !== "undefined" && /^https?:\/\//i.test(u)) {
        try {
          if (new URL(u).origin === window.location.origin) {
            /* Mis-set to the SPA origin — ignore so Render sibling / env can apply */
          } else {
            return u;
          }
        } catch {
          return u;
        }
      } else {
        return u;
      }
    }
  } catch {
    /* ignore */
  }

  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;

    /** Render: static site is often `name-web.onrender.com` and the API is `name.onrender.com`. */
    const renderSibling = /^(.+)-web\.onrender\.com$/i.exec(hostname);
    if (renderSibling) {
      return `https://${renderSibling[1]}.onrender.com`;
    }

    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    if (isLocal && DEV_LIKE_PORTS.has(port)) {
      return LOOPBACK_API;
    }
  }

  if (import.meta.env.DEV) {
    return LOOPBACK_API;
  }

  return "/api";
}

/** HTTPS page must not call http:// API (mixed content — browser blocks). */
function ensureHttpsIfPageSecure(url) {
  const u = String(url || "").trim();
  if (typeof window === "undefined" || window.location.protocol !== "https:") return u;
  if (u.startsWith("http://") && /\.onrender\.com/i.test(u)) {
    return `https://${u.slice("http://".length)}`;
  }
  return u;
}

/** Current API base (re-resolve; prefer this over the snapshot `apiBaseURL` for URLs at runtime). */
export function getApiBaseURL() {
  return ensureHttpsIfPageSecure(resolveApiBaseURL());
}

export const apiBaseURL = resolveApiBaseURL();

/**
 * POST path for IT ticket file uploads. Must match how `baseURL` is resolved:
 * - `baseURL === "/api"` → axios joins to `/api/tickets/attachments/upload` (Vite proxies `/api`).
 * - `baseURL` is an absolute URL (e.g. `http://127.0.0.1:5000` or a mis-set `http://localhost:5173`) →
 *   use `/api/tickets/...` so the request hits the Express `/api` mount (or Vite proxy), not `/tickets` on the dev server.
 */
export function ticketAttachmentsUploadPath() {
  const b = String(getApiBaseURL() || "");
  if (b === "/api") return "/tickets/attachments/upload";
  return "/api/tickets/attachments/upload";
}

/**
 * Admin user invite resend. Same rule as ticket uploads: with absolute `baseURL`, path must include `/api`
 * so the request hits Express (not the Vite dev server if `baseURL` was mis-set to the app origin).
 */
export function usersResendInvitePath(userId) {
  const id = encodeURIComponent(String(userId));
  const b = String(getApiBaseURL() || "");
  if (b === "/api") return `/users/${id}/resend-invite`;
  return `/api/users/${id}/resend-invite`;
}

/**
 * Resend invite — same networking rules as `postItTicketAttachment`:
 * when the SPA and API are same-origin (or base is relative `/api`), POST via the page origin + `/api/users/...`
 * so Vite’s proxy is used. When API is cross-origin (e.g. page on localhost:5173, API on 127.0.0.1:5000),
 * POST to the configured base with `/api/users/...`.
 */
export async function postUsersResendInvite(userId) {
  const id = encodeURIComponent(String(userId));
  const path = `/api/users/${id}/resend-invite`;
  const cfg = { timeout: 90000 };
  if (typeof window !== "undefined") {
    const pageOrigin = window.location.origin;
    const base = String(getApiBaseURL() || "");
    let crossOriginApi = false;
    if (/^https?:\/\//i.test(base)) {
      try {
        crossOriginApi = new URL(base).origin !== pageOrigin;
      } catch {
        crossOriginApi = false;
      }
    }
    if (!crossOriginApi) {
      const { data } = await api.post(path, {}, { ...cfg, baseURL: pageOrigin });
      return data;
    }
  }
  const { data } = await api.post(usersResendInvitePath(userId), {}, cfg);
  return data;
}

/**
 * POST multipart for IT ticket attachments. Uses the **page origin** + `/api/...` whenever the API is
 * same-origin or relative, so Vite’s `/api` proxy is always used in dev (avoids 404 on `/tickets` hitting the dev server).
 * If `apiBaseURL` points at a different host (cross-origin API), posts directly to that base instead.
 */
export async function postItTicketAttachment(fd) {
  const cfg = { timeout: 120000 };
  if (typeof window !== "undefined") {
    const pageOrigin = window.location.origin;
    const base = String(getApiBaseURL() || "");
    let crossOriginApi = false;
    if (/^https?:\/\//i.test(base)) {
      try {
        crossOriginApi = new URL(base).origin !== pageOrigin;
      } catch {
        crossOriginApi = false;
      }
    }
    if (!crossOriginApi) {
      const { data } = await api.post("/api/tickets/attachments/upload", fd, {
        ...cfg,
        baseURL: pageOrigin,
      });
      return data;
    }
  }
  const { data } = await api.post(ticketAttachmentsUploadPath(), fd, cfg);
  return data;
}

const api = axios.create({
  baseURL: "",
  /** Render free tier cold starts can exceed 15s; admin DELETE etc. need headroom */
  timeout: 90000,
});

api.interceptors.request.use((config) => {
  config.baseURL = ensureHttpsIfPageSecure(resolveApiBaseURL());
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config;
    const status = err.response?.status;
    const reqPath = cfg?.url || "";

    // If leave/manager/resources APIs 404 (wrong origin / proxy / IPv6), retry once against IPv4 loopback :5000.
    const isLeaveCall =
      /leave-request|my-leave-requests|manager-leave-inbox|manager-leave-requests|manager-team-overview|manager\/team-overview|manager\/leave-inbox/.test(
        reqPath
      );
    const isResourcesCall = /\/resources\//.test(reqPath);
    const isUpcomingCall = /\/upcoming(\/|$)/.test(reqPath);
    const isUploadCall = /\/upload(\/|$)/.test(reqPath);
    const isUsersResendInvite = /\/users\/[^/]+\/resend-invite/.test(reqPath);
    const alreadyRetried = cfg?.__agcRetryBackend === true;
    const base = String(cfg?.baseURL || "");
    const alreadyOnLoopback5000 = /^https?:\/\/127\.0\.0\.1:5000\/?$/i.test(base);

    if (
      status === 404 &&
      cfg &&
      (isLeaveCall || isResourcesCall || isUpcomingCall || isUploadCall || isUsersResendInvite) &&
      !alreadyRetried &&
      !alreadyOnLoopback5000
    ) {
      try {
        return await api({
          ...cfg,
          baseURL: LOOPBACK_API,
          __agcRetryBackend: true,
        });
      } catch (e) {
        err = e;
      }
    }

    const status2 = err.response?.status;
    const isLoginAttempt = reqPath.includes("auth/login");
    if (status2 === 401 && !isLoginAttempt) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      const onLogin = window.location.pathname === "/login" || window.location.pathname.endsWith("/login");
      if (!onLogin) {
        window.location.assign(`${window.location.origin}/login`);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
