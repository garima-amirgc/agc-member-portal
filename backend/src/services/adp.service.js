/**
 * ADP Workforce Now API service
 * ─────────────────────────────
 * Handles OAuth 2.0 with mutual TLS (mTLS) authentication.
 *
 * Required env vars (set in backend/.env, NOT committed to git):
 *   ADP_CLIENT_KEY     — private key PEM content, OR a file path to the .key file
 *   ADP_CLIENT_CERT    — client certificate PEM content, OR a file path to the .crt file
 *   ADP_CLIENT_ID      — your ADP app's client_id
 *   ADP_CLIENT_SECRET  — your ADP app's client_secret
 *
 * Optional env vars:
 *   ADP_TOKEN_URL      — defaults to https://accounts.adp.com/auth/oauth/v2/token
 *   ADP_API_BASE       — defaults to https://api.adp.com
 *
 * How to set PEM content in an env var (e.g. on Render):
 *   Paste the full PEM text — Render preserves real newlines.
 *   OR replace actual newlines with \n (literal backslash-n) and this service
 *   will convert them back automatically.
 */

"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const DEFAULT_TOKEN_URL = "https://accounts.adp.com/auth/oauth/v2/token";
const DEFAULT_API_BASE = "https://api.adp.com";

// In-memory token cache
let _cache = { token: null, expiresAt: 0 };

// ─── Config helpers ──────────────────────────────────────────────────────────

function isConfigured() {
  return !!(
    process.env.ADP_CLIENT_KEY &&
    process.env.ADP_CLIENT_CERT &&
    process.env.ADP_CLIENT_ID
  );
}

/**
 * Resolve a PEM value: if it starts with -----BEGIN it's inline content;
 * otherwise treat it as a file path.
 */
function loadPem(envValue) {
  if (!envValue) return null;
  const v = String(envValue).trim();
  if (v.startsWith("-----")) {
    // Inline PEM — replace literal \n with real newlines (Render env vars)
    return v.replace(/\\n/g, "\n");
  }
  try {
    return fs.readFileSync(path.resolve(v), "utf8");
  } catch (e) {
    throw new Error(`ADP: could not read PEM file at "${v}": ${e.message}`);
  }
}

function makeAgent() {
  const key = loadPem(process.env.ADP_CLIENT_KEY);
  const cert = loadPem(process.env.ADP_CLIENT_CERT);
  if (!key || !cert) throw new Error("ADP_CLIENT_KEY or ADP_CLIENT_CERT is missing or unreadable");
  return new https.Agent({ key, cert, keepAlive: true });
}

// ─── Low-level HTTPS helper ──────────────────────────────────────────────────

function httpsRequest(urlObj, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(urlObj, options, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          const err = new Error(`ADP API ${res.statusCode}: ${raw}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function getAccessToken() {
  // Return cached token if still valid (with 30s buffer)
  if (_cache.token && _cache.expiresAt > Date.now() + 30_000) {
    return _cache.token;
  }

  const tokenUrl = new URL(process.env.ADP_TOKEN_URL || DEFAULT_TOKEN_URL);
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET || "";
  const agent = makeAgent();

  const body = "grant_type=client_credentials";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const json = await httpsRequest(
    tokenUrl,
    {
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (!json.access_token) {
    throw new Error(`ADP token exchange failed: ${JSON.stringify(json)}`);
  }

  const expiresIn = json.expires_in || 3600;
  _cache = { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return _cache.token;
}

// ─── ADP API calls ────────────────────────────────────────────────────────────

async function adpGet(apiPath) {
  const token = await getAccessToken();
  const agent = makeAgent();
  const url = new URL(apiPath, process.env.ADP_API_BASE || DEFAULT_API_BASE);
  return httpsRequest(url, {
    method: "GET",
    agent,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

/**
 * Look up a worker by their work email address.
 *
 * NOTE: The exact $filter field name depends on your ADP Workforce Now
 * configuration and API version. Adjust the filter string if needed:
 *
 *   Option A (most common):
 *     workers/businessCommunication/emails/emailUri eq 'email'
 *
 *   Option B (some orgs):
 *     workers/person/communicationEmails/emailUri eq 'email'
 *
 * If email filtering is unreliable, consider storing the associateOID in
 * the portal's users table (see getWorkerByOID below).
 */
async function getWorkerByEmail(email) {
  const filter = `workers/businessCommunication/emails/emailUri eq '${email}'`;
  const qs = `$filter=${encodeURIComponent(filter)}`;
  const data = await adpGet(`/hr/v2/workers?${qs}`);
  const workers = data?.workers;
  return Array.isArray(workers) && workers.length > 0 ? workers[0] : null;
}

/**
 * Fetch a single worker directly by their ADP associateOID.
 * Faster and more reliable once the OID is known.
 */
async function getWorkerByOID(associateOID) {
  const data = await adpGet(`/hr/v2/workers/${encodeURIComponent(associateOID)}`);
  const workers = data?.workers;
  return Array.isArray(workers) && workers.length > 0 ? workers[0] : null;
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

/**
 * Map a raw ADP worker object to a clean, flat object for the portal.
 * ADP's field nesting varies by config; null-safe throughout.
 */
function mapWorker(worker) {
  if (!worker) return null;

  const wa = worker.workAssignments?.[0] || {};
  const person = worker.person || {};
  const legal = person.legalName || {};
  const preferred = person.preferredName || {};

  // Email — check both businessCommunication (common) and person.communicationEmails
  const bcEmails = worker.businessCommunication?.emails || [];
  const personEmails = person.communicationEmails || person.communications?.emails || [];
  const allEmails = [...bcEmails, ...personEmails];
  const workEmail =
    allEmails.find((e) => e.nameCode?.codeValue === "Work")?.emailUri ||
    allEmails[0]?.emailUri ||
    null;

  // Phone — same dual-source pattern
  const bcPhones = worker.businessCommunication?.phones || [];
  const personPhones = person.communicationPhones || person.communications?.phones || [];
  const allPhones = [...bcPhones, ...personPhones];
  const workPhone =
    allPhones.find((p) => p.nameCode?.codeValue === "Work") || allPhones[0] || null;

  let phoneNumber = null;
  if (workPhone) {
    phoneNumber = [
      workPhone.countryDialing,
      workPhone.areaDialing,
      workPhone.dialNumber,
    ]
      .filter(Boolean)
      .join("-");
    if (workPhone.extension) phoneNumber += ` ext. ${workPhone.extension}`;
  }

  return {
    associate_oid: worker.associateOID || null,
    worker_id: worker.workerID?.idValue || null,
    legal_name:
      [legal.givenName, legal.familyName].filter(Boolean).join(" ") || null,
    preferred_name:
      preferred.preferredName?.formattedName ||
      preferred.formattedName ||
      null,
    work_email: workEmail,
    work_phone: phoneNumber,
    job_title: wa.jobTitle || null,
    department: wa.departmentCode?.longName || wa.departmentCode?.shortName || null,
    work_location: wa.workLocation?.nameCode?.longName || wa.workLocation?.nameCode?.shortName || null,
    hire_date: wa.hireDate || null,
    employment_status: wa.workerStatus?.statusCode?.codeValue || null,
    employment_type: wa.workerTypeCode?.codeValue || null,
  };
}

module.exports = {
  isConfigured,
  getWorkerByEmail,
  getWorkerByOID,
  mapWorker,
};
