/**
 * One-time migration: copy users (and facilities/departments/manager links)
 * from local SQLite file `backend/lms.sqlite` into PostgreSQL (DATABASE_URL).
 *
 * Safe to run multiple times:
 * - Users are matched by email; existing users are not duplicated.
 * - Facilities/departments use UNIQUE constraints; inserts are idempotent.
 */
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { Pool } = require("pg");

// Load backend/.env (so DATABASE_URL is available when running locally)
try {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: false });
} catch {
  /* ignore */
}

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null ? fallback : String(v);
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function truthy(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally {
    stmt.free();
  }
}

function sqliteColumns(db, tableName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  try {
    const cols = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row && row.name) cols.push(String(row.name));
    }
    return cols;
  } finally {
    stmt.free();
  }
}

async function main() {
  const sqlitePath = path.join(__dirname, "..", "lms.sqlite");
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found at ${sqlitePath}`);
    process.exit(1);
  }
  const databaseUrl = env("DATABASE_URL").trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Point it to Postgres and rerun.");
    process.exit(1);
  }
  // pg-connection-string treats sslmode=require as verify-full (strict) and can ignore our ssl override.
  // Remove sslmode from the URL and pass ssl options explicitly.
  const sanitizedUrl = databaseUrl
    .replace(/[?&]sslmode=[^&]+/gi, "")
    .replace(/[?&]+$/, "");

  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(fs.readFileSync(sqlitePath));

  const userCols = new Set(sqliteColumns(sqlite, "users"));
  const col = (name, alias = name) => (userCols.has(name) ? `${name} AS ${alias}` : `NULL AS ${alias}`);
  const sqliteUsers = readAll(
    sqlite,
    `SELECT
      ${col("id")},
      ${col("name")},
      ${col("email")},
      ${col("password")},
      ${col("role")},
      ${col("business_unit")},
      ${col("manager_id")},
      ${col("created_at")},
      ${col("profile_image_url")},
      ${col("department")},
      ${col("invite_token_hash")},
      ${col("invite_expires_at")},
      ${col("password_reset_token_hash")},
      ${col("password_reset_expires_at")},
      ${col("birth_month")},
      ${col("birth_day")}
     FROM users
     ORDER BY id ASC`
  );

  const sqliteFacilities = readAll(
    sqlite,
    `SELECT user_id, business_unit FROM user_facilities ORDER BY user_id ASC, business_unit ASC`
  );
  const sqliteDepartments = readAll(
    sqlite,
    `SELECT user_id, department FROM user_departments ORDER BY user_id ASC, department ASC`
  );

  const pool = new Pool({
    connectionString: sanitizedUrl,
    // DigitalOcean managed Postgres often presents a cert chain Node won't trust by default on Windows.
    // For this one-time migration, disable strict verification.
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: ensure all users exist by email; build oldId -> newId mapping.
    const idMap = new Map(); // sqlite id -> pg id
    const emailToPgId = new Map();

    const existing = await client.query("SELECT id, email FROM users");
    for (const r of existing.rows) {
      emailToPgId.set(normalizeEmail(r.email), Number(r.id));
    }

    let createdUsers = 0;
    let matchedUsers = 0;

    for (const u of sqliteUsers) {
      const email = normalizeEmail(u.email);
      if (!email) continue;

      let pgId = emailToPgId.get(email);
      if (!pgId) {
        const ins = await client.query(
          `
          INSERT INTO users
            (name, email, password, role, business_unit, manager_id, created_at,
             profile_image_url, department,
             invite_token_hash, invite_expires_at,
             password_reset_token_hash, password_reset_expires_at,
             birth_month, birth_day)
          VALUES
            ($1,$2,$3,$4,$5,NULL, COALESCE($6::timestamptz, CURRENT_TIMESTAMP),
             $7,$8,
             $9,$10,
             $11,$12,
             $13,$14)
          RETURNING id
          `,
          [
            String(u.name || "").trim() || "—",
            email,
            String(u.password || "").trim() || "",
            String(u.role || "Employee").trim() || "Employee",
            String(u.business_unit || "AGC").trim() || "AGC",
            u.created_at ? String(u.created_at) : null,
            u.profile_image_url ? String(u.profile_image_url) : null,
            u.department ? String(u.department) : null,
            u.invite_token_hash ? String(u.invite_token_hash) : null,
            u.invite_expires_at ? String(u.invite_expires_at) : null,
            u.password_reset_token_hash ? String(u.password_reset_token_hash) : null,
            u.password_reset_expires_at ? String(u.password_reset_expires_at) : null,
            u.birth_month != null ? Number(u.birth_month) : null,
            u.birth_day != null ? Number(u.birth_day) : null,
          ]
        );
        pgId = Number(ins.rows[0].id);
        emailToPgId.set(email, pgId);
        createdUsers++;
      } else {
        matchedUsers++;
        // Best-effort: backfill missing avatar/dob if pg is empty.
        const pm = u.birth_month != null ? Number(u.birth_month) : null;
        const pd = u.birth_day != null ? Number(u.birth_day) : null;
        await client.query(
          `
          UPDATE users
          SET
            profile_image_url = COALESCE(profile_image_url, $2),
            birth_month = COALESCE(birth_month, $3),
            birth_day = COALESCE(birth_day, $4)
          WHERE id = $1
          `,
          [
            pgId,
            u.profile_image_url ? String(u.profile_image_url) : null,
            pm,
            pd,
          ]
        );
      }

      if (u.id != null) idMap.set(Number(u.id), pgId);
    }

    // Step 2: update manager links now that all ids exist.
    let managerLinks = 0;
    for (const u of sqliteUsers) {
      const oldId = u.id != null ? Number(u.id) : null;
      const oldMgr = u.manager_id != null ? Number(u.manager_id) : null;
      if (!oldId || !oldMgr) continue;
      const pgUserId = idMap.get(oldId);
      const pgMgrId = idMap.get(oldMgr);
      if (!pgUserId || !pgMgrId) continue;
      await client.query("UPDATE users SET manager_id = $2 WHERE id = $1", [pgUserId, pgMgrId]);
      managerLinks++;
    }

    // Step 3: facilities
    let facInserts = 0;
    for (const r of sqliteFacilities) {
      const pgUserId = idMap.get(Number(r.user_id));
      if (!pgUserId) continue;
      const bu = String(r.business_unit || "").trim().toUpperCase();
      if (!bu) continue;
      const q = await client.query(
        "INSERT INTO user_facilities(user_id, business_unit) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [pgUserId, bu]
      );
      facInserts += q.rowCount || 0;
    }

    // Step 4: departments
    let deptInserts = 0;
    for (const r of sqliteDepartments) {
      const pgUserId = idMap.get(Number(r.user_id));
      if (!pgUserId) continue;
      const dept = String(r.department || "").trim();
      if (!dept) continue;
      const q = await client.query(
        "INSERT INTO user_departments(user_id, department) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [pgUserId, dept]
      );
      deptInserts += q.rowCount || 0;
    }

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          sqlite_users: sqliteUsers.length,
          created_users: createdUsers,
          matched_users: matchedUsers,
          manager_links_updated: managerLinks,
          facilities_inserted: facInserts,
          departments_inserted: deptInserts,
        },
        null,
        2
      )
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

