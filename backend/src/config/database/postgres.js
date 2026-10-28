const { Pool, types } = require("pg");
const { rewriteSqliteToPostgres, appendReturningIdIfInsert } = require("./sqlDialect");

// `pg` returns NUMERIC/DECIMAL columns as strings by default, to avoid
// silently losing precision on values too big for a JS float. Every NUMERIC
// column this app actually reads today (ADP time-off balances/hours,
// equipment purchase cost) is well inside safe float range and every place
// that reads one already assumes a plain JS number (this bit us in
// production: `adp_time_off_balances` columns came back as strings, and
// `fmtDays()`'s `n.toFixed(1)` crashed the whole Team page — see
// PROJECT_NOTES.md, "Vacation / Time-Off" section, for the 2026-09-22 fix).
// SQLite (local dev, via better-sqlite3) already returns real numbers for
// these columns, so this just makes Postgres match — one fix here instead
// of coercing in every service/route that reads a balance or hours value.
// OID 1700 = numeric/decimal. Must run before any query executes, so it's
// set at module load, right after requiring `pg`.
types.setTypeParser(1700, (v) => (v == null ? null : parseFloat(v)));

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

-- One row per ADP time-off event notification (pending/approved/cancelled) a
-- manager hasn't dismissed yet — see adpTimeOffEvents.service.js. Drives the
-- "Team" sidebar badge and the "New time off requests" panel on the Team
-- time off board. adp_event_id is globally unique so re-polling ADP (or a
-- delete-from-queue failure leaving a message to be re-fetched) can never
-- insert the same event twice.
CREATE TABLE IF NOT EXISTS manager_timeoff_notifications (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adp_event_id TEXT NOT NULL UNIQUE,
  event_kind TEXT NOT NULL DEFAULT 'pending' CHECK(event_kind IN ('pending','approved','cancelled','other')),
  policy_name TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TEXT
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

CREATE TABLE IF NOT EXISTS adp_time_off_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_code TEXT,
  policy_name TEXT,
  entitlement NUMERIC,
  carried_over NUMERIC,
  used NUMERIC,
  scheduled NUMERIC,
  available NUMERIC,
  synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, policy_code)
);

CREATE TABLE IF NOT EXISTS adp_time_off_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adp_request_id TEXT NOT NULL,
  policy_code TEXT,
  policy_name TEXT,
  start_date TEXT,
  end_date TEXT,
  hours NUMERIC,
  status TEXT,
  synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, adp_request_id)
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
  facility TEXT,
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
  facility TEXT,
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
  facility TEXT,
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
  facility TEXT,
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
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  limit_one_response INTEGER NOT NULL DEFAULT 1,
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

CREATE TABLE IF NOT EXISTS ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES it_tickets(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_message_reads (
  ticket_id INTEGER NOT NULL REFERENCES it_tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ticket_id, user_id)
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
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS posted_by TEXT",
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
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_associate_oid TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_worker_id TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_job_title TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_department TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_work_phone TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_work_email TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_work_location TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_employment_type TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_employment_status TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_home_address TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_birth_date TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_hire_date TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_synced_at TEXT",
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS department TEXT",
    "ALTER TABLE facility_upcoming ADD COLUMN IF NOT EXISTS event_end_at TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_university_only INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_new_hire INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS new_hire_marked_at TIMESTAMPTZ",
    // Master Calendar delegated-edit access (SLT Tracker v2) — see the
    // matching comment in config/database/sqlite.js.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_edit_delegates TEXT",
    `CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      poll_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      start_at TEXT,
      end_at TEXT,
      banner_image_url TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      limit_one_response INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS start_at TEXT",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS end_at TEXT",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS banner_image_url TEXT",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS is_anonymous INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE polls ADD COLUMN IF NOT EXISTS limit_one_response INTEGER NOT NULL DEFAULT 1",
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
      facility TEXT,
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
    "ALTER TABLE employee_of_month ADD COLUMN IF NOT EXISTS facility TEXT",
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
    "ALTER TABLE leadership_updates ADD COLUMN IF NOT EXISTS facility TEXT",
    "ALTER TABLE leadership_updates ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'leadership_update'",
    "ALTER TABLE customer_wins ADD COLUMN IF NOT EXISTS facility TEXT",
    "ALTER TABLE community_involvement ADD COLUMN IF NOT EXISTS facility TEXT",
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
    `CREATE TABLE IF NOT EXISTS manager_timeoff_notifications (
      id SERIAL PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      adp_event_id TEXT NOT NULL UNIQUE,
      event_kind TEXT NOT NULL DEFAULT 'pending' CHECK(event_kind IN ('pending','approved','cancelled','other')),
      policy_name TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      dismissed_at TEXT
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
    // Native, in-portal CFO Incident Reports — replaces editing the
    // SharePoint Excel workbook by hand. Submitting requires the
    // incident_report_edit (or cfo) admin grant; viewing requires
    // incident_report_view, incident_report_edit, or cfo. See
    // cfoIncidents.service.js. The older SharePoint-Excel incident data
    // (cfoReports.service.js) is kept as read-only history alongside this.
    `CREATE TABLE IF NOT EXISTS cfo_incidents (
      id SERIAL PRIMARY KEY,
      facility TEXT NOT NULL CHECK(facility IN ('AQM','SCF','ASP')),
      department TEXT,
      incident_date TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'L1' CHECK(severity IN ('L1','L2','L3','L4')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
      description TEXT NOT NULL,
      financial_impact TEXT,
      root_cause TEXT,
      corrective_action TEXT,
      preventive_action TEXT,
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_at TEXT,
      attachments TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_cfo_incidents_facility ON cfo_incidents (facility)",
    "CREATE INDEX IF NOT EXISTS idx_cfo_incidents_status ON cfo_incidents (status)",
    // Added after the table already existed on deployed databases — the
    // CREATE TABLE IF NOT EXISTS above only takes effect on a brand-new
    // install, same as the it_tickets.attachments column elsewhere.
    "ALTER TABLE cfo_incidents ADD COLUMN IF NOT EXISTS attachments TEXT",
    // Native, in-portal SLT Report — replaces the two SharePoint Excel
    // workbooks (Action Tracker, Calendar) the SLT Tracker tab used to read
    // from. Three tables, one per record type the tab shows (action items,
    // calendar events, decisions); see sltItems.service.js for the
    // per-person "performance" roster computed from these at read time.
    // Viewing requires slt_view, slt_edit, or cfo; adding/updating/deleting
    // requires slt_edit or cfo.
    `CREATE TABLE IF NOT EXISTS slt_action_items (
      id SERIAL PRIMARY KEY,
      item TEXT NOT NULL,
      owner TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'NOT STARTED' CHECK(status IN ('NOT STARTED','ASSIGNED','IN PROGRESS','COMPLETED')),
      priority TEXT,
      category TEXT,
      next_action TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_action_items_owner ON slt_action_items (owner)",
    "CREATE INDEX IF NOT EXISTS idx_slt_action_items_status ON slt_action_items (status)",
    `CREATE TABLE IF NOT EXISTS slt_calendar_events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      owner TEXT NOT NULL,
      category TEXT,
      prep_deadline TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_calendar_events_date ON slt_calendar_events (event_date)",
    `CREATE TABLE IF NOT EXISTS slt_decisions (
      id SERIAL PRIMARY KEY,
      decision TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started','In Progress','Pending','Deferred','Completed')),
      workstream TEXT,
      decision_type TEXT,
      recommendation TEXT,
      source TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_decisions_assigned_to ON slt_decisions (assigned_to)",

    // SLT Tracker v2 — full rebuild per the Oct 2026 AGC SLT brief. See the
    // matching block in sqlite.js for the field-mapping rationale; this is
    // the same schema in Postgres types (SERIAL / TIMESTAMPTZ).
    `CREATE TABLE IF NOT EXISTS slt_import_batches (
      id SERIAL PRIMARY KEY,
      source_label TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      mode TEXT NOT NULL DEFAULT 'commit' CHECK(mode IN ('dry_run','commit')),
      summary_json TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS slt_import_raw_rows (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES slt_import_batches(id) ON DELETE CASCADE,
      sheet_name TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      formula_json TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      disposition TEXT NOT NULL DEFAULT 'pending_review'
        CHECK(disposition IN ('inserted','updated','unchanged','history_only','pending_review','skipped_template')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_import_raw_rows_batch ON slt_import_raw_rows (batch_id)",
    `CREATE TABLE IF NOT EXISTS slt_audit_log (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_audit_log_entity ON slt_audit_log (entity_type, entity_id)",
    `CREATE TABLE IF NOT EXISTS slt_links (
      id SERIAL PRIMARY KEY,
      from_type TEXT NOT NULL CHECK(from_type IN ('action','decision_queue','decision_register','commitment','calendar')),
      from_id INTEGER NOT NULL,
      to_type TEXT NOT NULL CHECK(to_type IN ('action','decision_queue','decision_register','commitment','calendar')),
      to_id INTEGER NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(from_type, from_id, to_type, to_id)
    )`,
    `CREATE TABLE IF NOT EXISTS slt_actions (
      id SERIAL PRIMARY KEY,
      legacy_item_id TEXT,
      item TEXT NOT NULL,
      category TEXT,
      owner TEXT NOT NULL,
      next_action TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Assigned',
      priority TEXT,
      flag TEXT,
      risk_impact TEXT,
      strategic_objective TEXT,
      escalation_required TEXT,
      financial_impact TEXT,
      asp_readiness_stream TEXT,
      blocker_waiting_on TEXT,
      notes TEXT,
      date_added TEXT,
      last_updated TEXT,
      immutable_key TEXT UNIQUE,
      active_record TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      attachments TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_actions_owner ON slt_actions (owner)",
    "CREATE INDEX IF NOT EXISTS idx_slt_actions_status ON slt_actions (status)",
    "CREATE INDEX IF NOT EXISTS idx_slt_actions_archived ON slt_actions (archived)",
    `CREATE TABLE IF NOT EXISTS slt_action_status_history (
      id SERIAL PRIMARY KEY,
      action_id INTEGER NOT NULL REFERENCES slt_actions(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      old_due_date TEXT,
      new_due_date TEXT,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_action_status_history_action ON slt_action_status_history (action_id)",
    `CREATE TABLE IF NOT EXISTS slt_decision_queue (
      id SERIAL PRIMARY KEY,
      legacy_decision_id TEXT,
      decision_required TEXT NOT NULL,
      workstream TEXT,
      assigned_to TEXT,
      decision_deadline TEXT,
      recommendation TEXT,
      status TEXT,
      decision_type TEXT,
      ceo_cfo_attention TEXT,
      financial_impact TEXT,
      risk_impact TEXT,
      strategic_objective TEXT,
      decision_date TEXT,
      further_action_required TEXT,
      context_input_required TEXT,
      owned_by TEXT,
      requested_by TEXT,
      date_raised TEXT,
      delay_impact_risk TEXT,
      blocker_waiting_on TEXT,
      notes TEXT,
      queue_immutable_key TEXT UNIQUE,
      active_record TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_decision_queue_assigned_to ON slt_decision_queue (assigned_to)",
    "CREATE INDEX IF NOT EXISTS idx_slt_decision_queue_archived ON slt_decision_queue (archived)",
    `CREATE TABLE IF NOT EXISTS slt_decision_register (
      id SERIAL PRIMARY KEY,
      legacy_decision_log_id TEXT,
      legacy_decision_id TEXT,
      source_decision_id TEXT,
      parent_decision_id INTEGER REFERENCES slt_decision_queue(id) ON DELETE SET NULL,
      link_status TEXT NOT NULL DEFAULT 'historical_no_parent'
        CHECK(link_status IN ('linked','unresolved','historical_no_parent')),
      decision_required TEXT NOT NULL,
      decision_summary TEXT,
      workstream TEXT,
      assigned_to TEXT,
      decision_deadline TEXT,
      recommendation TEXT,
      status TEXT,
      decision_type TEXT,
      ceo_cfo_attention TEXT,
      financial_impact TEXT,
      risk_impact TEXT,
      strategic_objective TEXT,
      decision_date TEXT,
      decision_maker TEXT,
      further_action_required TEXT,
      context_input_required TEXT,
      owned_by TEXT,
      requested_by TEXT,
      requester TEXT,
      date_raised TEXT,
      logged_date TEXT,
      delay_impact_risk TEXT,
      blocker_waiting_on TEXT,
      next_action TEXT,
      original_issue TEXT,
      rationale TEXT,
      follow_up_status TEXT,
      due_date TEXT,
      notes TEXT,
      queue_immutable_key TEXT,
      decision_log_immutable_key TEXT UNIQUE,
      queue_source_key TEXT,
      consistency_check TEXT,
      id_origin TEXT,
      id_check TEXT,
      active_record TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_decision_register_parent ON slt_decision_register (parent_decision_id)",
    "CREATE INDEX IF NOT EXISTS idx_slt_decision_register_follow_up ON slt_decision_register (follow_up_status)",
    "CREATE INDEX IF NOT EXISTS idx_slt_decision_register_archived ON slt_decision_register (archived)",
    `CREATE TABLE IF NOT EXISTS slt_commitments (
      id SERIAL PRIMARY KEY,
      legacy_id TEXT,
      commitment_deliverable TEXT NOT NULL,
      success_measure TEXT,
      owner TEXT NOT NULL,
      rag_status TEXT,
      status1_raw TEXT,
      date_record_entered TEXT,
      date_assigned TEXT,
      original_due TEXT,
      checkin_30_due TEXT,
      checkin_30_notes TEXT,
      checkin_60_due TEXT,
      checkin_60_notes TEXT,
      checkin_90_notes TEXT,
      extension_approved_by TEXT,
      ext_approval_date TEXT,
      revised_due TEXT,
      delivered_on TEXT,
      current_due TEXT,
      status2 TEXT NOT NULL DEFAULT 'Open',
      report_cue_raw TEXT,
      change_risk_next_step TEXT,
      extension_flagged INTEGER NOT NULL DEFAULT 0,
      immutable_key TEXT UNIQUE,
      archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_commitments_owner ON slt_commitments (owner)",
    "CREATE INDEX IF NOT EXISTS idx_slt_commitments_archived ON slt_commitments (archived)",
    `CREATE TABLE IF NOT EXISTS slt_commitment_checkins (
      id SERIAL PRIMARY KEY,
      commitment_id INTEGER NOT NULL REFERENCES slt_commitments(id) ON DELETE CASCADE,
      checkin_type TEXT NOT NULL CHECK(checkin_type IN ('30','60','90')),
      due_date TEXT,
      completed_at TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_commitment_checkins_commitment ON slt_commitment_checkins (commitment_id)",
    `CREATE TABLE IF NOT EXISTS slt_calendar (
      id SERIAL PRIMARY KEY,
      event_id TEXT UNIQUE,
      event_date_raw TEXT,
      is_text_date_range INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      start_time TEXT,
      end_time TEXT,
      event_title TEXT NOT NULL,
      category TEXT,
      executives TEXT,
      owner_lead TEXT,
      executive_action_required TEXT,
      status TEXT,
      risk TEXT,
      last_reviewed_date TEXT,
      digital_calendar_eligible INTEGER NOT NULL DEFAULT 0,
      calendar_entry_title TEXT,
      deferred_return_date TEXT,
      prep_after_event_flag INTEGER NOT NULL DEFAULT 0,
      immutable_key TEXT UNIQUE,
      archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_slt_calendar_start_date ON slt_calendar (start_date)",
    "CREATE INDEX IF NOT EXISTS idx_slt_calendar_archived ON slt_calendar (archived)",
    // Month, Prep Start Date, Prep Deadline, Materials Needed, Notes — never
    // exposed on the Add/Edit event form (see CALENDAR_FIELDS in
    // SltTrackerV2.jsx), only ever populated by the one-time source-workbook
    // import. Explicit request to remove them for good, not just hide them —
    // "remove the fields permanently that are not in use" — since the full
    // original data still exists in the source workbook file itself.
    "ALTER TABLE slt_calendar DROP COLUMN IF EXISTS month_raw",
    "ALTER TABLE slt_calendar DROP COLUMN IF EXISTS prep_start_date",
    "ALTER TABLE slt_calendar DROP COLUMN IF EXISTS prep_deadline",
    "ALTER TABLE slt_calendar DROP COLUMN IF EXISTS materials_needed",
    "ALTER TABLE slt_calendar DROP COLUMN IF EXISTS notes",

    "CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users (manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons (course_id)",
    "CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments (course_id)",
    "CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests (employee_id)",
    "CREATE INDEX IF NOT EXISTS idx_leave_requests_manager_id ON leave_requests (manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_adp_time_off_balances_user_id ON adp_time_off_balances (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_adp_time_off_requests_user_id ON adp_time_off_requests (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_adp_time_off_requests_dates ON adp_time_off_requests (start_date, end_date)",
    "CREATE INDEX IF NOT EXISTS idx_it_tickets_user_id ON it_tickets (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_it_tickets_assignee_id ON it_tickets (assignee_id)",
    "CREATE INDEX IF NOT EXISTS idx_company_content_items_section ON company_content_items (section)",
    "CREATE INDEX IF NOT EXISTS idx_manager_notifications_manager_id ON manager_notifications (manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_manager_all_training_alerts_manager_id ON manager_all_training_alerts (manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_manager_timeoff_notifications_manager_id ON manager_timeoff_notifications (manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_resource_documents_business_unit_category ON resource_documents (business_unit, category)",
    `CREATE TABLE IF NOT EXISTS ticket_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES it_tickets(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages (ticket_id)",
    `CREATE TABLE IF NOT EXISTS ticket_message_reads (
      ticket_id INTEGER NOT NULL REFERENCES it_tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ticket_id, user_id)
    )`,
    "ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL",
    "ALTER TABLE social_events ADD COLUMN IF NOT EXISTS video_url TEXT",
    "ALTER TABLE social_winners ADD COLUMN IF NOT EXISTS tier TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS adp_reports_to_oid TEXT",
    // University topic/tab feature
    "ALTER TABLE courses ADD COLUMN IF NOT EXISTS topic TEXT",
    "ALTER TABLE resource_documents ADD COLUMN IF NOT EXISTS topic TEXT",
    // New-hire training assignment feature
    `CREATE TABLE IF NOT EXISTS department_training_templates (
      id SERIAL PRIMARY KEY,
      department TEXT NOT NULL,
      resource_kind TEXT NOT NULL CHECK(resource_kind IN ('course','document')),
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES resource_documents(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_dept_training_dept ON department_training_templates (department)",
    `CREATE TABLE IF NOT EXISTS user_training_assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_kind TEXT NOT NULL CHECK(resource_kind IN ('course','document')),
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES resource_documents(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
      assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(user_id, resource_kind, course_id, document_id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_user_training_user ON user_training_assignments (user_id)",
    `CREATE TABLE IF NOT EXISTS resource_topic_orders (
      id SERIAL PRIMARY KEY,
      facility TEXT NOT NULL,
      category TEXT NOT NULL,
      tab_order TEXT NOT NULL DEFAULT '[]',
      UNIQUE(facility, category)
    )`,
    `CREATE TABLE IF NOT EXISTS social_events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      event_date TEXT,
      description TEXT,
      image_url TEXT,
      video_url TEXT,
      business_units TEXT DEFAULT '["AGC"]',
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS social_winners (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      award TEXT,
      event_name TEXT,
      social_event_id INTEGER REFERENCES social_events(id) ON DELETE SET NULL,
      image_url TEXT,
      business_unit TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS social_event_images (
      id SERIAL PRIMARY KEY,
      social_event_id INTEGER NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    // Customer inquiry workflow (public-facing form → FSQA → Management)
    `CREATE TABLE IF NOT EXISTS customer_inquiries (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_company TEXT,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      inquiry_type TEXT NOT NULL DEFAULT 'general',
      product TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      incident_date TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      fsqa_comment TEXT,
      fsqa_reviewer TEXT,
      fsqa_reviewed_at TIMESTAMPTZ,
      management_comment TEXT,
      management_reviewer TEXT,
      management_reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_customer_inquiries_status ON customer_inquiries (status)",
    "CREATE INDEX IF NOT EXISTS idx_customer_inquiries_created_at ON customer_inquiries (created_at)",
    `CREATE TABLE IF NOT EXISTS hr_newsfeed (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      image_url TEXT,
      facilities TEXT,
      department TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    // Asset tracker — company equipment inventory
    `CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      asset_tag TEXT UNIQUE,
      category TEXT NOT NULL DEFAULT 'Other',
      business_unit TEXT NOT NULL CHECK(business_unit IN ('AGC','AQM','SCF','ASP')),
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','assigned','maintenance','retired')),
      condition TEXT NOT NULL DEFAULT 'good' CHECK(condition IN ('new','good','fair','poor')),
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      serial_number TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_cost NUMERIC,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets (assigned_to)",
    "CREATE INDEX IF NOT EXISTS idx_assets_business_unit ON assets (business_unit)",
    // New Product Development (NPD) workflow — restricted-access module.
    `CREATE TABLE IF NOT EXISTS npd_requests (
      id SERIAL PRIMARY KEY,
      request_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_number TEXT,
      product_name TEXT NOT NULL,
      product_description TEXT,
      sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      plant TEXT,
      requested_launch_date TEXT,
      estimated_volume TEXT,
      packaging_requirement TEXT,
      request_type TEXT NOT NULL DEFAULT 'new_product' CHECK(request_type IN ('new_product','existing_product_modification')),
      customer_contact TEXT,
      general_comments TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
        'draft','submitted','waiting_approval','in_progress','changes_requested',
        'rejected','customer_rejected','authorized_for_production','completed','cancelled','on_hold'
      )),
      current_step INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS npd_steps (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      step_name TEXT NOT NULL,
      responsible_department TEXT,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'locked' CHECK(status IN (
        'locked','not_started','in_progress','submitted','waiting_approval',
        'approved','rejected','changes_requested','completed'
      )),
      data_json TEXT,
      due_date TEXT,
      started_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      UNIQUE(request_id, step_number)
    )`,
    `CREATE TABLE IF NOT EXISTS npd_approvals (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES npd_steps(id) ON DELETE CASCADE,
      approval_type TEXT NOT NULL,
      approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approver_name TEXT,
      action TEXT NOT NULL CHECK(action IN ('submitted','approved','rejected','changes_requested','authorized')),
      comments TEXT,
      action_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS npd_attachments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES npd_steps(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_type TEXT,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS npd_comments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES npd_steps(id) ON DELETE SET NULL,
      comment TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS npd_activity_log (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES npd_steps(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT,
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS npd_access_users (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    // Separate, narrower allowlist for who can delete a request — full
    // admins can always delete; anyone else needs to be listed here.
    `CREATE TABLE IF NOT EXISTS npd_delete_access_users (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    // Soft-delete columns — a deleted request drops off the list but the
    // row (and its full activity/approval/attachment history) stays put.
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS deleted_by INTEGER",
    // Gate 1 launch scorecard — economics + qualitative scoring captured at
    // step 1 ("Create New Product Request") so Management Approval (step 2)
    // has an objective weighted score/priority to act on instead of a bare
    // yes/no. All additive/nullable: requests created before this column
    // migration just show as "not yet scored" until edited. NUMERIC columns
    // come back as real JS numbers already — see the setTypeParser(1700,...)
    // note at the top of this file. volume_score, revenue_score,
    // gp_dollar_score, gp_percent_score, weighted_score and priority_tier
    // are never trusted from the client — npdScoring.js recomputes them
    // server-side on every create/update.
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS annual_volume_kg NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS annual_gp_dollars NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS gp_percent NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS strategic_fit_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS customer_market_value_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS complexity_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS speed_to_market_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS volume_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS revenue_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS gp_dollar_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS gp_percent_score INTEGER",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS weighted_score NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS priority_tier TEXT",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS capex_required NUMERIC",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS customer_commitment TEXT",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS key_strategic_rationale TEXT",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS key_risks_comments TEXT",
    // Channel and Start Date — two more Launch Scorecard workbook columns
    // (confirmed against the real sheet data on 2026-10-21), added alongside
    // Plant/Target Launch Date in the unified Gate 1 form. Additive/nullable,
    // same pattern as above.
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS channel TEXT",
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS start_date TEXT",
    // "SLT Decision" — the workbook's own "Decision" column (free text in the
    // sheet, no dropdown there either; real values seen: SLT Approved, Hold,
    // Hold need more details). Additive/nullable, same pattern as above.
    "ALTER TABLE npd_requests ADD COLUMN IF NOT EXISTS decision TEXT",
    `CREATE TABLE IF NOT EXISTS npd_approver_config (
      id SERIAL PRIMARY KEY,
      approval_type TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(approval_type, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS npd_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id INTEGER NOT NULL REFERENCES npd_requests(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES npd_steps(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'task_assigned' CHECK(kind IN (
        'task_assigned','approval_needed','step_completed','request_rejected',
        'changes_requested','request_completed'
      )),
      title TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','dismissed')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      dismissed_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS npd_step_assignees (
      step_key TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (step_key, user_id)
    )`,
    // "Skip for now" — tracked alongside status (not as a new status value)
    // so this stays a plain additive column, no CHECK-constraint rebuild. A
    // step is "skipped" whenever skipped_at is set and completed_at isn't;
    // the service layer folds that into a display_status for the UI.
    "ALTER TABLE npd_steps ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ",
    "ALTER TABLE npd_steps ADD COLUMN IF NOT EXISTS skipped_by INTEGER",
    "ALTER TABLE npd_steps ADD COLUMN IF NOT EXISTS skip_reason TEXT",
    "CREATE INDEX IF NOT EXISTS idx_npd_requests_status ON npd_requests (status)",
    "CREATE INDEX IF NOT EXISTS idx_npd_requests_created_by ON npd_requests (created_by)",
    "CREATE INDEX IF NOT EXISTS idx_npd_steps_request ON npd_steps (request_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_steps_assigned_to ON npd_steps (assigned_to)",
    "CREATE INDEX IF NOT EXISTS idx_npd_approvals_request ON npd_approvals (request_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_approvals_step ON npd_approvals (step_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_attachments_request ON npd_attachments (request_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_comments_request ON npd_comments (request_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_activity_log_request ON npd_activity_log (request_id)",
    "CREATE INDEX IF NOT EXISTS idx_npd_approver_config_type ON npd_approver_config (approval_type)",
    "CREATE INDEX IF NOT EXISTS idx_npd_notifications_user ON npd_notifications (user_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_npd_step_assignees_key ON npd_step_assignees (step_key)",
    // Master Calendar email subscription — one admin-configured row (always
    // id=1) controlling an automatic "send the whole calendar as an Excel
    // attachment" digest email. See sltCalendar.service.js's
    // getCalendarSubscriptionSettings/updateCalendarSubscriptionSettings/
    // checkAndRunScheduledCalendarDigest. recipient_emails is a JSON array
    // of strings, only read when recipient_mode = 'custom'. last_sent_period
    // (e.g. "2026-10-28" for daily/weekly, "2026-10" for monthly) is what
    // keeps the scheduler from sending the same period's digest twice, not
    // a raw timestamp comparison.
    `CREATE TABLE IF NOT EXISTS slt_calendar_subscription (
      id SERIAL PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly','monthly')),
      day_of_week INTEGER NOT NULL DEFAULT 1,
      day_of_month INTEGER NOT NULL DEFAULT 1,
      send_hour INTEGER NOT NULL DEFAULT 7,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      recipient_mode TEXT NOT NULL DEFAULT 'calendar_access' CHECK(recipient_mode IN ('calendar_access','custom')),
      recipient_emails TEXT NOT NULL DEFAULT '[]',
      last_sent_period TEXT,
      last_sent_at TIMESTAMPTZ,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    const { clearBackfilledJoinDates } = require("../../services/profileCelebrationBackfill.service");
    const stats = await clearBackfilledJoinDates(db);
    if (stats.cleared > 0) {
      console.log(`[pg migrate] cleared auto-filled join dates: cleared=${stats.cleared}`);
    }
  } catch (e) {
    console.warn("[pg migrate] profile join-date cleanup:", e.message);
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
    // A corporate firewall/VPN/router that silently drops a TCP connection
    // once it's sat idle for a while is one of the most common causes of a
    // "read ECONNRESET" on a long-lived DB connection like this one — the
    // app has no way to know the connection is dead until it tries to use
    // it again. TCP keepalive pings the connection periodically so the OS
    // notices and recovers a dropped path well before the app tries to
    // read/write on it, instead of only finding out via a reset mid-query.
    // This doesn't fix a hard network block, but it's the standard
    // mitigation for the "worked, then silently died while idle" pattern.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // node-postgres's own docs: a Pool (and any client it manages) MUST have
  // an 'error' listener, or an error with zero listeners (a dropped/reset
  // connection to an idle pooled client, a network blip, etc.) throws
  // straight through Node's EventEmitter and kills the whole process —
  // bypassing try/catch and even the top-level start().catch() below,
  // since it's a synchronous throw, not a rejected promise. This was
  // exactly what crashed local `npm run dev` on a transient ECONNRESET
  // talking to the remote Postgres host — every DB hiccup took the entire
  // backend down instead of just that one connection.
  pool.on("error", (err) => {
    console.error("[DB] Unexpected error on an idle Postgres client (connection recovered, server stays up):", err?.message || err);
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
    const { migrateLegacyUpcomingGrantKey } = require("../../config/adminGrants");
    await migrateLegacyUpcomingGrantKey(db);

    // One-time default for the Management Approval step (stands in for
    // Adam/Tony/Tom from the spec until an NPD admin configures real
    // approvers). Only seeds while the list is still empty, so it never
    // overwrites changes made later via Manage access & approvers.
    try {
      const cntRow = await db
        .prepare("SELECT COUNT(*) AS c FROM npd_approver_config WHERE approval_type = 'management_approval'")
        .get();
      if (!Number(cntRow?.c ?? 0)) {
        const defaultEmails = ["garima.singh@amirgc.com", "syed.afroz@amirgc.com"];
        let order = 0;
        for (const email of defaultEmails) {
          const u = await db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
          if (u) {
            await db
              .prepare("INSERT INTO npd_approver_config (approval_type, user_id, sort_order) VALUES (?, ?, ?)")
              .run("management_approval", u.id, order++);
          } else {
            console.warn(`[db] npd management_approval seed: no user found for ${email}`);
          }
        }
      }
    } catch (e) {
      console.error("[db] npd_approver_config seed:", e.message || e);
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
