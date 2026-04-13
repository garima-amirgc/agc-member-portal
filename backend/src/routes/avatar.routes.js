const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

const backendRoot = path.join(__dirname, "..", "..");
const uploadRoot = path.resolve(
  backendRoot,
  String(process.env.UPLOAD_DIR || "uploads").replace(/^\.\/+/, "")
);
const avatarDir = path.join(uploadRoot, "avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, avatarDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

router.post("/me", upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No image uploaded" });

  const publicUrl = `/uploads/avatars/${req.file.filename}`;
  await db.prepare("UPDATE users SET profile_image_url = ? WHERE id = ?").run(publicUrl, req.user.id);

  return res.json({ profile_image_url: publicUrl });
});

module.exports = router;

