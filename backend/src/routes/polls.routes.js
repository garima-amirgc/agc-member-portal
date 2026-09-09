const express = require("express");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mapPollRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    definition: safeJsonParse(row.poll_json),
    start_at: row.start_at,
    end_at: row.end_at,
    banner_image_url: row.banner_image_url,
    limit_one_response: row.limit_one_response == null ? true : Number(row.limit_one_response) === 1,
    // Only meaningful when limit_one_response is off — lets the popup tell the
    // person their new answer will replace what they submitted before.
    has_previous_response: Boolean(row.has_previous_response),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get("/active", async (req, res) => {
  const now = nowIso();
  const rows = await db
    .prepare(
      `SELECT p.id, p.title, p.description, p.poll_json, p.active, p.start_at, p.end_at, p.banner_image_url,
              p.limit_one_response,
              CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END AS has_previous_response,
              p.created_at, p.updated_at
       FROM polls p
       LEFT JOIN poll_submissions ps ON ps.poll_id = p.id AND ps.user_id = ?
       WHERE p.active = 1
         AND (p.limit_one_response = 0 OR ps.id IS NULL)
         AND (p.start_at IS NULL OR TRIM(COALESCE(p.start_at, '')) = '' OR p.start_at <= ?)
         AND (p.end_at IS NULL OR TRIM(COALESCE(p.end_at, '')) = '' OR p.end_at >= ?)
       ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all(req.user.id, now, now);

  const polls = (Array.isArray(rows) ? rows : []).map(mapPollRow);
  return res.json({ polls });
});

router.post("/:id/submit", async (req, res) => {
  const pollId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(pollId) || pollId < 1) {
    return res.status(400).json({ message: "Invalid poll id" });
  }
  const poll = await db
    .prepare("SELECT id, active, poll_json, limit_one_response FROM polls WHERE id = ? LIMIT 1")
    .get(pollId);
  if (!poll) return res.status(404).json({ message: "Poll not found" });
  if (Number(poll.active) !== 1) return res.status(400).json({ message: "Poll is not active" });
  const limitOneResponse = poll.limit_one_response == null ? true : Number(poll.limit_one_response) === 1;

  const existing = await db
    .prepare("SELECT id FROM poll_submissions WHERE poll_id = ? AND user_id = ? LIMIT 1")
    .get(pollId, req.user.id);
  if (existing && limitOneResponse) return res.json({ ok: true, already_submitted: true });

  const answers = req.body?.answers;
  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ message: "answers is required" });
  }
  const answersJson = JSON.stringify(answers);

  // Repeat submissions are allowed for this poll — replace the person's prior
  // answer rather than inserting a second row (poll_submissions still has a
  // UNIQUE(poll_id, user_id) constraint, so a second insert would fail anyway).
  if (existing) {
    try {
      await db
        .prepare("UPDATE poll_submissions SET answers_json = ?, submitted_at = ? WHERE id = ?")
        .run(answersJson, nowIso(), existing.id);
    } catch (e) {
      console.error("[polls] resubmit failed:", e);
      return res.status(500).json({ message: "Could not submit poll" });
    }
    return res.json({ ok: true, updated: true });
  }

  try {
    await db
      .prepare("INSERT INTO poll_submissions(poll_id, user_id, answers_json) VALUES (?, ?, ?)")
      .run(pollId, req.user.id, answersJson);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/unique/i.test(msg)) return res.json({ ok: true, already_submitted: true });
    console.error("[polls] submit failed:", e);
    return res.status(500).json({ message: "Could not submit poll" });
  }

  return res.json({ ok: true });
});

module.exports = router;

