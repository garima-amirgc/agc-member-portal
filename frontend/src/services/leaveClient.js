/**
 * Leave APIs use fetch + multiple URL candidates so we still work if:
 * - An old Node process is bound to :5000 without leave routes (restart fixes it)
 * - baseURL / proxy / IPv4 vs IPv6 mismatch
 */

import api from "./api";

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

/** Ordered list of full URLs to try for one logical leave endpoint (path like "/auth/leave-request"). */
export function leaveRequestUrls(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const env = typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL?.trim();
  const fromStorage = (() => {
    try {
      return localStorage.getItem("AGC_API_URL")?.trim() || null;
    } catch {
      return null;
    }
  })();

  const roots = unique([
    fromStorage?.replace(/\/+$/, ""),
    env?.replace(/\/+$/, ""),
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    typeof window !== "undefined" ? `${window.location.origin.replace(/\/+$/, "")}/api` : null,
  ]);

  const urls = [];
  for (const root of roots) {
    if (!root) continue;
    const r = root.replace(/\/+$/, "");
    if (r.endsWith("/api")) {
      urls.push(`${r}${p}`);
    } else {
      urls.push(`${r}${p}`);
      urls.push(`${r}/api${p}`);
    }
  }
  return unique(urls);
}

async function tryFetch(url, init) {
  const res = await fetch(url, init);
  return res;
}

/**
 * @param {string} path - e.g. "/auth/leave-request"
 * @param {RequestInit} init
 */
export async function leaveFetch(path, init = {}) {
  const token = localStorage.getItem("token");
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const nextInit = { ...init, headers };
  const urls = leaveRequestUrls(path);
  let lastRes = null;
  let lastErr = null;

  for (const url of urls) {
    try {
      const res = await tryFetch(url, nextInit);
      lastRes = res;
      if (res.status !== 404) {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastRes) return lastRes;
  throw lastErr || new Error("Could not reach the server for leave requests.");
}

export async function leaveJson(path, init = {}) {
  const res = await leaveFetch(path, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text?.slice(0, 200) || res.statusText };
  }
  if (!res.ok) {
    const isHtml = /^\s*<!DOCTYPE/i.test(text || "") || /<html[\s>]/i.test(text || "");
    const preMsg = text?.match(/<pre>([^<]*)<\/pre>/i)?.[1]?.trim();
    let msg = isHtml
      ? preMsg || `Server returned an HTML error page (${res.status}).`
      : data?.message || `Request failed (${res.status})`;
    if (res.status === 404 || /cannot\s+(?:GET|POST)/i.test(text || "")) {
      msg =
        "API not found (404). Pull the latest code, stop every Node process on port 5000 (Task Manager → node.exe), then from the backend folder run: npm run dev";
    }
    const err = new Error(msg);
    err.status = res.status;
    // Never attach raw HTML / parse fallback to data — UI often reads data.message first.
    err.data = { message: msg };
    throw err;
  }
  return data;
}

/**
 * Manager team payload: tries /auth/... first (same as leave), then /users/manager/team-overview
 * for older backends that only mounted the users router.
 */
export async function managerTeamJson() {
  const paths = ["/auth/manager-team-overview", "/users/manager/team-overview"];
  let lastErr = null;
  for (const path of paths) {
    try {
      return await leaveJson(path, { method: "GET" });
    } catch (e) {
      lastErr = e;
      if (e?.status !== 404) throw e;
    }
  }
  throw lastErr || new Error("Could not load team overview.");
}

function normalizeManagerInboxResponse(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const hasInbox = Array.isArray(data.leave_inbox);
    const hasTeam = Array.isArray(data.team_overview);
    if (hasInbox || hasTeam) {
      return {
        kind: "bundle",
        inbox: hasInbox ? data.leave_inbox : [],
        team: hasTeam ? data.team_overview : [],
      };
    }
  }
  if (Array.isArray(data)) {
    return { kind: "legacy", inbox: data };
  }
  return { kind: "empty" };
}

const STALE_API_TEAM_MSG =
  "The API on port 5000 is still returning the old manager inbox (plain list only), so direct reports cannot load. Fix: (1) Close every backend terminal. (2) Task Manager → end any node.exe. (3) In PowerShell: cd to the AGC University\\backend folder that contains this project’s package.json, run npm run dev. (4) If you set localStorage AGC_API_URL, remove it or point it at this machine. Opening /auth/manager-leave-inbox in the browser always shows Unauthorized without a login token — that is normal.";

async function teamFallback(inboxArr) {
  const tryAxiosTeam = async () => {
    for (const p of ["/users/manager/team-overview", "/auth/manager-team-overview"]) {
      try {
        const { data } = await api.get(p);
        if (Array.isArray(data)) return data;
      } catch {
        /* try next */
      }
    }
    return null;
  };

  const fromAxios = await tryAxiosTeam();
  if (fromAxios) {
    return { inbox: inboxArr, team: fromAxios, teamError: "" };
  }

  try {
    const team = await managerTeamJson();
    return { inbox: inboxArr, team, teamError: "" };
  } catch {
    return { inbox: inboxArr, team: [], teamError: STALE_API_TEAM_MSG };
  }
}

/**
 * Loads manager inbox + team in one payload. Uses axios first (same as /users/me) so Windows
 * localhost/IPv4 matches the rest of the app; then fetch fallbacks.
 */
export async function managerInboxWithTeamJson() {
  try {
    const { data } = await api.get("/auth/manager-leave-inbox");
    const n = normalizeManagerInboxResponse(data);
    if (n.kind === "bundle") return { inbox: n.inbox, team: n.team, teamError: "" };
    if (n.kind === "legacy") return teamFallback(n.inbox);
  } catch {
    /* try next */
  }

  try {
    const { data } = await api.get("/users/manager/leave-inbox");
    const n = normalizeManagerInboxResponse(data);
    if (n.kind === "bundle") return { inbox: n.inbox, team: n.team, teamError: "" };
    if (n.kind === "legacy") return teamFallback(n.inbox);
  } catch {
    /* try fetch */
  }

  try {
    const data = await leaveJson("/auth/manager-leave-inbox", { method: "GET" });
    const n = normalizeManagerInboxResponse(data);
    if (n.kind === "bundle") return { inbox: n.inbox, team: n.team, teamError: "" };
    if (n.kind === "legacy") return teamFallback(n.inbox);
  } catch (e) {
    return { inbox: [], team: [], teamError: e?.message || "Could not load manager data." };
  }

  return { inbox: [], team: [], teamError: "Unexpected response from manager inbox." };
}
