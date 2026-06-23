import axios from "axios";

const LOOPBACK_API = "http://localhost:5000";

const DEV_LIKE_PORTS = new Set([
  "8503",
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

function resolveApiBaseURL() {
  if (import.meta.env.DEV) {
    return LOOPBACK_API;
  }

  try {
    const fromStorage = typeof localStorage !== "undefined" && localStorage.getItem("AGC_API_URL");
    if (fromStorage && String(fromStorage).trim()) {
      const u = String(fromStorage).trim().replace(/\/+$/, "");
      if (typeof window !== "undefined" && /^https?:\/\//i.test(u)) {
        try {
          if (new URL(u).origin === window.location.origin) {
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
  }

  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;

    const renderSibling = /^(.+)-web\.onrender\.com$/i.exec(hostname);
    if (renderSibling) {
      return `https://${renderSibling[1]}.onrender.com`;
    }

    if (hostname === "memberportal.amirgc.com") {
      return "https://agc-member-portal.onrender.com";
    }

    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    if (isLocal && DEV_LIKE_PORTS.has(port)) {
      return LOOPBACK_API;
    }
  }

  return "/api";
}

function ensureHttpsIfPageSecure(url) {
  const u = String(url || "").trim();
  if (typeof window === "undefined" || window.location.protocol !== "https:") return u;
  if (u.startsWith("http://") && /\.onrender\.com/i.test(u)) {
    return `https://${u.slice("http://".length)}`;
  }
  return u;
}

export function getApiBaseURL() {
  return ensureHttpsIfPageSecure(resolveApiBaseURL());
}

export const apiBaseURL = resolveApiBaseURL();

export function ticketAttachmentsUploadPath() {
  const b = String(getApiBaseURL() || "");
  if (b === "/api") return "/tickets/attachments/upload";
  return "/api/tickets/attachments/upload";
}

export function usersResendInvitePath(userId) {
  const id = encodeURIComponent(String(userId));
  const b = String(getApiBaseURL() || "");
  if (b === "/api") return `/users/${id}/resend-invite`;
  return `/api/users/${id}/resend-invite`;
}

export function resolveUserPutUrl(userId) {
  const id = encodeURIComponent(String(userId));
  const base = String(getApiBaseURL() || "").replace(/\/+$/, "");
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}/users/${id}`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (base === "/api" || base.endsWith("/api")) {
    return `${origin}${base}/users/${id}`;
  }
  return `${origin}/api/users/${id}`;
}

export async function putUserSave(userId, body) {
  const id = encodeURIComponent(String(userId));
  const { data } = await api.put(`/users/${id}`, body);
  return { data };
}

export function authPublicPath(subpath) {
  const p = String(subpath || "").replace(/^\//, "");
  const b = String(getApiBaseURL() || "");
  if (b === "/api") return `/auth/${p}`;
  if (/^https?:\/\//i.test(b)) return `/auth/${p}`;
  return `/api/auth/${p}`;
}

export async function postRecoverAccess(email) {
  const path = "/api/auth/recover-access";
  const body = { email: String(email || "").trim() };
  const cfg = { timeout: 90000 };
  if (typeof window !== "undefined") {
    const pageOrigin = window.location.origin;
    if (import.meta.env.DEV) {
      const { data } = await api.post(path, body, { ...cfg, baseURL: pageOrigin });
      return data;
    }
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
      const { data } = await api.post(path, body, { ...cfg, baseURL: pageOrigin });
      return data;
    }
  }
  const { data } = await api.post(authPublicPath("recover-access"), body, cfg);
  return data;
}

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

    const isLeaveCall =
      /leave-request|my-leave-requests|manager-leave-inbox|manager-leave-requests|manager-team-overview|manager\/team-overview|manager\/leave-inbox/.test(
        reqPath
      );
    const isResourcesCall = /\/resources\//.test(reqPath);
    const isUpcomingCall = /\/upcoming(\/|$)/.test(reqPath);
    const isEngagementCalendarCall = /\/engagement-calendar(\/|$)/.test(reqPath);
    const isUploadCall = /\/upload(\/|$)/.test(reqPath);
    const isUsersResendInvite = /\/users\/[^/]+\/resend-invite/.test(reqPath);
    const alreadyRetried = cfg?.__agcRetryBackend === true;
    const base = String(cfg?.baseURL || "");
    const alreadyOnLoopback5000 = /^https?:\/\/127\.0\.0\.1:5000\/?$/i.test(base);

    if (
      status === 404 &&
      cfg &&
      (isLeaveCall ||
        isResourcesCall ||
        isUpcomingCall ||
        isEngagementCalendarCall ||
        isUploadCall ||
        isUsersResendInvite) &&
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
