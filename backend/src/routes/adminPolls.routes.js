const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");

const router = express.Router();
router.use(authRequired);
router.use(requireAdminGrant(ADMIN_GRANT_KEYS.FEEDBACK_POLLS));

function nowIso() {
  return new Date().toISOString();
}

function normalizeOptionalIsoDatetime(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePollDefinition(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (typeof v === "object") return v;
  return null;
}

function parseAnswersObject(raw) {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return {};
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function normalizeExportQuestions(def) {
  const d = normalizePollDefinition(def);
  if (!d || !Array.isArray(d.questions)) return [];
  return d.questions
    .map((q) => ({
      id: String(q?.id || "").trim(),
      type: q?.type === "multiselect" || q?.type === "text" ? q.type : "radio",
      label: String(q?.label || "").trim(),
      options: Array.isArray(q?.options)
        ? q.options.map((o) => ({ id: String(o?.id || "").trim(), label: String(o?.label || "").trim() }))
        : [],
    }))
    .filter((q) => q.id && q.label);
}

function buildOptionLabelMap(questions) {
  const m = new Map();
  for (const q of questions) {
    for (const o of q.options) {
      if (o.id) m.set(`${q.id}::${o.id}`, o.label);
    }
  }
  return m;
}

function formatAnswerCell(q, raw, labelMap) {
  if (raw === undefined || raw === null) return "";
  if (q.type === "text") return String(raw);
  if (q.type === "radio") {
    const optId = String(raw);
    return labelMap.get(`${q.id}::${optId}`) || optId;
  }
  if (q.type === "multiselect") {
    if (!Array.isArray(raw)) return String(raw);
    return raw.map((optId) => labelMap.get(`${q.id}::${String(optId)}`) || String(optId)).join("; ");
  }
  return String(raw);
}

function uniqueQuestionHeaders(questions) {
  const labelCount = new Map();
  for (const q of questions) {
    labelCount.set(q.label, (labelCount.get(q.label) || 0) + 1);
  }
  return questions.map((q) => ((labelCount.get(q.label) || 0) > 1 ? `${q.label} (${q.id})` : q.label));
}

function sanitizeExcelSheetName(name) {
  const s = String(name || "Poll").replace(/[\\/:?*\[\]]/g, "-").trim();
  const base = s || "Poll";
  return base.length > 31 ? base.slice(0, 31) : base;
}

function contentDispositionAttachment(filename) {
  const ascii = String(filename).replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

router.get("/polls", async (_req, res) => {
  const rows = await db
    .prepare(
      "SELECT id, title, description, active, start_at, end_at, banner_image_url, created_at, updated_at FROM polls ORDER BY updated_at DESC, id DESC"
    )
    .all();
  return res.json(rows);
});

router.get("/polls/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });
  const row = await db
    .prepare(
      "SELECT id, title, description, poll_json, active, start_at, end_at, banner_image_url, created_at, updated_at FROM polls WHERE id = ?"
    )
    .get(id);
  if (!row) return res.status(404).json({ message: "Not found" });
  let def = null;
  try {
    def = JSON.parse(String(row.poll_json || "{}"));
  } catch {
    def = null;
  }
  return res.json({ ...row, definition: def });
});

router.get("/polls/:id/submissions/export", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });

  const pollRow = await db.prepare("SELECT id, title, poll_json FROM polls WHERE id = ?").get(id);
  if (!pollRow) return res.status(404).json({ message: "Not found" });

  const questions = normalizeExportQuestions(pollRow.poll_json);
  const qHeaders = uniqueQuestionHeaders(questions);
  const labelMap = buildOptionLabelMap(questions);

  const rows = await db
    .prepare(
      `SELECT s.id AS submission_id, s.submitted_at, s.user_id, s.answers_json,
              u.name AS user_name, u.email AS user_email, u.role AS user_role,
              u.business_unit AS user_business_unit,
              COALESCE(u.department, '') AS user_department
       FROM poll_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.poll_id = ?
       ORDER BY s.submitted_at ASC, s.id ASC`
    )
    .all(id);

  let ExcelJS;
  try {
    ExcelJS = require("exceljs");
  } catch (e) {
    console.error("[admin polls] exceljs missing:", e);
    return res.status(500).json({ message: "Export is not available on this server." });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AGC University LMS";
  const sheet = workbook.addWorksheet(sanitizeExcelSheetName(pollRow.title || `Poll ${id}`));

  const headers = [
    "Submission ID",
    "Submitted at",
    "User ID",
    "Name",
    "Email",
    "Role",
    "Primary facility",
    "Department",
    ...qHeaders,
  ];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    const answers = parseAnswersObject(r.answers_json);
    const cells = [
      r.submission_id,
      r.submitted_at != null ? String(r.submitted_at) : "",
      r.user_id,
      r.user_name != null ? String(r.user_name) : "",
      r.user_email != null ? String(r.user_email) : "",
      r.user_role != null ? String(r.user_role) : "",
      r.user_business_unit != null ? String(r.user_business_unit) : "",
      r.user_department != null ? String(r.user_department) : "",
    ];
    for (const q of questions) {
      cells.push(formatAnswerCell(q, answers[q.id], labelMap));
    }
    sheet.addRow(cells);
  }

  for (let c = 1; c <= headers.length; c += 1) {
    sheet.getColumn(c).width = Math.min(48, Math.max(14, String(headers[c - 1]).length + 4));
  }

  try {
    const buf = await workbook.xlsx.writeBuffer();
    const slug = String(pollRow.title || `poll-${id}`)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const base = (slug || `poll_${id}`).slice(0, 80);
    const filename = `${base}_submissions.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", contentDispositionAttachment(filename));
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[admin polls] export failed:", e);
    return res.status(500).json({ message: "Could not build export file" });
  }
});

router.post("/polls", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = req.body?.description != null ? String(req.body.description) : "";
  const definition = normalizePollDefinition(req.body?.definition);
  const active = req.body?.active === true || req.body?.active === 1 || req.body?.active === "1";
  const startAt = normalizeOptionalIsoDatetime(req.body?.start_at);
  const endAt = normalizeOptionalIsoDatetime(req.body?.end_at);
  const bannerImageUrl = req.body?.banner_image_url != null ? String(req.body.banner_image_url).trim() : "";
  if (!title) return res.status(400).json({ message: "title is required" });
  if (!definition) return res.status(400).json({ message: "definition is required" });

  const json = JSON.stringify(definition);
  const ts = nowIso();
  const result = await db
    .prepare(
      "INSERT INTO polls(title, description, poll_json, active, start_at, end_at, banner_image_url, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(title, description, json, active ? 1 : 0, startAt, endAt, bannerImageUrl || null, req.user.id, ts, ts);
  const id = Number(result.lastInsertRowid) || null;
  return res.status(201).json({ id });
});

router.put("/polls/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });
  const existing = await db.prepare("SELECT id FROM polls WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });

  const title = String(req.body?.title || "").trim();
  const description = req.body?.description != null ? String(req.body.description) : "";
  const definition = normalizePollDefinition(req.body?.definition);
  const active = req.body?.active === true || req.body?.active === 1 || req.body?.active === "1";
  const startAt = normalizeOptionalIsoDatetime(req.body?.start_at);
  const endAt = normalizeOptionalIsoDatetime(req.body?.end_at);
  const bannerImageUrl = req.body?.banner_image_url != null ? String(req.body.banner_image_url).trim() : "";
  if (!title) return res.status(400).json({ message: "title is required" });
  if (!definition) return res.status(400).json({ message: "definition is required" });

  const json = JSON.stringify(definition);
  const ts = nowIso();
  await db
    .prepare(
      "UPDATE polls SET title=?, description=?, poll_json=?, active=?, start_at=?, end_at=?, banner_image_url=?, updated_at=? WHERE id=?"
    )
    .run(title, description, json, active ? 1 : 0, startAt, endAt, bannerImageUrl || null, ts, id);
  return res.json({ ok: true });
});

router.post("/polls/:id/activate", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });
  const existing = await db.prepare("SELECT id FROM polls WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  const ts = nowIso();
  await db.prepare("UPDATE polls SET active = 1, updated_at = ? WHERE id = ?").run(ts, id);
  return res.json({ ok: true });
});

router.post("/polls/:id/reset", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });
  const existing = await db.prepare("SELECT id FROM polls WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Not found" });
  await db.prepare("DELETE FROM poll_submissions WHERE poll_id = ?").run(id);
  return res.json({ ok: true });
});

router.delete("/polls/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid poll id" });
  await db.prepare("DELETE FROM polls WHERE id = ?").run(id);
  return res.json({ ok: true });
});

module.exports = router;

