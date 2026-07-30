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

// In-memory caches
let _cache = { token: null, expiresAt: 0 };
let _workersCache = { workers: null, expiresAt: 0 };
const WORKERS_TTL_MS = (() => {
  const mins = parseInt(process.env.ADP_CACHE_TTL_MINUTES, 10);
  return (Number.isFinite(mins) && mins > 0 ? mins : 60) * 60 * 1000; // default 60 min
})();

function clearWorkersCache() {
  _workersCache = { workers: null, expiresAt: 0 };
}

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
    return v.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  try {
    const resolved = path.resolve(v);
    console.log(`[ADP] Reading PEM file: "${resolved}"`);
    const buf = fs.readFileSync(resolved);

    let content;
    // Detect encoding from BOM
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      content = buf.slice(3).toString("utf8"); // UTF-8 BOM
    } else if (buf[0] === 0xFF && buf[1] === 0xFE) {
      content = buf.slice(2).toString("utf16le"); // UTF-16 LE BOM
    } else if (buf[0] === 0xFE && buf[1] === 0xFF) {
      content = buf.slice(2).swap16().toString("utf16le"); // UTF-16 BE BOM
    } else {
      content = buf.toString("utf8");
    }

    // Normalize: CRLF → LF, trim trailing spaces per line, ensure final newline
    const clean = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim() + "\n";

    console.log(`[ADP] Loaded PEM (${clean.length} bytes), starts: ${JSON.stringify(clean.slice(0, 30))}`);
    return clean;
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
 * Fetch all workers from ADP, paginating through results (default page is 50).
 * Results are cached for WORKERS_TTL_MS to avoid hammering the API on every
 * profile page load.
 */
async function getAllWorkers() {
  if (_workersCache.workers && _workersCache.expiresAt > Date.now()) {
    return _workersCache.workers;
  }

  const pageSize = 100;
  let skip = 0;
  let all = [];

  // Paginate until we get fewer results than pageSize (last page)
  // or we've fetched 2000 workers max (safety cap)
  while (skip <= 1900) {
    const data = await adpGet(`/hr/v2/workers?$top=${pageSize}&$skip=${skip}`);
    const page = data?.workers;
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < pageSize) break; // last page
    skip += pageSize;
  }

  _workersCache = { workers: all, expiresAt: Date.now() + WORKERS_TTL_MS };
  console.log(`[ADP] Workers fetched and cached: ${all.length} total`);
  return all;
}

/**
 * Find a worker by work email — fetches all workers and matches client-side.
 * This is the primary lookup method. Works automatically for any employee
 * whose work email is recorded in ADP.
 */
async function getWorkerByEmail(email) {
  if (!email) return null;
  const workers = await getAllWorkers();
  const target = String(email).toLowerCase().trim();
  return (
    workers.find((w) => {
      const bcEmails = w.businessCommunication?.emails || [];
      const personEmails = w.person?.communicationEmails || w.person?.communications?.emails || [];
      return [...bcEmails, ...personEmails].some(
        (e) => String(e.emailUri || "").toLowerCase().trim() === target
      );
    }) || null
  );
}

/**
 * Find a worker by their ADP Associate ID (workerID.idValue or associateOID).
 * Used as a fallback when email matching isn't possible.
 */
async function getWorkerByAssociateOID(id) {
  if (!id) return null;
  const workers = await getAllWorkers();
  const target = String(id).trim().toUpperCase();
  return (
    workers.find((w) => {
      const oid = String(w.associateOID || "").trim().toUpperCase();
      const wid = String(w.workerID?.idValue || "").trim().toUpperCase();
      return oid === target || wid === target;
    }) || null
  );
}

async function validateAssociateOID(id) {
  const worker = await getWorkerByAssociateOID(id);
  return worker !== null;
}

async function getWorkerByOID(associateOID) {
  return getWorkerByAssociateOID(associateOID);
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

/**
 * Map a raw ADP worker object to a clean, flat object for the portal.
 * ADP's field nesting varies by config; null-safe throughout.
 */
function mapWorker(worker) {
  if (!worker) return null;

  // Prefer the primary or active work assignment; fall back to index 0
  const assignments = worker.workAssignments || [];
  const wa =
    assignments.find((a) => a.primaryIndicator === true) ||
    assignments.find((a) =>
      String(a.workerStatus?.statusCode?.codeValue || "").toLowerCase() === "active"
    ) ||
    assignments[assignments.length - 1] ||  // last assignment is usually most recent
    {};
  const person = worker.person || {};
  const legal = person.legalName || {};
  const preferred = person.preferredName || {};

  // Email — check businessCommunication, person.communication (singular), person.communications (plural)
  const bcEmails = worker.businessCommunication?.emails || [];
  const personEmails =
    person.communicationEmails ||
    person.communication?.emails ||
    person.communications?.emails ||
    [];
  const allEmails = [...bcEmails, ...personEmails];
  const workEmail =
    allEmails.find((e) => e.nameCode?.codeValue === "Work")?.emailUri ||
    allEmails[0]?.emailUri ||
    null;

  // Phone — check businessCommunication, person.communication.phones, and person.communication.mobiles
  // ADP sometimes uses singular "communication" with a "mobiles" array for cell phones
  const bcPhones = worker.businessCommunication?.phones || [];
  const personPhones =
    person.communication?.phones ||
    person.communicationPhones ||
    person.communications?.phones ||
    [];
  const personMobiles = person.communication?.mobiles || [];
  const allPhones = [...bcPhones, ...personPhones, ...personMobiles];
  const workPhone =
    allPhones.find((p) => p.nameCode?.codeValue === "Work") ||
    allPhones.find((p) => p.nameCode?.codeValue === "Personal Cell") ||
    allPhones[0] ||
    null;

  let phoneNumber = null;
  if (workPhone) {
    // Prefer pre-formatted number if available
    if (workPhone.formattedNumber) {
      phoneNumber = workPhone.formattedNumber;
    } else {
      phoneNumber = [workPhone.countryDialing, workPhone.areaDialing, workPhone.dialNumber]
        .filter(Boolean)
        .join("-");
      if (workPhone.extension) phoneNumber += ` ext. ${workPhone.extension}`;
    }
  }

  // Department — check departmentCode first, then homeOrganizationalUnits
  const deptFromCode = wa.departmentCode?.longName || wa.departmentCode?.shortName || null;
  const orgUnits = wa.homeOrganizationalUnits || [];
  const deptUnit =
    orgUnits.find((u) => String(u.typeCode?.codeValue || "").toLowerCase() === "department") ||
    orgUnits[0];
  const department = deptFromCode || deptUnit?.nameCode?.longName || deptUnit?.nameCode?.shortName || null;

  // Home address from person.legalAddress
  const addr = person.legalAddress;
  let homeAddress = null;
  if (addr) {
    const parts = [
      addr.lineOne,
      addr.lineTwo,
      addr.cityName,
      addr.countrySubdivisionLevel1?.shortName || addr.countrySubdivisionLevel1?.codeValue,
      addr.postalCode,
      addr.countryCode,
    ].filter(Boolean);
    if (parts.length > 0) homeAddress = parts.join(", ");
  }

  // Reporting line — reportsTo is an array; use the first entry's associateOID
  const reportsToOid = wa.reportsTo?.[0]?.associateOID || null;

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
    department,
    work_location: wa.workLocation?.nameCode?.longName || wa.workLocation?.nameCode?.shortName || null,
    hire_date: wa.hireDate || null,
    birth_date: person.birthDate || null,
    home_address: homeAddress,
    employment_status: wa.workerStatus?.statusCode?.codeValue || null,
    employment_type: wa.workerTypeCode?.codeValue || null,
    reports_to_oid: reportsToOid,
  };
}

module.exports = {
  isConfigured,
  getAllWorkers,
  getWorkerByEmail,
  getWorkerByAssociateOID,
  validateAssociateOID,
  getWorkerByOID,
  mapWorker,
  clearWorkersCache,
};
