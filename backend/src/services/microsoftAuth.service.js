const crypto = require("crypto");
const inviteSvc = require("./invite.service");

function envCred(key) {
  const v = process.env[key];
  if (v == null) return "";
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function microsoftConfig() {
  const tenantId = envCred("AZURE_TENANT_ID") || envCred("MICROSOFT_TENANT_ID");
  const clientId = envCred("AZURE_CLIENT_ID") || envCred("MICROSOFT_CLIENT_ID");
  const clientSecret = envCred("AZURE_CLIENT_SECRET") || envCred("MICROSOFT_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;
  return {
    tenantId,
    clientId,
    clientSecret,
    authority: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`,
    scopes: (envCred("MICROSOFT_SCOPES") || "openid profile email User.Read").split(/\s+/).filter(Boolean),
  };
}

function isEnabled() {
  return Boolean(microsoftConfig());
}

/** Public API origin for OAuth redirect (no trailing slash). */
function apiPublicOrigin(req) {
  const explicit = envCred("API_PUBLIC_URL") || envCred("PUBLIC_API_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  if (req) {
    const proto = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host");
    if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  }
  const port = envCred("PORT") || "5000";
  return `http://localhost:${port}`;
}

function redirectUri(req) {
  const explicit = envCred("MICROSOFT_REDIRECT_URI") || envCred("AZURE_REDIRECT_URI");
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${apiPublicOrigin(req)}/api/auth/microsoft/callback`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookieOpts(req, maxAgeSec) {
  const secure =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RENDER) ||
    String(req?.get("x-forwarded-proto") || "").toLowerCase() === "https";
  const base = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
  return secure ? `${base}; Secure` : base;
}

function buildAuthorizeUrl(req, { state, remember }) {
  const cfg = microsoftConfig();
  if (!cfg) throw new Error("Microsoft SSO is not configured");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri(req),
    response_mode: "query",
    scope: cfg.scopes.join(" "),
    state,
    prompt: "select_account",
  });
  return `${cfg.authority}/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(req, code) {
  const cfg = microsoftConfig();
  if (!cfg) throw new Error("Microsoft SSO is not configured");
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: String(code || ""),
    redirect_uri: redirectUri(req),
    grant_type: "authorization_code",
  });
  const res = await fetch(`${cfg.authority}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.error || `Token exchange failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return data;
}

async function fetchGraphProfile(accessToken) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `Microsoft Graph error (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  const email = String(data.mail || data.userPrincipalName || "")
    .trim()
    .toLowerCase();
  return { email, displayName: data.displayName || "" };
}

function createOAuthState(remember) {
  const payload = {
    n: crypto.randomBytes(16).toString("hex"),
    r: remember ? "1" : "0",
    t: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function parseOAuthState(state) {
  try {
    const raw = Buffer.from(String(state || ""), "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.n || !parsed?.t) return null;
    if (Date.now() - Number(parsed.t) > 15 * 60 * 1000) return null;
    return { remember: parsed.r === "1" };
  } catch {
    return null;
  }
}

function frontendLoginUrl(query = "") {
  const base = inviteSvc.publicAppBaseUrl().replace(/\/+$/, "");
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  return `${base}/login${q}`;
}

module.exports = {
  isEnabled,
  microsoftConfig,
  apiPublicOrigin,
  redirectUri,
  parseCookies,
  cookieOpts,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchGraphProfile,
  createOAuthState,
  parseOAuthState,
  frontendLoginUrl,
};
