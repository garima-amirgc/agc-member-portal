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
  department TEXT,
  designation TEXT,
  birth_month INTEGER,
  birth_day INTEGER,
  phone TEXT,
  address TEXT
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
  order_index INTEGER NOT NULL,
  video_uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS manager_all_training_alerts (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TEXT,
  UNIQUE(manager_id, employee_id)
);

CREATE TABLE IF NOT EXISTS employee_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'all_training_complete',
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TEXT
);

CREATE TABLE IF NOT EXISTS all_training_milestones (
  employee_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  assignment_count INTEGER NOT NULL,
  notified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS employee_of_month (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  manual_name TEXT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
  citation TEXT,
  image_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS leadership_updates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  link_url TEXT,
  image_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS new_hires (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  link_url TEXT,
  image_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customer_wins (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  link_url TEXT,
  image_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS community_involvement (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  link_url TEXT,
  image_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS company_content_items (
  id SERIAL PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  link_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ,
  file_uploaded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS birthday_list (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  department TEXT NOT NULL,
  dob TEXT NOT NULL, -- YYYY-MM-DD
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS embedded_reports (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  business_units TEXT NOT NULL,
  embed_src TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS report_access_users (
  report_id INTEGER NOT NULL REFERENCES embedded_reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_id, user_id)
);

CREATE TABLE IF NOT EXISTS engagement_calendar (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  data_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'holiday',
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT, -- YYYY-MM-DD inclusive
  color TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  poll_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  start_at TEXT,
  end_at TEXT,
  banner_image_url TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poll_submissions (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS portal_visits (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_visit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_documents (
  id SERIAL PRIMARY KEY,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  file_uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_report_links (
  id SERIAL PRIMARY KEY,
  business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
  category TEXT NOT NULL DEFAULT 'it',
  title TEXT NOT NULL,
  link_url TEXT NOT NULL,
  description TEXT,
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
    "ALTER TABLE birthday_list ADD COLUMN IF NOT EXISTS company_name TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id)",
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS resource_category TEXT",
    "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_uploaded_at TIMESTAMPTZ",
    "ALTER TABLE resource_documents ADD COLUMN IF NOT EXISTS file_uploaded_at TIMESTAMPTZ",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS attachments TEXT",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ",
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_month INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_day INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS join_month INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS join_day INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS join_year INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_grants TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_university_only INTEGER NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      poll_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      start_at TEXT,
      end_at TEXT,
      banner_image_url TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS start_at TEXT",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS end_at TEXT",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS banner_image_url TEXT",
    `CREATE TABLE IF NOT EXISTS poll_submissions (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers_json TEXT NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(poll_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS portal_visits (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      visit_count INTEGER NOT NULL DEFAULT 0,
      last_visit_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS portal_visit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS employee_of_month (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      manual_name TEXT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      citation TEXT,
      image_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    )`,
    "ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS image_url TEXT",
    "ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS manual_name TEXT",
    "ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS leadership_updates (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      link_url TEXT,
      image_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS new_hires (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      link_url TEXT,
      image_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    )`,
    "ALTER TABLE leadership_updates ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE new_hires ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS portal_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS customer_wins (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      link_url TEXT,
      image_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS community_involvement (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      link_url TEXT,
      image_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS company_content_items (
      id SERIAL PRIMARY KEY,
      section TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_url TEXT,
      link_url TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ,
      file_uploaded_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS resource_report_links (
      id SERIAL PRIMARY KEY,
      business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
      category TEXT NOT NULL DEFAULT 'it',
      title TEXT NOT NULL,
      link_url TEXT NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_portal_visit_log_visited_at ON portal_visit_log (visited_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_portal_visit_log_user_id ON portal_visit_log (user_id)",
    "CREATE TABLE IF NOT EXISTS report_access_users (report_id INTEGER NOT NULL REFERENCES embedded_reports(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, UNIQUE(report_id, user_id))",
    `CREATE TABLE IF NOT EXISTS manager_all_training_alerts (
      id SERIAL PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      dismissed_at TEXT,
      UNIQUE(manager_id, employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS employee_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'all_training_complete',
      title TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      dismissed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS all_training_milestones (
      employee_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      assignment_count INTEGER NOT NULL,
      notified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
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
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'calendar_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%kind%'
          AND pg_get_constraintdef(oid) LIKE '%activity%'
          AND pg_get_constraintdef(oid) LIKE '%holiday%'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE calendar_events DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);
  } catch (e) {
    console.warn("[pg migrate] calendar_events kind constraint:", e.message);
  }
  try {
    await client.query(`
      UPDATE it_tickets SET closed_at = updated_at
      WHERE status = 'closed' AND closed_at IS NULL
    `);
  } catch (e) {
    console.warn("[pg migrate] it_tickets closed_at backfill:", e.message);
  }

  try {
    await client.query(`
      UPDATE it_tickets SET priority = 'medium'
      WHERE priority IS NULL OR TRIM(priority) = ''
    `);
  } catch (e) {
    console.warn("[pg migrate] it_tickets priority backfill:", e.message);
  }

  try {
    await client.query(`
      UPDATE birthday_list
      SET company_name = 'AGC University'
      WHERE company_name IS NULL OR TRIM(company_name) = ''
    `);
  } catch (e) {
    console.warn("[pg migrate] birthday_list company_name backfill:", e.message);
  }

  try {
    await client.query(`
      UPDATE lessons l
      SET video_uploaded_at = c.created_at
      FROM courses c
      WHERE c.id = l.course_id
        AND l.video_uploaded_at IS NULL
    `);
  } catch (e) {
    console.warn("[pg migrate] lessons video_uploaded_at backfill:", e.message);
  }

  try {
    await client.query(`
      UPDATE resource_documents
      SET file_uploaded_at = created_at
      WHERE file_uploaded_at IS NULL
    `);
  } catch (e) {
    console.warn("[pg migrate] resource_documents file_uploaded_at backfill:", e.message);
  }

  try {
    await client.query(`ALTER TABLE employee_of_month DROP CONSTRAINT IF EXISTS employee_of_month_year_month_key`);
  } catch (e) {
    console.warn("[pg migrate] employee_of_month drop unique:", e.message);
  }

  try {
    await client.query(`ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS manual_name TEXT`);
    await client.query(`ALTER TABLE employee_of_month ALTER COLUMN user_id DROP NOT NULL`);
  } catch (e) {
    console.warn("[pg migrate] employee_of_month manual entry:", e.message);
  }

  try {
    await client.query(`ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    await client.query(`UPDATE employee_of_month SET sort_order = id WHERE COALESCE(sort_order, 0) = 0`);
  } catch (e) {
    console.warn("[pg migrate] employee_of_month sort_order:", e.message);
  }

  try {
    await client.query(`UPDATE leadership_updates SET sort_order = id WHERE COALESCE(sort_order, 0) = 0`);
    await client.query(`UPDATE new_hires SET sort_order = id WHERE COALESCE(sort_order, 0) = 0`);
    await client.query(`UPDATE customer_wins SET sort_order = id WHERE COALESCE(sort_order, 0) = 0`);
    await client.query(`UPDATE community_involvement SET sort_order = id WHERE COALESCE(sort_order, 0) = 0`);
  } catch (e) {
    console.warn("[pg migrate] spotlight sort_order backfill:", e.message);
  }

  try {
    const { backfillProfileCelebrationDates } = require("../../services/profileCelebrationBackfill.service");
    const stats = await backfillProfileCelebrationDates(db);
    if (stats.join_from_created > 0) {
      console.log(`[pg migrate] profile join-date backfill: join_from_created=${stats.join_from_created}`);
    }
  } catch (e) {
    console.warn("[pg migrate] profile celebration backfill:", e.message);
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS engagement_calendar (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL UNIQUE,
        data_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const ecSeed = await client.query("SELECT 1 FROM engagement_calendar LIMIT 1");
    if (ecSeed.rows.length === 0) {
      const def = require("../../data/engagementCalendarDefault");
      await client.query("INSERT INTO engagement_calendar (year, data_json) VALUES ($1, $2::jsonb)", [
        def.DEFAULT_YEAR,
        def.defaultDataJson(),
      ]);
    }
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
