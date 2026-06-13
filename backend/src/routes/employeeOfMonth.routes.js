const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");

const router = express.Router();

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TABLE = "employee_of_month";
const MONTH_ORDER = "e.year DESC, e.month DESC, e.sort_order ASC, e.id DESC";
const PERIOD_ORDER = "sort_order ASC, created_at DESC, id DESC";

const SELECT_WITH_USER = `
  SELECT
    e.id,
    e.user_id,
    e.manual_name,
    e.year,
    e.month,
    e.citation,
    e.image_url,
    e.published,
    e.sort_order,
    e.created_by,
    e.created_at,
    e.updated_at,
    u.name AS employee_name,
    u.email AS employee_email,
    u.designation AS employee_designation,
    u.department AS employee_department,
    u.business_unit AS employee_business_unit,
    u.profile_image_url AS employee_profile_image_url
  FROM employee_of_month e
  LEFT JOIN users u ON u.id = e.user_id
`;

function shapeRow(row) {
  if (!row) return null;
  const month = Number(row.month);
  const year = Number(row.year);
  const manualName = row.manual_name != null ? String(row.manual_name).trim() : "";
  const linkedName = row.employee_name != null ? String(row.employee_name).trim() : "";
  const displayName = manualName || linkedName;
  return {
    id: row.id,
    user_id: row.user_id,
    manual_name: manualName,
    is_manual: !row.user_id && !!manualName,
    year,
    month,
    period_label: Number.isFinite(month) && month >= 1 && month <= 12 ? `${MONTH_NAMES[month - 1]} ${year}` : `${year}`,
    citation: row.citation != null ? String(row.citation) : "",
    image_url: row.image_url != null ? String(row.image_url) : "",
    published: Number(row.published) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    employee: {
      id: row.user_id || null,
      name: displayName,
      email: row.user_id ? row.employee_email : "",
      designation: row.user_id ? row.employee_designation : "",
      department: row.user_id ? row.employee_department : "",
      business_unit: row.user_id ? row.employee_business_unit : "",
      profile_image_url: row.user_id ? row.employee_profile_image_url : "",
    },
  };
}

function parseImageUrl(body) {
  if (body?.image_url === null || body?.image_url === "") return null;
  if (body?.image_url == null) return undefined;
  const url = String(body.image_url).trim();
  return url || null;
}

function parseYearMonth(body) {
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Year must be between 2000 and 2100." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Month must be between 1 and 12." };
  }
  return { year, month };
}

function parseEmployee(body) {
  const manualName = body?.manual_name != null ? String(body.manual_name).trim() : "";
  const rawUserId = body?.user_id;
  const rawUserIdText = rawUserId == null ? "" : String(rawUserId).trim().toLowerCase();

  if (manualName || rawUserIdText === "other" || rawUserIdText === "manual") {
    if (!manualName) return { error: "Please enter the employee name." };
    return { user_id: null, manual_name: manualName };
  }

  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId < 1) {
    return { error: "Please select an employee or choose Other to enter a name." };
  }
  return { user_id: userId, manual_name: null };
}

async function findDuplicateEntry({ year, month, userId, manualName, excludeId = null }) {
  if (userId) {
    const sql =
      excludeId != null
        ? "SELECT id FROM employee_of_month WHERE year = ? AND month = ? AND user_id = ? AND id <> ?"
        : "SELECT id FROM employee_of_month WHERE year = ? AND month = ? AND user_id = ?";
    const params =
      excludeId != null ? [year, month, userId, excludeId] : [year, month, userId];
    return db.prepare(sql).get(...params);
  }

  const normalized = String(manualName || "").trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .prepare(
      excludeId != null
        ? `SELECT id, manual_name FROM employee_of_month
           WHERE year = ? AND month = ? AND user_id IS NULL AND id <> ?`
        : `SELECT id, manual_name FROM employee_of_month
           WHERE year = ? AND month = ? AND user_id IS NULL`
    )
    .all(...(excludeId != null ? [year, month, excludeId] : [year, month]));
  return rows.find((row) => String(row.manual_name || "").trim().toLowerCase() === normalized) || null;
}

async function nextSortOrderForMonth(year, month) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${TABLE} WHERE year = ? AND month = ?`)
    .get(year, month);
  return Number(row?.m || 0) + 1;
}

async function moveEmployeeOfMonthEntry(id, direction) {
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    const err = new Error("Invalid id.");
    err.statusCode = 400;
    throw err;
  }
  const dir = String(direction || "").trim().toLowerCase();
  if (dir !== "up" && dir !== "down") {
    const err = new Error('Direction must be "up" or "down".');
    err.statusCode = 400;
    throw err;
  }

  const entry = await db.prepare(`SELECT id, year, month FROM ${TABLE} WHERE id = ?`).get(entryId);
  if (!entry) {
    const err = new Error("Entry not found.");
    err.statusCode = 404;
    throw err;
  }

  const rows = await db
    .prepare(`SELECT id, sort_order FROM ${TABLE} WHERE year = ? AND month = ? ORDER BY ${PERIOD_ORDER}`)
    .all(entry.year, entry.month);
  const idx = rows.findIndex((r) => Number(r.id) === entryId);
  if (idx < 0) {
    const err = new Error("Entry not found.");
    err.statusCode = 404;
    throw err;
  }

  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const a = rows[idx];
  const b = rows[swapIdx];
  const aOrder = Number(a.sort_order) || 0;
  const bOrder = Number(b.sort_order) || 0;
  const now = new Date().toISOString();

  await db.prepare(`UPDATE ${TABLE} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(bOrder, now, a.id);
  await db.prepare(`UPDATE ${TABLE} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(aOrder, now, b.id);
}

/** Current calendar month if published, otherwise latest published month on or before today. */
async function resolveFeaturedPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let row = await db
    .prepare(
      `SELECT year, month FROM employee_of_month
       WHERE published = 1 AND year = ? AND month = ?
       LIMIT 1`
    )
    .get(year, month);

  if (row) return { year: Number(row.year), month: Number(row.month) };

  row = await db
    .prepare(
      `SELECT year, month FROM employee_of_month
       WHERE published = 1
         AND (year < ? OR (year = ? AND month <= ?))
       ORDER BY year DESC, month DESC
       LIMIT 1`
    )
    .get(year, year, month);

  if (row) return { year: Number(row.year), month: Number(row.month) };

  row = await db
    .prepare(
      `SELECT year, month FROM employee_of_month
       WHERE published = 1
       ORDER BY year DESC, month DESC
       LIMIT 1`
    )
    .get();

  if (!row) return null;
  return { year: Number(row.year), month: Number(row.month) };
}

/** Home page: all published winners for the featured month (slider when more than one). */
router.get("/current", authRequired, async (_req, res) => {
  try {
    const period = await resolveFeaturedPeriod();
    if (!period) return res.json([]);

    const rows = await db
      .prepare(
        `${SELECT_WITH_USER}
         WHERE e.published = 1 AND e.year = ? AND e.month = ?
         ORDER BY e.sort_order ASC, e.id ASC`
      )
      .all(period.year, period.month);

    return res.json(rows.map(shapeRow).filter((row) => row?.employee?.name));
  } catch (e) {
    console.error("[employee-of-month] current:", e);
    return res.status(500).json({ message: "Could not load Employee of the Month." });
  }
});

/** Past winners only — excludes the month currently featured on the home page. */
router.get("/history", authRequired, async (_req, res) => {
  try {
    const period = await resolveFeaturedPeriod();
    let rows;
    if (period) {
      rows = await db
        .prepare(
          `${SELECT_WITH_USER}
           WHERE e.published = 1
             AND NOT (e.year = ? AND e.month = ?)
           ORDER BY e.year DESC, e.month DESC, e.sort_order ASC, e.id DESC`
        )
        .all(period.year, period.month);
    } else {
      rows = await db
        .prepare(
          `${SELECT_WITH_USER}
           WHERE e.published = 1
           ORDER BY e.year DESC, e.month DESC, e.sort_order ASC, e.id DESC`
        )
        .all();
    }
    return res.json(rows.map(shapeRow).filter((row) => row?.employee?.name));
  } catch (e) {
    console.error("[employee-of-month] history:", e);
    return res.status(500).json({ message: "Could not load Employee of the Month history." });
  }
});

router.get("/user-picker", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT id, name, email, designation, department, business_unit
         FROM users
         ORDER BY name ASC`
      )
      .all();
    return res.json(rows);
  } catch (e) {
    console.error("[employee-of-month] user-picker:", e);
    return res.status(500).json({ message: "Could not load employees." });
  }
});

router.get("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (_req, res) => {
  try {
    const rows = await db
      .prepare(`${SELECT_WITH_USER} ORDER BY ${MONTH_ORDER}`)
      .all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    console.error("[employee-of-month] list:", e);
    return res.status(500).json({ message: "Could not load entries." });
  }
});

router.post("/:id/move", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    await moveEmployeeOfMonthEntry(req.params.id, req.body?.direction);
    const rows = await db.prepare(`${SELECT_WITH_USER} ORDER BY ${MONTH_ORDER}`).all();
    return res.json(rows.map(shapeRow));
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error("[employee-of-month] move:", e);
    return res.status(code).json({ message: e.message || "Could not reorder entry." });
  }
});

router.post("/", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const employee = parseEmployee(req.body);
    if (employee.error) return res.status(400).json({ message: employee.error });

    const ym = parseYearMonth(req.body);
    if (ym.error) return res.status(400).json({ message: ym.error });

    if (employee.user_id) {
      const user = await db.prepare("SELECT id FROM users WHERE id = ?").get(employee.user_id);
      if (!user) return res.status(400).json({ message: "Selected employee was not found." });
    }

    const duplicate = await findDuplicateEntry({
      year: ym.year,
      month: ym.month,
      userId: employee.user_id,
      manualName: employee.manual_name,
    });
    if (duplicate) {
      return res.status(400).json({ message: "That employee is already listed for that month." });
    }

    const citation = req.body?.citation != null ? String(req.body.citation).trim() : "";
    const imageUrl = parseImageUrl(req.body);
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const sortOrder = await nextSortOrderForMonth(ym.year, ym.month);
    const now = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO ${TABLE} (user_id, manual_name, year, month, citation, image_url, published, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        employee.user_id,
        employee.manual_name,
        ym.year,
        ym.month,
        citation || null,
        imageUrl ?? null,
        published,
        sortOrder,
        req.user.id,
        now,
        now
      );

    const row = await db
      .prepare(`${SELECT_WITH_USER} WHERE e.id = ?`)
      .get(result.lastInsertRowid);
    return res.status(201).json(shapeRow(row));
  } catch (e) {
    console.error("[employee-of-month] create:", e);
    return res.status(500).json({ message: "Could not save Employee of the Month." });
  }
});

router.put("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });

    const existing = await db.prepare("SELECT * FROM employee_of_month WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ message: "Entry not found." });

    const employee = parseEmployee(req.body);
    if (employee.error) return res.status(400).json({ message: employee.error });

    const ym = parseYearMonth(req.body);
    if (ym.error) return res.status(400).json({ message: ym.error });

    if (employee.user_id) {
      const user = await db.prepare("SELECT id FROM users WHERE id = ?").get(employee.user_id);
      if (!user) return res.status(400).json({ message: "Selected employee was not found." });
    }

    const duplicate = await findDuplicateEntry({
      year: ym.year,
      month: ym.month,
      userId: employee.user_id,
      manualName: employee.manual_name,
      excludeId: id,
    });
    if (duplicate) {
      return res.status(400).json({ message: "That employee is already listed for that month." });
    }

    const citation = req.body?.citation != null ? String(req.body.citation).trim() : "";
    const imageUrl = parseImageUrl(req.body);
    const published = req.body?.published === false || req.body?.published === 0 ? 0 : 1;
    const now = new Date().toISOString();

    const nextImageUrl = imageUrl !== undefined ? imageUrl : existing.image_url;

    await db
      .prepare(
        `UPDATE employee_of_month
         SET user_id = ?, manual_name = ?, year = ?, month = ?, citation = ?, image_url = ?, published = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        employee.user_id,
        employee.manual_name,
        ym.year,
        ym.month,
        citation || null,
        nextImageUrl || null,
        published,
        now,
        id
      );

    const row = await db.prepare(`${SELECT_WITH_USER} WHERE e.id = ?`).get(id);
    return res.json(shapeRow(row));
  } catch (e) {
    console.error("[employee-of-month] update:", e);
    return res.status(500).json({ message: "Could not update entry." });
  }
});

router.delete("/:id", authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.UPCOMING), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid id." });
    const existing = await db.prepare("SELECT id FROM employee_of_month WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ message: "Entry not found." });
    await db.prepare("DELETE FROM employee_of_month WHERE id = ?").run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[employee-of-month] delete:", e);
    return res.status(500).json({ message: "Could not delete entry." });
  }
});

module.exports = router;
