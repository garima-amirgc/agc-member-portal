const express = require("express");
const { db, isPostgres, getPool } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");

const router = express.Router();

function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampLen(s, max) {
  const out = String(s ?? "").trim();
  return out.length > max ? out.slice(0, max) : out;
}

function normalizeKind(k) {
  const v = String(k || "").trim().toLowerCase();
  if (v === "activity") return "activity";
  if (v === "other" || v === "others") return "other";
  return "holiday";
}

function normalizeColor(c) {
  const v = String(c || "").trim();
  if (!v) return null;
  // allow hex, rgb(), or any css color string — UI will use it as-is.
  if (v.length > 64) return null;
  return v;
}

function rowToDto(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    title: String(r.title || ""),
    kind: String(r.kind || "holiday"),
    start_date: String(r.start_date || ""),
    end_date: r.end_date != null && String(r.end_date).trim() ? String(r.end_date).trim() : null,
    color: r.color != null && String(r.color).trim() ? String(r.color).trim() : null,
    notes: r.notes != null && String(r.notes).trim() ? String(r.notes).trim() : "",
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  };
}

function validateCreate(body) {
  const title = clampLen(body?.title, 180);
  if (!title) return { error: "title is required" };
  const kind = normalizeKind(body?.kind);
  const start_date = String(body?.start_date || "").trim();
  const end_dateRaw = String(body?.end_date || "").trim();
  const end_date = end_dateRaw ? end_dateRaw : null;
  if (!isYmd(start_date)) return { error: "start_date must be YYYY-MM-DD" };
  if (end_date && !isYmd(end_date)) return { error: "end_date must be YYYY-MM-DD" };
  if (end_date && end_date < start_date) return { error: "end_date must be on/after start_date" };
  const color = normalizeColor(body?.color);
  const notes = clampLen(body?.notes, 2000);
  return { value: { title, kind, start_date, end_date, color, notes } };
}

function validateUpdate(body) {
  const patch = {};
  if ("title" in (body || {})) {
    const t = clampLen(body?.title, 180);
    if (!t) return { error: "title cannot be empty" };
    patch.title = t;
  }
  if ("kind" in (body || {})) patch.kind = normalizeKind(body?.kind);
  if ("start_date" in (body || {})) {
    const s = String(body?.start_date || "").trim();
    if (!isYmd(s)) return { error: "start_date must be YYYY-MM-DD" };
    patch.start_date = s;
  }
  if ("end_date" in (body || {})) {
    const e = String(body?.end_date || "").trim();
    if (!e) patch.end_date = null;
    else {
      if (!isYmd(e)) return { error: "end_date must be YYYY-MM-DD" };
      patch.end_date = e;
    }
  }
  if ("color" in (body || {})) patch.color = normalizeColor(body?.color);
  if ("notes" in (body || {})) patch.notes = clampLen(body?.notes, 2000);
  return { value: patch };
}

/**
 * List events in a date window. Inclusive bounds.
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD
 */
router.get("/events", authRequired, async (req, res) => {
  const from = String(req.query?.from || "").trim();
  const to = String(req.query?.to || "").trim();
  if (!isYmd(from) || !isYmd(to)) {
    return res.status(400).json({ message: "from and to are required (YYYY-MM-DD)" });
  }
  if (to < from) return res.status(400).json({ message: "to must be on/after from" });

  try {
    let rows = [];
    if (isPostgres) {
      const pool = getPool();
      const r = await pool.query(
        `
        SELECT id, title, kind, start_date, end_date, color, notes, created_at, updated_at
        FROM calendar_events
        WHERE start_date <= $2 AND COALESCE(end_date, start_date) >= $1
        ORDER BY start_date ASC, id ASC
        `,
        [from, to]
      );
      rows = r.rows || [];
    } else {
      rows = await db
        .prepare(
          `
          SELECT id, title, kind, start_date, end_date, color, notes, created_at, updated_at
          FROM calendar_events
          WHERE start_date <= ? AND COALESCE(end_date, start_date) >= ?
          ORDER BY start_date ASC, id ASC
          `
        )
        .all(to, from);
    }
    return res.json({ events: rows.map(rowToDto) });
  } catch (e) {
    console.error("calendar GET /events:", e);
    return res.status(500).json({ message: "Could not load calendar events" });
  }
});

/** Create event (admin). */
router.post(
  "/events",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR),
  async (req, res) => {
    const v = validateCreate(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    const { title, kind, start_date, end_date, color, notes } = v.value;

    try {
      if (isPostgres) {
        const pool = getPool();
        const r = await pool.query(
          `
          INSERT INTO calendar_events (title, kind, start_date, end_date, color, notes, created_by, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
          RETURNING id, title, kind, start_date, end_date, color, notes, created_at, updated_at
          `,
          [title, kind, start_date, end_date, color, notes, req.user?.id || null]
        );
        return res.status(201).json(rowToDto(r.rows[0]));
      }

      const nowIso = new Date().toISOString();
      const out = await db
        .prepare(
          `
          INSERT INTO calendar_events (title, kind, start_date, end_date, color, notes, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(title, kind, start_date, end_date, color, notes, req.user?.id || null, nowIso, nowIso);
      const row = await db
        .prepare(
          `SELECT id, title, kind, start_date, end_date, color, notes, created_at, updated_at FROM calendar_events WHERE id = ?`
        )
        .get(Number(out.lastInsertRowid));
      return res.status(201).json(rowToDto(row));
    } catch (e) {
      console.error("calendar POST /events:", e);
      return res.status(500).json({ message: e.message || "Could not create event" });
    }
  }
);

/** Update event (admin). */
router.put(
  "/events/:id",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });

    const v = validateUpdate(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    const patch = v.value;
    if (!patch || Object.keys(patch).length === 0) return res.json({ ok: true });

    // date consistency if both present in patch (or only one; fetch row for other).
    try {
      let existing;
      if (isPostgres) {
        const pool = getPool();
        const r0 = await pool.query(
          `SELECT id, start_date, end_date FROM calendar_events WHERE id = $1`,
          [id]
        );
        existing = r0.rows[0];
      } else {
        existing = await db.prepare(`SELECT id, start_date, end_date FROM calendar_events WHERE id = ?`).get(id);
      }
      if (!existing) return res.status(404).json({ message: "Not found" });

      const nextStart = patch.start_date ?? String(existing.start_date);
      const nextEnd =
        "end_date" in patch ? patch.end_date : existing.end_date != null ? String(existing.end_date) : null;
      if (nextEnd && nextEnd < nextStart) {
        return res.status(400).json({ message: "end_date must be on/after start_date" });
      }

      if (isPostgres) {
        const pool = getPool();
        const fields = [];
        const vals = [];
        let idx = 1;
        for (const [k, v] of Object.entries(patch)) {
          fields.push(`${k} = $${idx++}`);
          vals.push(v);
        }
        fields.push(`updated_at = NOW()`);
        vals.push(id);
        const r = await pool.query(
          `UPDATE calendar_events SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, title, kind, start_date, end_date, color, notes, created_at, updated_at`,
          vals
        );
        return res.json(rowToDto(r.rows[0]));
      }

      const nowIso = new Date().toISOString();
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(patch)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      sets.push("updated_at = ?");
      vals.push(nowIso);
      vals.push(id);
      await db.prepare(`UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      const row = await db
        .prepare(
          `SELECT id, title, kind, start_date, end_date, color, notes, created_at, updated_at FROM calendar_events WHERE id = ?`
        )
        .get(id);
      return res.json(rowToDto(row));
    } catch (e) {
      console.error("calendar PUT /events/:id:", e);
      return res.status(500).json({ message: e.message || "Could not update event" });
    }
  }
);

/** Delete event (admin). */
router.delete(
  "/events/:id",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.ENGAGEMENT_CALENDAR),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });
    try {
      if (isPostgres) {
        const pool = getPool();
        await pool.query(`DELETE FROM calendar_events WHERE id = $1`, [id]);
      } else {
        await db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("calendar DELETE /events/:id:", e);
      return res.status(500).json({ message: e.message || "Could not delete event" });
    }
  }
);

module.exports = router;

