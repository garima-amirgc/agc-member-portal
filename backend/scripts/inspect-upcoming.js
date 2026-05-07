const fs = require("fs");
const path = require("path");

async function main() {
  // Resolve from backend package root.
  const backendRoot = path.join(__dirname, "..");
  const dbPath = path.join(backendRoot, "lms.sqlite");

  if (!fs.existsSync(dbPath)) {
    console.error(`DB not found at ${dbPath}`);
    process.exit(1);
  }

  // Use the project's dependency (already used by the app).
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const r = db.exec(
    "SELECT id,business_unit,title,COALESCE(published,1) AS published,show_from_at,event_at,end_at,business_units,created_at FROM facility_upcoming ORDER BY id DESC LIMIT 50"
  );
  if (!r.length) {
    console.log("[]");
    return;
  }
  const cols = r[0].columns;
  const out = r[0].values.map((row) => {
    const o = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = row[i];
    return o;
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

