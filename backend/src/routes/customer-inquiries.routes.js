/**
 * Customer Inquiry Routes — PUBLIC (no auth required)
 *
 * Workflow: Customer submits → FSQA reviews & comments → Management closes
 *
 * FSQA email:       process.env.FSQA_EMAIL       (default: garimasingh2841@gmail.com)
 * Management email: process.env.MANAGEMENT_EMAIL (default: garimasingh2841@gmail.com)
 */

const express = require("express");
const dbModule = require("../config/db");
const { db, isPostgres } = dbModule;
const email = require("../services/email.service");
const { rewriteSqliteToPostgres } = require("../config/database/sqlDialect");

const router = express.Router();

const FSQA_EMAIL = process.env.FSQA_EMAIL || "g.garima2841@gmail.com";
const MANAGEMENT_EMAIL = process.env.MANAGEMENT_EMAIL || "g.garima2841@gmail.com";

const VALID_TYPES = [
  "general",
  "product_quality",
  "food_safety",
  "order_shipment",
  "packaging_labelling",
  "other",
];

const VALID_STATUSES = ["new", "fsqa_review", "management_review", "closed"];

function nowIso() {
  return new Date().toISOString();
}

// ── POST /  — Submit new inquiry (public) ─────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      customer_name,
      customer_company,
      customer_email,
      customer_phone,
      inquiry_type = "general",
      product,
      subject,
      message,
      incident_date,
    } = req.body || {};

    if (!customer_name || !String(customer_name).trim())
      return res.status(400).json({ message: "Name is required." });
    if (!customer_email || !/\S+@\S+\.\S+/.test(String(customer_email).trim()))
      return res.status(400).json({ message: "A valid email address is required." });
    if (!subject || !String(subject).trim())
      return res.status(400).json({ message: "Subject is required." });
    if (!message || !String(message).trim())
      return res.status(400).json({ message: "Message is required." });
    if (!VALID_TYPES.includes(inquiry_type))
      return res.status(400).json({ message: "Invalid inquiry type." });

    const now = nowIso();
        let sql = `INSERT INTO customer_inquiries
      (customer_name, customer_company, customer_email, customer_phone,
       inquiry_type, product, subject, message, incident_date,
       status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`;
    const params = [
      String(customer_name).trim(),
      customer_company ? String(customer_company).trim() : null,
      String(customer_email).trim().toLowerCase(),
      customer_phone ? String(customer_phone).trim() : null,
      inquiry_type,
      product ? String(product).trim() : null,
      String(subject).trim(),
      String(message).trim(),
      incident_date ? String(incident_date).trim() : null,
      now,
      now,
    ];

    if (isPostgres) sql = rewriteSqliteToPostgres(sql) + " RETURNING id";
    const result = await db.prepare(sql).run(...params);
    const id = isPostgres ? result.lastInsertRowid : result.lastInsertRowid;

    const inquiry = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);

    // Notify FSQA (fire-and-forget)
    email.sendCustomerInquiryToFsqa({ to: FSQA_EMAIL, inquiry }).catch((e) => {
      console.error("[customer-inquiry] FSQA notify failed:", e?.message || e);
    });

    return res.status(201).json({ id, message: "Your inquiry has been submitted. We will be in touch shortly." });
  } catch (e) {
    console.error("[customer-inquiry] submit error:", e);
    return res.status(500).json({ message: "Failed to submit inquiry. Please try again." });
  }
});

// ── GET /  — List all inquiries (review dashboard, no auth) ──────────────────
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let sql = "SELECT * FROM customer_inquiries";
    const params = [];
    if (status && VALID_STATUSES.includes(status)) {
      sql += " WHERE status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC";
    const rows = await db.prepare(sql).all(...params);
    return res.json(rows);
  } catch (e) {
    console.error("[customer-inquiry] list error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ── GET /:id  — Get single inquiry ───────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });
    const row = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ message: "Inquiry not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH /:id/fsqa-review  — FSQA adds comment and forwards to management ───
router.patch("/:id/fsqa-review", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });

    const { comment, reviewer_name } = req.body || {};
    if (!comment || !String(comment).trim())
      return res.status(400).json({ message: "A comment is required before forwarding." });

    const row = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ message: "Inquiry not found" });
    if (row.status === "closed")
      return res.status(400).json({ message: "This inquiry is already closed." });

    const now = nowIso();
        let sql = `UPDATE customer_inquiries
      SET status = 'management_review',
          fsqa_comment = ?,
          fsqa_reviewer = ?,
          fsqa_reviewed_at = ?,
          updated_at = ?
      WHERE id = ?`;
    if (isPostgres) sql = rewriteSqliteToPostgres(sql);
    await db.prepare(sql).run(
      String(comment).trim(),
      reviewer_name ? String(reviewer_name).trim() : "FSQA",
      now,
      now,
      id
    );

    const updated = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);

    // Notify management (fire-and-forget)
    email.sendCustomerInquiryToManagement({ to: MANAGEMENT_EMAIL, inquiry: updated }).catch((e) => {
      console.error("[customer-inquiry] management notify failed:", e?.message || e);
    });

    return res.json(updated);
  } catch (e) {
    console.error("[customer-inquiry] fsqa-review error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH /:id/management-close  — Management adds comment and closes ─────────
router.patch("/:id/management-close", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "Invalid id" });

    const { comment, reviewer_name } = req.body || {};
    if (!comment || !String(comment).trim())
      return res.status(400).json({ message: "A management comment is required before closing." });

    const row = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ message: "Inquiry not found" });
    if (row.status === "closed")
      return res.status(400).json({ message: "This inquiry is already closed." });

    const now = nowIso();
        let sql = `UPDATE customer_inquiries
      SET status = 'closed',
          management_comment = ?,
          management_reviewer = ?,
          management_reviewed_at = ?,
          updated_at = ?
      WHERE id = ?`;
    if (isPostgres) sql = rewriteSqliteToPostgres(sql);
    await db.prepare(sql).run(
      String(comment).trim(),
      reviewer_name ? String(reviewer_name).trim() : "Management",
      now,
      now,
      id
    );

    const updated = await db.prepare("SELECT * FROM customer_inquiries WHERE id = ?").get(id);
    return res.json(updated);
  } catch (e) {
    console.error("[customer-inquiry] management-close error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
