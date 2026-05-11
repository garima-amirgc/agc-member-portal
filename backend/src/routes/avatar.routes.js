const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { db } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const {
  isUploadStorageEnabled,
  requiresDigitalOceanSpacesForUploads,
  uploadStorageUnavailableMessage,
  uploadAvatarImageFromDisk,
} = require("../services/objectStorage.service");

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

function removeTempFile(localPath) {
  try {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch {
    /* ignore */
  }
}

router.post("/me", upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No image uploaded" });

  const localPath = req.file.path;
  const filename = req.file.filename;

  try {
    let publicUrl = `/uploads/avatars/${filename}`;
    let storageProvider = "local";

    if (isUploadStorageEnabled()) {
      const uploaded = await uploadAvatarImageFromDisk(localPath, filename);
      publicUrl = uploaded.url;
      storageProvider = uploaded.provider;
      removeTempFile(localPath);
    } else if (requiresDigitalOceanSpacesForUploads()) {
      removeTempFile(localPath);
      return res.status(503).json({ message: uploadStorageUnavailableMessage() });
    }

    await db.prepare("UPDATE users SET profile_image_url = ? WHERE id = ?").run(publicUrl, req.user.id);

    return res.json({ profile_image_url: publicUrl, storageProvider });
  } catch (err) {
    console.error("Avatar upload failed:", err);
    removeTempFile(localPath);
    const raw = err.message || String(err) || "Upload failed";
    return res.status(502).json({ message: `Avatar upload failed: ${raw}` });
  }
});

module.exports = router;

