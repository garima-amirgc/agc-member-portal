const path = require("path");
const fs = require("fs");

/** Backend package root (…/backend), not process.cwd() — avoids a second empty DB when Node starts from the repo root. */
const backendRoot = path.join(__dirname, "..", "..");
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

/** sql.js throws if bind() receives undefined; SQLite NULL should be null in JS. */
function bindParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

/**
 * better-sqlite3–compatible sync wrapper over sql.js (no native build).
 */
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

  // Lightweight migrations for existing DB files.
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN profile_image_url TEXT");
  } catch {
    // column already exists
  }
  try {
    rawDb.exec("ALTER TABLE birthday_list ADD COLUMN company_name TEXT");
  } catch {
    /* column already exists */
  }
  try {
    rawDb.exec("UPDATE birthday_list SET company_name = 'AGC University' WHERE company_name IS NULL OR TRIM(company_name) = ''");
  } catch {
    /* ignore */
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN start_at TEXT");
  } catch {
    // column already exists
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN end_at TEXT");
  } catch {
    // column already exists
  }
  try {
    // Avoid CHECK on ALTER — some SQLite/sql.js builds reject it and the column never gets added.
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN published INTEGER DEFAULT 1");
  } catch {
    // column already exists
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
    /* column already exists */
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
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE facility_upcoming ADD COLUMN event_at TEXT");
  } catch {
    /* exists */
  }
  try {
    // Legacy `start_at` was the only date; treat it as the real event time after upgrade.
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
    /* column already exists */
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
    // column already exists
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN designation TEXT");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN invite_token_hash TEXT");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN invite_expires_at TEXT");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN birth_month INTEGER");
  } catch {
    /* exists */
  }
  try {
    rawDb.exec("ALTER TABLE users ADD COLUMN birth_day INTEGER");
  } catch {
    /* exists */
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
    /* column exists */
  }

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN attachments TEXT");
  } catch {
    /* column exists */
  }

  try {
    rawDb.exec("ALTER TABLE it_tickets ADD COLUMN closed_at TEXT");
  } catch {
    /* column exists */
  }

  try {
    rawDb.exec(
      "UPDATE it_tickets SET closed_at = updated_at WHERE status = 'closed' AND (closed_at IS NULL OR TRIM(COALESCE(closed_at, '')) = '')"
    );
  } catch {
    /* ignore */
  }

  try {
    rawDb.exec("UPDATE users SET department = 'Production' WHERE department IS NULL OR TRIM(department) = ''");
  } catch {
    /* ignore */
  }

  try {
    rawDb.exec("ALTER TABLE courses ADD COLUMN resource_category TEXT");
  } catch {
    /* column already exists */
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

  // Admins manage every facility: grant all sites in user_facilities (navigation + legacy URLs).
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

  // Backfill facilities for existing users created before multi-facility support.
  // This keeps the rest of the app working even if `user_facilities` was empty.
  rawDb.exec(
    "INSERT OR IGNORE INTO user_facilities(user_id, business_unit) SELECT id, business_unit FROM users"
  );

  // One row per user from legacy users.department → user_departments (skip if already present).
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
  persist();
}

module.exports = { db, initDb, dbPath, isPostgres: false };
