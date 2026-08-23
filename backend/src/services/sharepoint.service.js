// Microsoft Graph / SharePoint integration.
//
// Uses the "client credentials" (app-only) OAuth flow — the portal's backend
// authenticates as itself (not as the logged-in user) and needs an Azure AD
// app registration with the Sites.ReadWrite.All *application* permission,
// granted admin consent. See backend/.env.example for the setup steps.
//
// Required env vars: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET.

const { Readable } = require("stream");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // Graph's cutoff for the simple PUT-content endpoint
const LARGE_UPLOAD_CHUNK = 5 * 1024 * 1024; // must be a multiple of 320 KiB

function envCred(key) {
  const v = process.env[key];
  if (v == null) return "";
  let s = String(v).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function httpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

function isConfigured() {
  return Boolean(envCred("SHAREPOINT_TENANT_ID") && envCred("SHAREPOINT_CLIENT_ID") && envCred("SHAREPOINT_CLIENT_SECRET"));
}

let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (!isConfigured()) {
    throw httpError(
      503,
      "SharePoint isn't connected yet. Ask an administrator to add the SharePoint credentials in the server settings."
    );
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.token;

  const tenantId = envCred("SHAREPOINT_TENANT_ID");
  const clientId = envCred("SHAREPOINT_CLIENT_ID");
  const clientSecret = envCred("SHAREPOINT_CLIENT_SECRET");
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sharepoint] token error:", data);
    throw httpError(502, data.error_description || "Could not authenticate with Microsoft Graph.");
  }
  cachedToken = { token: data.access_token, expiresAt: now + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

async function graphFetch(path, opts = {}) {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function graphJson(path, opts = {}) {
  const res = await graphFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sharepoint] graph error:", path, res.status, data);
    throw httpError(res.status === 404 ? 404 : 502, data?.error?.message || "Microsoft Graph request failed.");
  }
  return data;
}

// ─── Sites & document libraries ─────────────────────────────────────────────

async function searchSites(query) {
  const q = String(query || "").trim();
  const search = q || "*";
  const data = await graphJson(
    `/sites?search=${encodeURIComponent(search)}&$select=id,name,displayName,webUrl&$top=25`
  );
  return (data.value || []).map((s) => ({ id: s.id, name: s.displayName || s.name || "Untitled site", webUrl: s.webUrl }));
}

async function listSiteDrives(siteId) {
  const data = await graphJson(`/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,driveType,webUrl`);
  return (data.value || []).map((d) => ({ id: d.id, name: d.name, driveType: d.driveType, webUrl: d.webUrl }));
}

// ─── Browsing ────────────────────────────────────────────────────────────────

function mapItem(it) {
  return {
    id: it.id,
    name: it.name,
    isFolder: Boolean(it.folder),
    size: it.size || 0,
    lastModifiedDateTime: it.lastModifiedDateTime || null,
    lastModifiedBy: it.lastModifiedBy?.user?.displayName || null,
    webUrl: it.webUrl || null,
    childCount: it.folder ? it.folder.childCount ?? 0 : null,
  };
}

async function listFolder({ driveId, itemId }) {
  const base = `/drives/${encodeURIComponent(driveId)}`;
  const path = itemId
    ? `${base}/items/${encodeURIComponent(itemId)}/children?$select=id,name,folder,size,lastModifiedDateTime,lastModifiedBy,webUrl&$top=200&$orderby=name`
    : `${base}/root/children?$select=id,name,folder,size,lastModifiedDateTime,lastModifiedBy,webUrl&$top=200&$orderby=name`;
  const data = await graphJson(path);
  const items = (data.value || []).map(mapItem);
  items.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
  return items;
}

// ─── Download ────────────────────────────────────────────────────────────────

async function getDownloadStream({ driveId, itemId }) {
  // The item's full metadata (not the $select-trimmed version above) includes
  // a pre-authenticated, time-limited download URL — fetch that directly
  // rather than proxying Graph's own /content redirect chain.
  const meta = await graphJson(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`);
  const downloadUrl = meta["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw httpError(404, "That file has no downloadable content (it may be a folder).");
  const res = await fetch(downloadUrl);
  if (!res.ok || !res.body) throw httpError(502, "Could not download that file from SharePoint.");
  return { nodeStream: Readable.fromWeb(res.body), meta };
}

// ─── Upload ──────────────────────────────────────────────────────────────────

async function uploadFile({ driveId, parentItemId, filename, buffer }) {
  if (buffer.length <= SIMPLE_UPLOAD_LIMIT) {
    const path = parentItemId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(filename)}:/content`
      : `/drives/${encodeURIComponent(driveId)}/root:/${encodeURIComponent(filename)}:/content`;
    const res = await graphFetch(path, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: buffer });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[sharepoint] upload error:", data);
      throw httpError(502, data?.error?.message || "Upload to SharePoint failed.");
    }
    return mapItem(data);
  }
  return uploadLargeFile({ driveId, parentItemId, filename, buffer });
}

async function uploadLargeFile({ driveId, parentItemId, filename, buffer }) {
  const sessionPath = parentItemId
    ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(filename)}:/createUploadSession`
    : `/drives/${encodeURIComponent(driveId)}/root:/${encodeURIComponent(filename)}:/createUploadSession`;
  const session = await graphJson(sessionPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
  });
  const uploadUrl = session.uploadUrl;
  if (!uploadUrl) throw httpError(502, "Could not start a SharePoint upload session.");

  const total = buffer.length;
  let start = 0;
  let lastData = null;
  while (start < total) {
    const end = Math.min(start + LARGE_UPLOAD_CHUNK, total);
    const chunk = buffer.subarray(start, end);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end - 1}/${total}` },
      body: chunk,
    });
    if (!res.ok && res.status !== 202) {
      const data = await res.json().catch(() => ({}));
      console.error("[sharepoint] chunk upload error:", data);
      throw httpError(502, data?.error?.message || "Upload to SharePoint failed partway through — please try again.");
    }
    lastData = await res.json().catch(() => null);
    start = end;
  }
  return lastData ? mapItem(lastData) : { id: null, name: filename, isFolder: false };
}

async function createFolder({ driveId, parentItemId, name }) {
  const path = parentItemId
    ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`
    : `/drives/${encodeURIComponent(driveId)}/root/children`;
  const data = await graphJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
  });
  return mapItem(data);
}

module.exports = {
  isConfigured,
  searchSites,
  listSiteDrives,
  listFolder,
  getDownloadStream,
  uploadFile,
  createFolder,
};
