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

/**
 * Get the currently active poll for this user.
 * Returns { poll: null } if no active poll exists or the user already submitted it.
 */
router.get("/active", async (req, res) => {
  const now = nowIso();
  const poll = await db
    .prepare(
      `SELECT id, title, description, poll_json, active, start_at, end_at, banner_image_url, created_at, updated_at
       FROM polls
       WHERE active = 1
         AND (start_at IS NULL OR TRIM(COALESCE(start_at, '')) = '' OR start_at <= ?)
         AND (end_at IS NULL OR TRIM(COALESCE(end_at, '')) = '' OR end_at >= ?)
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    )
    .get(now, now);
  if (!poll) return res.json({ poll: null });

  const prior = await db
    .prepare("SELECT id FROM poll_submissions WHERE poll_id = ? AND user_id = ? LIMIT 1")
    .get(poll.id, req.user.id);
  if (prior) return res.json({ poll: null });

  const def = safeJsonParse(poll.poll_json);
  return res.json({
    poll: {
      id: poll.id,
      title: poll.title,
      description: poll.description,
      definition: def,
      start_at: poll.start_at,
      end_at: poll.end_at,
      banner_image_url: poll.banner_image_url,
      created_at: poll.created_at,
      updated_at: poll.updated_at,
    },
  });
});

router.post("/:id/submit", async (req, res) => {
  const pollId = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(pollId) || pollId < 1) {
    return res.status(400).json({ message: "Invalid poll id" });
  }
  const poll = await db
    .prepare("SELECT id, active, poll_json FROM polls WHERE id = ? LIMIT 1")
    .get(pollId);
  if (!poll) return res.status(404).json({ message: "Poll not found" });
  if (Number(poll.active) !== 1) return res.status(400).json({ message: "Poll is not active" });

  const existing = await db
    .prepare("SELECT id FROM poll_submissions WHERE poll_id = ? AND user_id = ? LIMIT 1")
    .get(pollId, req.user.id);
  if (existing) return res.json({ ok: true, already_submitted: true });

  const answers = req.body?.answers;
  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ message: "answers is required" });
  }

  const answersJson = JSON.stringify(answers);
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

