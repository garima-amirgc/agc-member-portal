const express = require("express");
const { db, isPostgres } = require("../config/db");
const { ROLES, BUSINESS_UNITS } = require("../config/constants");
const { authRequired, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

function normalizeBusinessUnits(input) {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  const cleaned = raw
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  const valid = unique.filter((u) => BUSINESS_UNITS.includes(u));
  return valid;
}

function extractIframeSrc(iframeCode) {
  const s = String(iframeCode || "").trim();
  if (!s) return null;
  // If they pasted a URL directly, accept it.
  if (/^https?:\/\//i.test(s) && !s.includes("<")) return s;
  // Common Power BI embed snippets include src="...".
  const m = /src\s*=\s*["']([^"']+)["']/i.exec(s);
  if (m && m[1]) return String(m[1]).trim();
  return null;
}

async function facilitiesForUser(userId) {
  const rows = await db
    .prepare("SELECT business_unit FROM user_facilities WHERE user_id = ? ORDER BY business_unit ASC")
    .all(userId);
  return (rows || [])
    .map((r) => String(r.business_unit || "").trim().toUpperCase())
    .filter(Boolean);
}

function parseBusinessUnitsJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean);
  } catch {
    // Legacy / manual values: comma-separated
    return raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
}

function intersects(a, b) {
  if (!a || !b) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

function normalizeUserIds(input) {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const n = Number.parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

async function allowedReportIdsForUser(userId) {
  const rows = await db
    .prepare("SELECT report_id FROM report_access_users WHERE user_id = ? ORDER BY report_id ASC")
    .all(userId);
  return (rows || []).map((r) => Number(r.report_id)).filter((n) => Number.isFinite(n) && n > 0);
}

async function reportsWithAnyAllowlist() {
  const rows = await db.prepare("SELECT DISTINCT report_id FROM report_access_users").all();
  return (rows || []).map((r) => Number(r.report_id)).filter((n) => Number.isFinite(n) && n > 0);
}

/** List reports visible to the logged-in user (by facility). */
router.get("/", async (req, res) => {
  try {
    const myFacilities = await facilitiesForUser(req.user.id);
    const allowedIds = new Set(await allowedReportIdsForUser(req.user.id));
    const restrictedIds = new Set(await reportsWithAnyAllowlist());
    const rows = await db
      .prepare(
        `SELECT id, title, description, business_units, embed_src, sort_order, created_at, updated_at
         FROM embedded_reports
         ORDER BY sort_order ASC, id DESC`
      )
      .all();

    const out = (rows || [])
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        business_units: parseBusinessUnitsJson(r.business_units),
        embed_src: r.embed_src,
        sort_order: Number(r.sort_order) || 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }))
      .filter((r) => {
        // Facility-based visibility first.
        const facilityOk = r.business_units.length === 0 || intersects(myFacilities, r.business_units);
        if (!facilityOk) return false;
        // New rule: reports are hidden until at least one user is assigned.
        const rid = Number(r.id);
        if (!restrictedIds.has(rid)) return false;
        // If a report has any allowlist, require explicit membership.
        return allowedIds.has(rid);
      });

    return res.json(out);
  } catch (e) {
    console.error("[reports] GET /:", e);
    return res.status(500).json({ message: "Could not load reports" });
  }
});

/** Admin: list all reports (ignores facility filtering). */
router.get("/admin/all", allowRoles(ROLES.ADMIN), async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, description, business_units, embed_src, sort_order, created_by, created_at, updated_at
         FROM embedded_reports
         ORDER BY sort_order ASC, id DESC`
      )
      .all();
    const access = await db.prepare("SELECT report_id, user_id FROM report_access_users").all();
    const allowByReport = new Map(); // report_id -> number[]
    for (const row of access || []) {
      const rid = Number(row.report_id);
      const uid = Number(row.user_id);
      if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(uid) || uid < 1) continue;
      const arr = allowByReport.get(rid) || [];
      arr.push(uid);
      allowByReport.set(rid, arr);
    }
    const out = (rows || []).map((r) => ({
      ...r,
      business_units: parseBusinessUnitsJson(r.business_units),
      sort_order: Number(r.sort_order) || 0,
      allowed_user_ids: allowByReport.get(Number(r.id)) || [],
    }));
    return res.json(out);
  } catch (e) {
    console.error("[reports] GET /admin/all:", e);
    return res.status(500).json({ message: "Could not load reports" });
  }
});

/** Admin: create. Accepts either `embed_src` or `iframe_code`. */
router.post("/", allowRoles(ROLES.ADMIN), async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = req.body?.description != null ? String(req.body.description) : "";
  const sort_order = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0;

  const bus = normalizeBusinessUnits(req.body?.business_units);
  const business_units = JSON.stringify(bus.length ? bus : BUSINESS_UNITS);
  const allowed_user_ids = normalizeUserIds(req.body?.allowed_user_ids);

  const embedSrcRaw =
    String(req.body?.embed_src || "").trim() || extractIframeSrc(req.body?.iframe_code);

  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!embedSrcRaw) return res.status(400).json({ message: "Paste an iframe code or embed URL (src)." });
  if (!/^https?:\/\//i.test(embedSrcRaw)) return res.status(400).json({ message: "Embed src must be a URL." });

  try {
    const now = new Date().toISOString();
    const ins = await db
      .prepare(
        `INSERT INTO embedded_reports(title, description, business_units, embed_src, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, description, business_units, embedSrcRaw, sort_order, req.user.id, now, now);
    const id = Number(ins.lastInsertRowid || ins.id || 0) || null;
    if (id && allowed_user_ids.length > 0) {
      for (const uid of allowed_user_ids) {
        try {
          await db
            .prepare("INSERT INTO report_access_users(report_id, user_id, created_at) VALUES (?, ?, ?)")
            .run(id, uid, now);
        } catch {
          /* ignore duplicates */
        }
      }
    }
    return res.status(201).json({ id });
  } catch (e) {
    console.error("[reports] POST /:", e);
    if (isPostgres && e?.code) return res.status(400).json({ message: "Could not create report", detail: e.detail });
    return res.status(400).json({ message: "Could not create report" });
  }
});

/** Admin: update. Accepts either `embed_src` or `iframe_code`. */
router.put("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });

  const existing = await db.prepare("SELECT * FROM embedded_reports WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Report not found" });

  const title = req.body?.title != null ? String(req.body.title).trim() : String(existing.title || "").trim();
  const description = req.body?.description != null ? String(req.body.description) : existing.description || "";
  const sort_order =
    req.body?.sort_order != null && Number.isFinite(Number(req.body.sort_order))
      ? Number(req.body.sort_order)
      : Number(existing.sort_order) || 0;

  const bus =
    Object.prototype.hasOwnProperty.call(req.body || {}, "business_units")
      ? normalizeBusinessUnits(req.body.business_units)
      : parseBusinessUnitsJson(existing.business_units);
  const business_units = JSON.stringify(bus.length ? bus : BUSINESS_UNITS);

  const embedSrcMaybe =
    (req.body?.embed_src != null ? String(req.body.embed_src).trim() : "") || extractIframeSrc(req.body?.iframe_code);
  const embed_src = embedSrcMaybe ? embedSrcMaybe : String(existing.embed_src || "").trim();
  const allowed_user_ids = Object.prototype.hasOwnProperty.call(req.body || {}, "allowed_user_ids")
    ? normalizeUserIds(req.body.allowed_user_ids)
    : null;

  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!embed_src) return res.status(400).json({ message: "Embed src is required" });
  if (!/^https?:\/\//i.test(embed_src)) return res.status(400).json({ message: "Embed src must be a URL." });

  try {
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE embedded_reports
         SET title = ?, description = ?, business_units = ?, embed_src = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, description, business_units, embed_src, sort_order, now, id);
    if (allowed_user_ids) {
      await db.prepare("DELETE FROM report_access_users WHERE report_id = ?").run(id);
      for (const uid of allowed_user_ids) {
        try {
          await db
            .prepare("INSERT INTO report_access_users(report_id, user_id, created_at) VALUES (?, ?, ?)")
            .run(id, uid, now);
        } catch {
          /* ignore duplicates */
        }
      }
    }
    return res.json({ message: "Report updated" });
  } catch (e) {
    console.error("[reports] PUT /:id:", e);
    return res.status(400).json({ message: "Could not update report" });
  }
});

/** Admin: delete. */
router.delete("/:id", allowRoles(ROLES.ADMIN), async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });
  try {
    await db.prepare("DELETE FROM embedded_reports WHERE id = ?").run(id);
    return res.json({ message: "Report deleted" });
  } catch (e) {
    console.error("[reports] DELETE /:id:", e);
    return res.status(500).json({ message: "Could not delete report" });
  }
});

module.exports = router;

