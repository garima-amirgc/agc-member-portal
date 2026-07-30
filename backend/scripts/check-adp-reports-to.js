"use strict";

/**
 * Quick check: does ADP send reportsTo (manager) data on workAssignments?
 * Run from backend/: node scripts/check-adp-reports-to.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const https = require("https");
const fs = require("fs");

function loadPem(v) {
  if (!v) return null;
  v = String(v).trim();
  if (v.startsWith("-----")) return v.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return fs.readFileSync(path.resolve(v)).toString("utf8").replace(/\r\n/g, "\n").trim() + "\n";
}

function req(url, opts, body) {
  return new Promise((res, rej) => {
    const r = https.request(url, opts, (resp) => {
      let d = "";
      resp.on("data", c => (d += c));
      resp.on("end", () => res({ status: resp.statusCode, body: d }));
    });
    r.on("error", rej);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const key = loadPem(process.env.ADP_CLIENT_KEY);
  const cert = loadPem(process.env.ADP_CLIENT_CERT);
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET || "";
  const tokenUrl = process.env.ADP_TOKEN_URL || "https://accounts.adp.com/auth/oauth/v2/token";
  const apiBase = (process.env.ADP_API_BASE || "https://api.adp.com").replace(/\/$/, "");
  const agent = new https.Agent({ key, cert });

  // Get token
  const body = "grant_type=client_credentials";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const t = await req(tokenUrl, {
    method: "POST", agent,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}`, "Content-Length": Buffer.byteLength(body) },
  }, body);
  const tokenJson = JSON.parse(t.body);
  if (!tokenJson.access_token) { console.error("❌ Token failed:", t.body); process.exit(1); }
  const token = tokenJson.access_token;
  console.log("✅ Token obtained\n");

  // Fetch first page of workers (100)
  const w = await req(`${apiBase}/hr/v2/workers?$top=100&$skip=0`, {
    method: "GET", agent,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const workers = JSON.parse(w.body)?.workers || [];
  console.log(`Fetched ${workers.length} workers from first page\n`);

  // ── Check reportsTo across all workers ──────────────────────────────────────
  let withReportsTo = 0;
  let withoutReportsTo = 0;

  for (const worker of workers) {
    const assignments = worker.workAssignments || [];
    const primary =
      assignments.find(a => a.primaryIndicator === true) ||
      assignments.find(a => String(a.workerStatus?.statusCode?.codeValue || "").toLowerCase() === "active") ||
      assignments[assignments.length - 1] || {};

    const reportsTo = primary.reportsTo;

    if (reportsTo) {
      withReportsTo++;
    } else {
      withoutReportsTo++;
    }
  }

  console.log(`=== reportsTo coverage across ${workers.length} workers ===`);
  console.log(`  ✅ Has reportsTo: ${withReportsTo}`);
  console.log(`  ❌ No  reportsTo: ${withoutReportsTo}\n`);

  // ── Print reportsTo from first 5 workers that have it ──────────────────────
  console.log("=== Sample reportsTo values (first 5 workers with it) ===");
  let shown = 0;
  for (const worker of workers) {
    if (shown >= 5) break;
    const assignments = worker.workAssignments || [];
    const primary =
      assignments.find(a => a.primaryIndicator === true) ||
      assignments.find(a => String(a.workerStatus?.statusCode?.codeValue || "").toLowerCase() === "active") ||
      assignments[assignments.length - 1] || {};

    const reportsTo = primary.reportsTo;
    if (!reportsTo) continue;

    const emails = worker.businessCommunication?.emails || [];
    const email = emails[0]?.emailUri || "(no email)";
    const name = [worker.person?.legalName?.givenName, worker.person?.legalName?.familyName].filter(Boolean).join(" ") || "(no name)";

    console.log(`\nWorker: ${name} <${email}>`);
    console.log("  reportsTo:", JSON.stringify(reportsTo, null, 4));
    shown++;
  }

  if (shown === 0) {
    console.log("  ⚠️  No workers on this page have a reportsTo field.");
    console.log("  This means ADP may not be sending manager data, or the field name is different.");
    console.log("\n  Printing raw workAssignments keys from first worker for reference:");
    const wa = workers[0]?.workAssignments?.[0] || {};
    console.log(" ", Object.keys(wa).join(", "));
  }
})();
