"use strict";

/**
 * One-off diagnostic — NOT wired into the app, run manually and then safe
 * to delete once we know the real shape of this endpoint.
 *
 * Probes ADP's Event Notification Messages endpoint
 * (GET /core/v1/event-notification-messages) using our existing ADP
 * connection. The Time Off Request API Guide only mentions this endpoint
 * once, in Chapter 10 (pages 37-38), inside the write-up for two unrelated
 * known-issue bug IDs (DE642896 / DE642898) — it never actually documents
 * the endpoint's query parameters or response shape. The real spec lives in
 * a separate "ADP Event API and Event Notification Guide" we don't have.
 *
 * ADP support has confirmed event notifications are enabled for our client
 * ID (2026-09-23), so rather than wait on that separate guide, this just
 * calls the endpoint directly with our existing credentials and prints back
 * exactly what ADP sends — success or error — so we can see the real shape
 * instead of guessing at it.
 *
 * Run from the backend folder (needs backend/.env already set up with the
 * same ADP_CLIENT_* vars the rest of the app uses):
 *
 *   node src/scripts/probeEventNotifications.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), override: true });

const adpSvc = require("../services/adp.service");

async function main() {
  if (!adpSvc.isConfigured()) {
    console.error("ADP is not configured — missing ADP_CLIENT_KEY / ADP_CLIENT_CERT / ADP_CLIENT_ID in backend/.env");
    process.exit(1);
  }

  console.log("Calling GET /core/v1/event-notification-messages with no query parameters ...\n");

  try {
    const data = await adpSvc.adpGet("/core/v1/event-notification-messages");
    console.log("SUCCESS — raw response from ADP:\n");
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`FAILED — HTTP status ${e.statusCode ?? "?"}`);
    console.log(e.message);
    console.log(
      "\nA 403/404 here usually means the canonical URI for this endpoint still needs to be\n" +
        "added to our app's Consumer Application Registry entry, separate from the six\n" +
        "event-type subscribe scopes ADP already enabled — worth asking about if you see this.\n" +
        "A 400 with a message about a missing/invalid parameter is actually good news: it means\n" +
        "we're authorized and just need to add whatever parameter ADP is asking for."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  });
