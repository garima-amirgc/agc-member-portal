/**
 * Convert SQLite-style `?` placeholders to PostgreSQL `$1`, `$2`, ...
 */
function questionMarksToNumbered(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/**
 * SQLite → PostgreSQL statement tweaks (call while SQL still uses `?`).
 */
function rewriteSqliteToPostgres(sql) {
  let s = sql;

  s = s.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+user_facilities\s*\(\s*user_id\s*,\s*business_unit\s*\)\s*VALUES\s*\(\s*\?\s*,\s*\?\s*\)/gi,
    "INSERT INTO user_facilities (user_id, business_unit) VALUES ($1, $2) ON CONFLICT (user_id, business_unit) DO NOTHING"
  );
  s = s.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+user_departments\s*\(\s*user_id\s*,\s*department\s*\)\s*VALUES\s*\(\s*\?\s*,\s*\?\s*\)/gi,
    "INSERT INTO user_departments (user_id, department) VALUES ($1, $2) ON CONFLICT (user_id, department) DO NOTHING"
  );
  s = s.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+lesson_completions\s*\(\s*assignment_id\s*,\s*lesson_id\s*\)\s*VALUES\s*\(\s*\?\s*,\s*\?\s*\)/gi,
    "INSERT INTO lesson_completions (assignment_id, lesson_id) VALUES ($1, $2) ON CONFLICT (assignment_id, lesson_id) DO NOTHING"
  );
  s = s.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+assignments\s*\(\s*user_id\s*,\s*course_id\s*\)\s*VALUES\s*\(\s*\?\s*,\s*\?\s*\)/gi,
    "INSERT INTO assignments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING"
  );

  if (!/\$(\d+)/.test(s)) {
    s = questionMarksToNumbered(s);
  } else if (/\?/.test(s)) {
    let max = 0;
    const re = /\$(\d+)/g;
    let m;
    while ((m = re.exec(s)) !== null) max = Math.max(max, Number(m[1]));
    let n = max;
    s = s.replace(/\?/g, () => `$${++n}`);
  }

  s = s.replace(/\bIFNULL\s*\(/gi, "COALESCE(");
  s = s.replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, "NOW()");
  s = s.replace(/\bdatetime\s*\(\s*([a-zA-Z0-9_.]+)\s*\)/gi, "$1");
  s = s.replace(/\bORDER BY name COLLATE NOCASE ASC\b/gi, "ORDER BY LOWER(name) ASC");
  s = s.replace(/\bORDER BY c\.title COLLATE NOCASE ASC\b/gi, "ORDER BY LOWER(c.title) ASC");

  return s;
}

/** Tables with no SERIAL `id` — only composite UNIQUE; RETURNING id would error on PostgreSQL. */
function insertHasNoSerialId(sqlTrimmed) {
  return (
    /^\s*insert\s+into\s+user_facilities\b/i.test(sqlTrimmed) ||
    /^\s*insert\s+into\s+user_departments\b/i.test(sqlTrimmed) ||
    /^\s*insert\s+into\s+report_access_users\b/i.test(sqlTrimmed)
  );
}

function appendReturningIdIfInsert(sql) {
  const t = sql.trim();
  if (!/^\s*insert\s+into/i.test(t)) return sql;
  if (/\breturning\b/i.test(t)) return sql;
  if (insertHasNoSerialId(t)) return sql;
  return t.replace(/;?\s*$/i, "") + " RETURNING id";
}

module.exports = { questionMarksToNumbered, rewriteSqliteToPostgres, appendReturningIdIfInsert };
