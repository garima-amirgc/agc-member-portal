/* Quick check: start server separately on :5000, then: node scripts/test-leave-http.js */
const http = require("http");
const { initDb, db } = require("../src/config/db");
const jwt = require("jsonwebtoken");

(async () => {
  await initDb();
  const u = await db.prepare("SELECT id FROM users WHERE role = 'Employee' LIMIT 1").get();
  if (!u) {
    console.error("No employee user");
    process.exit(1);
  }
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET || "dev_secret");
  const body = JSON.stringify({
    start_date: "2026-05-01",
    end_date: "2026-05-02",
    reason: "script test",
  });
  const opts = {
    hostname: "127.0.0.1",
    port: 5000,
    path: "/auth/leave-request",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Authorization: `Bearer ${token}`,
    },
  };
  const req = http.request(opts, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => console.log("STATUS", res.statusCode, b));
  });
  req.on("error", (e) => console.error("HTTP error", e.message));
  req.write(body);
  req.end();
})();
