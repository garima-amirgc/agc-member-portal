"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const https = require("https");
const fs = require("fs");

function loadPem(v) {
  if (!v) return null;
  v = String(v).trim();
  if (v.startsWith("-----")) return v.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const buf = fs.readFileSync(path.resolve(v));
  return buf.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() + "\n";
}

function req(url, opts, body) {
  return new Promise((res, rej) => {
    const r = https.request(url, opts, (resp) => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => res({ status: resp.statusCode, body: d }));
    });
    r.on("error", rej);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log("=== ADP Connection Test ===\n");

  const key = loadPem(process.env.ADP_CLIENT_KEY);
  const cert = loadPem(process.env.ADP_CLIENT_CERT);
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET || "";
  const tokenUrl = process.env.ADP_TOKEN_URL || "https://accounts.adp.com/auth/oauth/v2/token";
  const apiBase = (process.env.ADP_API_BASE || "https://api.adp.com").replace(/\/$/, "");

  if (!key || !cert || !clientId) {
    console.error("❌ Missing ADP_CLIENT_KEY, ADP_CLIENT_CERT or ADP_CLIENT_ID in .env");
    process.exit(1);
  }

  const agent = new https.Agent({ key, cert });

  // Step 1: Get token
  console.log("1. Getting token from", tokenUrl);
  const body = "grant_type=client_credentials";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const t = await req(tokenUrl, {
    method: "POST", agent,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}`, "Content-Length": Buffer.byteLength(body) }
  }, body);

  const tokenJson = JSON.parse(t.body);
  if (!tokenJson.access_token) {
    console.error("❌ Token exchange failed:", t.body);
    process.exit(1);
  }
  console.log("✅ Token obtained\n");

  const token = tokenJson.access_token;

  // Step 2: Fetch all workers (paginated) and find by email
  const searchEmail = "garima.singh@amirgc.com";
  const pageSize = 100;
  let skip = 0;
  let totalFetched = 0;
  let match = null;

  console.log(`2. Searching for "${searchEmail}" across all workers (paginated)...\n`);

  while (skip <= 1900 && !match) {
    const url = `${apiBase}/hr/v2/workers?$top=${pageSize}&$skip=${skip}`;
    const w = await req(url, { method: "GET", agent, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });

    if (w.status !== 200) {
      console.log(`   Page at skip=${skip} failed (${w.status}):`, w.body.slice(0, 300));
      break;
    }

    const page = JSON.parse(w.body)?.workers || [];
    totalFetched += page.length;
    console.log(`   skip=${skip}: ${page.length} workers (total: ${totalFetched})`);

    match = page.find(worker => {
      const bcEmails = worker.businessCommunication?.emails || [];
      const personEmails = worker.person?.communicationEmails || worker.person?.communications?.emails || [];
      return [...bcEmails, ...personEmails].some(e => String(e.emailUri || "").toLowerCase() === searchEmail.toLowerCase());
    });
    if (match) break;
    if (page.length < pageSize) break;
    skip += pageSize;
  }

  if (!match) {
    console.log(`\n"${searchEmail}" NOT FOUND in ${totalFetched} workers.`);
  } else {
    console.log(`\n✅ Found worker!\n`);

    const wa = match.workAssignments || [];
    const primary = wa.find(a => a.primaryIndicator === true)
      || wa.find(a => String(a.workerStatus?.statusCode?.codeValue || "").toLowerCase() === "active")
      || wa[wa.length - 1]
      || {};

    console.log("=== DIAGNOSTIC FIELDS ===\n");
    console.log("workerID:", JSON.stringify(match.workerID, null, 2));
    console.log("associateOID:", match.associateOID);
    console.log("\n--- Work Assignment (primary/active) ---");
    console.log("jobTitle:", primary.jobTitle);
    console.log("hireDate:", primary.hireDate);
    console.log("departmentCode:", JSON.stringify(primary.departmentCode, null, 2));
    console.log("homeOrganizationalUnits:", JSON.stringify(primary.homeOrganizationalUnits, null, 2));
    console.log("workLocation:", JSON.stringify(primary.workLocation, null, 2));
    console.log("workerStatus:", JSON.stringify(primary.workerStatus, null, 2));
    console.log("workerTypeCode:", JSON.stringify(primary.workerTypeCode, null, 2));
    console.log("\n--- Communications ---");
    console.log("businessCommunication:", JSON.stringify(match.businessCommunication, null, 2));
    console.log("person.communicationPhones:", JSON.stringify(match.person?.communicationPhones, null, 2));
    console.log("person.communications:", JSON.stringify(match.person?.communications, null, 2));
    console.log("\n--- Full raw record (for reference) ---");
    console.log(JSON.stringify(match, null, 2));
  }
})();
