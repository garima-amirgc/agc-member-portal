const path = require("path");
const fs = require("fs");

const backendRoot = path.join(__dirname, "..", "..", "..");
const envDb = process.env.DB_PATH != null ? String(process.env.DB_PATH).trim() : "";
const dbPath = envDb
  ? path.isAbsolute(envDb)
    ? envDb
    : path.resolve(backendRoot, envDb.replace(/^\.\/+/, ""))
  : path.join(backendRoot, "lms.sqlite");

let rawDb = null;

function persist() {
  if (!rawDb) return;
  const data = rawDb.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function bindParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

function createDbInterface() {
  return {
    prepare(sql) {
      return {
        get(...params) {
          return Promise.resolve(
            (() => {
              const stmt = rawDb.prepare(sql);
              try {
                if (params.length) stmt.bind(bindParams(params));
                if (!stmt.step()) return undefined;
                return stmt.getAsObject();
              } finally {
                stmt.free();
              }
            })()
          );
        },
        all(...params) {
          return Promise.resolve(
            (() => {
              const stmt = rawDb.prepare(sql);
              try {
                if (params.length) stmt.bind(bindParams(params));
                const rows = [];
                while (stmt.step()) rows.push(stmt.getAsObject());
                return rows;
              } finally {
                stmt.free();
              }
            })()
          );
        },
        run(...params) {
          return Promise.resolve(
            (() => {
              const stmt = rawDb.prepare(sql);
              try {
                if (params.length) stmt.bind(bindParams(params));
                stmt.step();
              } finally {
                stmt.free();
              }
              let lastInsertRowid = 0;
              const idStmt = rawDb.prepare("SELECT last_insert_rowid() AS id");
              try {
                if (idStmt.step()) {
                  const o = idStmt.getAsObject();
                  lastInsertRowid = Number(o.id) || 0;
                }
              } finally {
                idStmt.free();
              }
              persist();
              return { lastInsertRowid };
            })()
          );
        },
      };
    },
    exec(sql) {
      return Promise.resolve(
        (() => {
          rawDb.exec(sql);
          persist();
        })()
      );
    },
  };
}

const db = createDbInterface();

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin','Manager','Employee')),
    business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
    manager_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    designation TEXT,
    FOREIGN KEY(manager_id) REFERENCES users(id)
  );

  -- Allows users to belong to multiple facilities (business units).
  -- Admins can update this; the app uses this table for course access/assignment.
  CREATE TABLE IF NOT EXISTS user_facilities (
    user_id INTEGER NOT NULL,
    business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, business_unit)
  );

  CREATE TABLE IF NOT EXISTS user_departments (
    user_id INTEGER NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, department)
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    video_uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
    progress INTEGER NOT NULL DEFAULT 0,
    last_watched_lesson INTEGER,
    completed_at TEXT,
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY(last_watched_lesson) REFERENCES lessons(id)
  );

  CREATE TABLE IF NOT EXISTS lesson_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id, lesson_id),
    FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  -- Persistent manager notifications for course completions.
  CREATE TABLE IF NOT EXISTS manager_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    course_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    dismissed_at TEXT,
    FOREIGN KEY(manager_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(manager_id, employee_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS manager_all_training_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    dismissed_at TEXT,
    FOREIGN KEY(manager_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(manager_id, employee_id)
  );

  CREATE TABLE IF NOT EXISTS employee_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'all_training_complete',
    title TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    dismissed_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS all_training_milestones (
    employee_id INTEGER PRIMARY KEY,
    assignment_count INTEGER NOT NULL,
    notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Leave requests: employee -> assigned manager (users.manager_id).
  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    manager_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT,
    FOREIGN KEY(employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(manager_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Employee of the Month (home page spotlight).
  CREATE TABLE IF NOT EXISTS employee_of_month (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    manual_name TEXT,
    facility TEXT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    citation TEXT,
    image_url TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS leadership_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    link_url TEXT,
    image_url TEXT,
    facility TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS new_hires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    link_url TEXT,
    image_url TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS portal_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS customer_wins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    link_url TEXT,
    image_url TEXT,
    facility TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS community_involvement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    link_url TEXT,
    image_url TEXT,
    facility TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS company_content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    link_url TEXT,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    file_uploaded_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Admin-managed events shown on facility pages (Upcoming).
  CREATE TABLE IF NOT EXISTS facility_upcoming (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
    title TEXT NOT NULL,
    detail TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Admin-managed birthday directory (shown in the below-nav strip for all users).
  CREATE TABLE IF NOT EXISTS birthday_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    department TEXT NOT NULL,
    dob TEXT NOT NULL, -- YYYY-MM-DD
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Admin-managed embedded reports (e.g. Power BI) shown under /reports in the portal.
  -- business_units is JSON (e.g. ["AGC","AQM"]) to control visibility by facility.
  CREATE TABLE IF NOT EXISTS embedded_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    business_units TEXT NOT NULL, -- JSON array string
    embed_src TEXT NOT NULL, -- iframe src URL only (safer than storing raw HTML)
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Optional per-report access allowlist. If a report has any rows here,
  -- only the listed users can see it (in addition to facility filtering).
  CREATE TABLE IF NOT EXISTS report_access_users (
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(report_id) REFERENCES embedded_reports(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(report_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS engagement_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL UNIQUE,
    data_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Admin-managed calendar events (holidays / activities / other) shown in the portal calendar.
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'holiday', -- holiday | activity | other
    start_date TEXT NOT NULL, -- YYYY-MM-DD (local calendar date)
    end_date TEXT, -- optional YYYY-MM-DD (inclusive)
    color TEXT, -- optional hex or CSS color (used by UI chips)
    notes TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Admin-configured poll/feedback popup (definition JSON) + per-user submissions (answers JSON).
  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    poll_json TEXT NOT NULL, -- JSON definition (questions, types, etc.)
    active INTEGER NOT NULL DEFAULT 0,
    start_at TEXT, -- ISO datetime; popup appears at/after this time (optional)
    end_at TEXT, -- ISO datetime; popup disappears after this time (optional)
    banner_image_url TEXT, -- optional URL or /uploads/... path shown at top of popup
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS poll_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(poll_id, user_id)
  );

  -- Per-user member portal visits (legacy aggregate).
  CREATE TABLE IF NOT EXISTS portal_visits (
    user_id INTEGER PRIMARY KEY,
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visit_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- One row per home/dashboard open (used for weekly top-visitors leaderboard).
  CREATE TABLE IF NOT EXISTS portal_visit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    visited_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

async function initDb() {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(filebuffer);
  } else {
    rawDb = new SQL.Database();
  }

  rawDb.run("PRAGMA foreign_keys = ON");
  rawDb.exec(SCHEMA);

  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN profile_image_url TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE birthday_list ADD COLUMN company_name TEXT");
  } catch {
  }
  try {
    rawDb.exec("UPDATE birthday_list SET company_name = 'AGC University' WHERE company_name IS NULL OR TRIM(company_name) = ''");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN start_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN end_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN published INTEGER DEFAULT 1");
  } catch {
  }
  try {
    const info = rawDb.exec("PRAGMA table_info(facility_upcoming)");
    const table = info && info[0];
    const nameIdx = table && table.columns ? table.columns.indexOf("name") : -1;
    const cols = table && table.values ? table.values : [];
    const hasPublished = nameIdx >= 0 && cols.some((row) => row[nameIdx] === "published");
    if (!hasPublished) {
      rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN published INTEGER DEFAULT 1");
    }
  } catch (e) {
    console.error("[db] facility_upcoming published column:", e.message || e);
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN image_url TEXT");
  } catch {
  }

  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS portal_visits (
        user_id INTEGER PRIMARY KEY,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_visit_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch (e) {
    console.error("[db] portal_visits table:", e.message || e);
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS portal_visit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        visited_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_portal_visit_log_visited_at ON portal_visit_log (visited_at);
      CREATE INDEX IF NOT EXISTS idx_portal_visit_log_user_id ON portal_visit_log (user_id);
    `);
  } catch (e) {
    console.error("[db] portal_visit_log table:", e.message || e);
  }
  try {
    const info2 = rawDb.exec("PRAGMA table_info(facility_upcoming)");
    const table2 = info2 && info2[0];
    const nameIdx2 = table2 && table2.columns ? table2.columns.indexOf("name") : -1;
    const cols2 = table2 && table2.values ? table2.values : [];
    const hasImageUrl = nameIdx2 >= 0 && cols2.some((row) => row[nameIdx2] === "image_url");
    if (!hasImageUrl) {
      rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN image_url TEXT");
    }
  } catch (e) {
    console.error("[db] facility_upcoming image_url column:", e.message || e);
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN show_from_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN event_at TEXT");
  } catch {
  }
  try {
    rawDb.exec(`
      UPDATE facility_upcoming
      SET event_at = start_at
      WHERE (event_at IS NULL OR TRIM(IFNULL(event_at, '')) = '')
        AND start_at IS NOT NULL AND TRIM(IFNULL(start_at, '')) != ''
    `);
  } catch (e) {
    console.error("[db] facility_upcoming event_at backfill:", e.message || e);
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN business_units TEXT");
  } catch {
  }
  try {
    const sel = rawDb.prepare(
      `SELECT id, business_unit FROM facility_upcoming
       WHERE business_units IS NULL OR TRIM(IFNULL(business_units, '')) = ''`
    );
    const needsBackfill = [];
    while (sel.step()) needsBackfill.push(sel.getAsObject());
    sel.free();
    for (const r of needsBackfill) {
      const bu = r.business_unit != null ? String(r.business_unit).trim() : "AGC";
      const json = JSON.stringify([bu]);
      const upd = rawDb.prepare("UPDATE facility_upcoming SET business_units = ? WHERE id = ?");
      try {
        upd.bind(bindParams([json, r.id]));
        upd.step();
      } finally {
        upd.free();
      }
    }
  } catch (e) {
    console.error("[db] facility_upcoming business_units backfill:", e.message || e);
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN department TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN designation TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN invite_token_hash TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN invite_expires_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN birth_month INTEGER");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN birth_day INTEGER");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN join_month INTEGER");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN join_day INTEGER");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN join_year INTEGER");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN address TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN admin_grants TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN facility_university_only INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN is_new_hire INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN new_hire_marked_at TEXT");
  } catch {
  }

  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS employee_of_month (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        manual_name TEXT,
        facility TEXT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
        citation TEXT,
        image_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE employee_of_month ADD COLUMN image_url TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE employee_of_month ADD COLUMN manual_name TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE employee_of_month ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE employee_of_month ADD COLUMN facility TEXT");
  } catch {
  }
  try {
    rawDb.exec("UPDATE employee_of_month SET sort_order = id WHERE COALESCE(sort_order, 0) = 0");
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS leadership_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        link_url TEXT,
        image_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS new_hires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        link_url TEXT,
        image_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE leadership_updates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE new_hires ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE leadership_updates ADD COLUMN facility TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE customer_wins ADD COLUMN facility TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE community_involvement ADD COLUMN facility TEXT");
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT
      );
    `);
  } catch {
  }
  try {
    const migrated = rawDb
      .prepare("SELECT 1 FROM portal_settings WHERE setting_key = 'eom_multi_per_month' LIMIT 1")
      .get();
    if (!migrated) {
      rawDb.exec(`
        CREATE TABLE employee_of_month__multi (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          manual_name TEXT,
          facility TEXT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
          citation TEXT,
          image_url TEXT,
          published INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
      rawDb.exec(`
        INSERT INTO employee_of_month__multi (
          id, user_id, manual_name, facility, year, month, citation, image_url, published, created_by, created_at, updated_at
        )
        SELECT id, user_id, manual_name, facility, year, month, citation, image_url, published, created_by, created_at, updated_at
        FROM employee_of_month;
      `);
      rawDb.exec("DROP TABLE employee_of_month");
      rawDb.exec("ALTER TABLE employee_of_month__multi RENAME TO employee_of_month");
      rawDb.exec(`
        INSERT INTO portal_settings (setting_key, setting_value, updated_at)
        VALUES ('eom_multi_per_month', '1', datetime('now'));
      `);
    }
  } catch {
  }
  try {
    const migrated = rawDb
      .prepare("SELECT 1 FROM portal_settings WHERE setting_key = 'eom_manual_entry' LIMIT 1")
      .get();
    if (!migrated) {
      rawDb.exec(`
        CREATE TABLE employee_of_month__manual (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          manual_name TEXT,
          facility TEXT,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
          citation TEXT,
          image_url TEXT,
          published INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
      rawDb.exec(`
        INSERT INTO employee_of_month__manual (
          id, user_id, manual_name, facility, year, month, citation, image_url, published, created_by, created_at, updated_at
        )
        SELECT id, user_id, manual_name, facility, year, month, citation, image_url, published, created_by, created_at, updated_at
        FROM employee_of_month;
      `);
      rawDb.exec("DROP TABLE employee_of_month");
      rawDb.exec("ALTER TABLE employee_of_month__manual RENAME TO employee_of_month");
      rawDb.exec(`
        INSERT INTO portal_settings (setting_key, setting_value, updated_at)
        VALUES ('eom_manual_entry', '1', datetime('now'));
      `);
    }
  } catch {
  }
  try {
    rawDb.exec("UPDATE leadership_updates SET sort_order = id WHERE COALESCE(sort_order, 0) = 0");
    rawDb.exec("UPDATE new_hires SET sort_order = id WHERE COALESCE(sort_order, 0) = 0");
    rawDb.exec("UPDATE customer_wins SET sort_order = id WHERE COALESCE(sort_order, 0) = 0");
    rawDb.exec("UPDATE community_involvement SET sort_order = id WHERE COALESCE(sort_order, 0) = 0");
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS customer_wins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        link_url TEXT,
        image_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS community_involvement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        link_url TEXT,
        image_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS company_content_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_url TEXT,
        link_url TEXT,
        published INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        file_uploaded_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }

  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS polls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        poll_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        start_at TEXT,
        end_at TEXT,
        banner_image_url TEXT,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE polls ADD COLUMN start_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE polls ADD COLUMN end_at TEXT");
  } catch {
  }
  try {
    rawDb.exec("ALTER TABLE polls ADD COLUMN banner_image_url TEXT");
  } catch {
  }
  try {
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS poll_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(poll_id, user_id)
      );
    `);
  } catch {
  }

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS it_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN assignee_id INTEGER REFERENCES users(id)");
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN attachments TEXT");
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN closed_at TEXT");
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  } catch {
  }

  try {
    rawDb.exec("UPDATE it_tickets SET priority = 'medium' WHERE priority IS NULL OR TRIM(priority) = ''");
  } catch {
  }

  try {
    rawDb.exec(
      "UPDATE it_tickets SET closed_at = updated_at WHERE status = 'closed' AND (closed_at IS NULL OR TRIM(COALESCE(closed_at, '')) = '')"
    );
  } catch {
  }

  try {
    rawDb.exec("UPDATE users SET department = 'Production' WHERE department IS NULL OR TRIM(department) = ''");
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE courses ADD COLUMN resource_category TEXT");
  } catch {
  }

  try {
    rawDb.exec("ALTER TABLE lessons ADD COLUMN video_uploaded_at TEXT");
  } catch {
  }
  try {
    rawDb.exec(`
      UPDATE lessons
      SET video_uploaded_at = (
        SELECT c.created_at FROM courses c WHERE c.id = lessons.course_id
      )
      WHERE video_uploaded_at IS NULL OR TRIM(COALESCE(video_uploaded_at, '')) = ''
    `);
  } catch {
  }

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS resource_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      file_uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  try {
    rawDb.exec("ALTER TABLE resource_documents ADD COLUMN file_uploaded_at TEXT");
  } catch {
  }
  try {
    rawDb.exec(`
      UPDATE resource_documents
      SET file_uploaded_at = created_at
      WHERE file_uploaded_at IS NULL OR TRIM(COALESCE(file_uploaded_at, '')) = ''
    `);
  } catch {
  }

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS resource_report_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
      category TEXT NOT NULL DEFAULT 'it',
      title TEXT NOT NULL,
      link_url TEXT NOT NULL,
      description TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS resource_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
      category TEXT NOT NULL,
      resource_kind TEXT NOT NULL CHECK(resource_kind IN ('lesson','document')),
      resource_id INTEGER NOT NULL,
      completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, business_unit, category, resource_kind, resource_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  rawDb.exec(`
    INSERT OR IGNORE INTO user_facilities(user_id, business_unit)
    SELECT u.id, fac.business_unit
    FROM users u
    CROSS JOIN (
      SELECT 'AGC' AS business_unit
      UNION ALL SELECT 'AQM'
      UNION ALL SELECT 'SCF'
      UNION ALL SELECT 'ASP'
    ) fac
    WHERE u.role = 'Admin'
  `);

  rawDb.exec(
    "INSERT OR IGNORE INTO user_facilities(user_id, business_unit) SELECT id, business_unit FROM users"
  );

  rawDb.exec(`
    INSERT OR IGNORE INTO user_departments(user_id, department)
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
  `);

  try {
    const cntRow = await db.prepare("SELECT COUNT(*) AS c FROM engagement_calendar").get();
    const n = Number(cntRow?.c ?? 0);
    if (!n) {
      const def = require("../../data/engagementCalendarDefault");
      await db
        .prepare("INSERT INTO engagement_calendar (year, data_json, updated_at) VALUES (?, ?, datetime('now'))")
        .run(def.DEFAULT_YEAR, def.defaultDataJson());
    }
  } catch (e) {
    console.error("[db] engagement_calendar seed:", e.message || e);
  }

  try {
    const { migrateLegacyUpcomingGrantKey } = require("../../config/adminGrants");
    await migrateLegacyUpcomingGrantKey(db);
  } catch (e) {
    console.error("[db] admin_grants upcoming migration:", e.message || e);
  }

  try {
    rawDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users (manager_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons (course_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments (course_id);
      CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests (employee_id);
      CREATE INDEX IF NOT EXISTS idx_leave_requests_manager_id ON leave_requests (manager_id);
      CREATE INDEX IF NOT EXISTS idx_it_tickets_user_id ON it_tickets (user_id);
      CREATE INDEX IF NOT EXISTS idx_it_tickets_assignee_id ON it_tickets (assignee_id);
      CREATE INDEX IF NOT EXISTS idx_company_content_items_section ON company_content_items (section);
      CREATE INDEX IF NOT EXISTS idx_manager_notifications_manager_id ON manager_notifications (manager_id);
      CREATE INDEX IF NOT EXISTS idx_manager_all_training_alerts_manager_id ON manager_all_training_alerts (manager_id);
      CREATE INDEX IF NOT EXISTS idx_resource_documents_business_unit_category ON resource_documents (business_unit, category);
    `);
  } catch (e) {
    console.error("[db] performance indexes:", e.message || e);
  }

  persist();
}

module.exports = { db, initDb, dbPath, isPostgres: false };
