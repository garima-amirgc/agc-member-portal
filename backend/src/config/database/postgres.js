const { Pool } = require("pg");
const { rewriteSqliteToPostgres, appendReturningIdIfInsert } = require("./sqlDialect");

let pool = null;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Admin','Manager','Employee')),
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  manager_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  profile_image_url TEXT,
  department TEXT
);

CREATE TABLE IF NOT EXISTS user_facilities (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, business_unit)
);

CREATE TABLE IF NOT EXISTS user_departments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, department)
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resource_category TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
  progress INTEGER NOT NULL DEFAULT 0,
  last_watched_lesson INTEGER REFERENCES lessons(id),
  completed_at TEXT,
  assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_completions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS manager_notifications (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TEXT,
  UNIQUE(manager_id, employee_id, course_id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS facility_upcoming (
  id SERIAL PRIMARY KEY,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  title TEXT NOT NULL,
  detail TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  start_at TEXT,
  end_at TEXT,
  published INTEGER DEFAULT 1,
  image_url TEXT,
  show_from_at TEXT,
  event_at TEXT,
  business_units TEXT
);

CREATE TABLE IF NOT EXISTS it_tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  assignee_id INTEGER REFERENCES users(id),
  attachments TEXT
);

CREATE TABLE IF NOT EXISTS resource_documents (
  id SERIAL PRIMARY KEY,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  category TEXT NOT NULL,
  resource_kind TEXT NOT NULL CHECK(resource_kind IN ('lesson','document')),
  resource_id INTEGER NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, business_unit, category, resource_kind, resource_id)
);
`;

async function runDDL(client) {
  const statements = PG_SCHEMA.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const st of statements) {
    await client.query(st + ";");
  }
}

async function migrateColumns(client) {
  const alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS start_at TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS end_at TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS published INTEGER DEFAULT 1",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS image_url TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS show_from_at TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS event_at TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS business_units TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id)",
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS resource_category TEXT",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS attachments TEXT",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ",
  ];
  for (const q of alters) {
    try {
      await client.query(q);
    } catch (e) {
      if (!String(e.message || "").includes("already exists")) console.warn("[pg migrate]", q.slice(0, 60), e.message);
    }
  }
  try {
    await client.query(`
      UPDATE it_tickets SET closed_at = updated_at
      WHERE status = 'closed' AND closed_at IS NULL
    `);
  } catch (e) {
    console.warn("[pg migrate] it_tickets closed_at backfill:", e.message);
  }
}

function createDbInterface(pgPool) {
  return {
    prepare(sqlText) {
      const adapted = rewriteSqliteToPostgres(sqlText);
      return {
        async get(...params) {
          const r = await pgPool.query(adapted, params);
          return r.rows[0];
        },
        async all(...params) {
          const r = await pgPool.query(adapted, params);
          return r.rows;
        },
        async run(...params) {
          const sqlRun = appendReturningIdIfInsert(adapted);
          const r = await pgPool.query(sqlRun, params);
          const id = r.rows[0]?.id;
          return { lastInsertRowid: id != null ? Number(id) : 0 };
        },
      };
    },
    async exec(sqlText) {
      const parts = sqlText
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        await pgPool.query(rewriteSqliteToPostgres(p));
      }
    },
  };
}

let db;

/** DO managed DB URIs include `sslmode=require`; pg v8+ maps that to strict verify and ignores pool `ssl` — strip and use explicit ssl below. */
function connectionStringForPool(conn) {
  try {
    const normalized = conn.replace(/^postgresql:\/\//i, "postgres://");
    const u = new URL(normalized);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("sslrootcert");
    const out = u.toString().replace(/^postgres:\/\//i, "postgresql://");
    return out;
  } catch {
    return conn;
  }
}

async function initDb() {
  const conn =
    process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()
      ? String(process.env.DATABASE_URL).trim()
      : "";
  if (!conn) throw new Error("DATABASE_URL is required for PostgreSQL mode");

  const sslDisabled = String(process.env.DATABASE_SSL || "").toLowerCase() === "false";
  pool = new Pool({
    connectionString: connectionStringForPool(conn),
    max: 12,
    idleTimeoutMillis: 30000,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
  });

  db = createDbInterface(pool);

  const client = await pool.connect();
  try {
    await runDDL(client);
    await migrateColumns(client);
    await client.query(`
      UPDATE facility_upcoming SET event_at = start_at
      WHERE (event_at IS NULL OR TRIM(COALESCE(event_at::text, '')) = '')
        AND start_at IS NOT NULL AND TRIM(COALESCE(start_at::text, '')) != ''
    `);
    const { rows: needs } = await client.query(`
      SELECT id, business_unit FROM facility_upcoming
      WHERE business_units IS NULL OR TRIM(COALESCE(business_units, '')) = ''
    `);
    for (const r of needs) {
      const bu = r.business_unit != null ? String(r.business_unit).trim() : "AGC";
      const json = JSON.stringify([bu]);
      await client.query("UPDATE facility_upcoming SET business_units = $1 WHERE id = $2", [json, r.id]);
    }
    await client.query(
      "UPDATE users SET department = 'Production' WHERE department IS NULL OR TRIM(department) = ''"
    );
    await client.query(`
      INSERT INTO user_facilities(user_id, business_unit)
      SELECT u.id, fac.business_unit
      FROM users u
      CROSS JOIN (VALUES ('AGC'), ('AQM'), ('SCF'), ('ASP')) AS fac(business_unit)
      WHERE u.role = 'Admin'
      ON CONFLICT (user_id, business_unit) DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_facilities(user_id, business_unit)
      SELECT id, business_unit FROM users
      ON CONFLICT (user_id, business_unit) DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_departments(user_id, department)
      SELECT u.id,
        CASE TRIM(COALESCE(u.department, ''))
          WHEN 'IT' THEN 'IT'
          WHEN 'Finance' THEN 'Finance'
          WHEN 'Sales' THEN 'Sales'
          WHEN 'Purchase' THEN 'Purchase'
          WHEN 'Safety' THEN 'Safety'
          WHEN 'Production' THEN 'Production'
          ELSE 'Production'
        END
      FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = u.id)
      ON CONFLICT (user_id, department) DO NOTHING
    `);
  } finally {
    client.release();
  }
}

const dbPath = "(PostgreSQL)";

module.exports = {
  initDb,
  get db() {
    return db;
  },
  dbPath,
  isPostgres: true,
  getPool: () => pool,
};
