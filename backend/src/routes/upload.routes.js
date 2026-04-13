const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { authRequired, allowRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");
const {
  getPublicVideoUrl,
  getPublicDocumentUrl,
  getPublicUpcomingImageUrl,
  getPublicTicketAttachmentUrl,
} = require("../services/storage.service");
const {
  isCloudStorageEnabled,
  uploadLessonVideoFromDisk,
  uploadResourceDocumentFromDisk,
  uploadUpcomingImageFromDisk,
  uploadTicketAttachmentFromDisk,
} = require("../services/objectStorage.service");

const backendRoot = path.join(__dirname, "..", "..");
const uploadDir = path.resolve(
  backendRoot,
  String(process.env.UPLOAD_DIR || "uploads").replace(/^\.\/+/, "")
);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`),
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.UPLOAD_MAX_MB) || 500) * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedVideo = new Set([".mp4", ".webm", ".mov", ".mkv"]);
    const allowedDocs = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt"]);
    if (!allowedVideo.has(ext) && !allowedDocs.has(ext)) {
      return cb(new Error("INVALID_UPLOAD_EXT"));
    }
    return cb(null, true);
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: (Number(process.env.UPLOAD_IMAGE_MAX_MB) || 8) * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
    if (!allowed.has(ext)) return cb(new Error("INVALID_IMAGE_EXT"));
    return cb(null, true);
  },
});

/** IT ticket attachments: images + common documents (any signed-in user). */
const ticketAttachmentUpload = multer({
  storage,
  limits: { fileSize: (Number(process.env.IT_TICKET_UPLOAD_MAX_MB) || 15) * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".ppt",
      ".pptx",
      ".xls",
      ".xlsx",
      ".txt",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
    ]);
    if (!allowed.has(ext)) return cb(new Error("INVALID_TICKET_ATTACHMENT_EXT"));
    return cb(null, true);
  },
});

const router = express.Router();

router.post("/", authRequired, allowRoles(ROLES.ADMIN), upload.single("video"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "No video file uploaded (check type: mp4, webm, mov, mkv)." });
  }

  const localPath = req.file.path;
  const filename = req.file.filename;

  try {
    if (isCloudStorageEnabled()) {
      const { url: videoUrl, provider } = await uploadLessonVideoFromDisk(localPath, filename);
      try {
        fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
      return res.json({
        filename,
        video_url: videoUrl,
        storageProvider: provider,
      });
    }

    return res.json({
      filename,
      video_url: getPublicVideoUrl(filename),
      storageProvider: "local",
    });
  } catch (err) {
    console.error("Upload failed:", err);
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch {
      /* ignore */
    }
    const raw = err.message || String(err) || "Upload failed";
    const name = err.name || err.Code || "";
    const badCreds =
      /does not exist in our records|InvalidAccessKeyId|InvalidSecretAccessKey|SignatureDoesNotMatch/i.test(
        `${raw} ${name}`
      );
    const hint = badCreds
      ? `${raw} Regenerate Spaces access keys in DigitalOcean (API → Spaces keys, or your Space → Access keys). Update DO_SPACES_KEY and DO_SPACES_SECRET in backend/.env, restart the server. To skip cloud and use local files only, remove or empty DO_SPACES_KEY (and R2_* if set).`
      : raw;
    return res.status(502).json({ message: `Storage upload failed: ${hint}` });
  }
});

router.post(
  "/document",
  authRequired,
  allowRoles(ROLES.ADMIN),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No document uploaded." });
    }

    const localPath = req.file.path;
    const filename = req.file.filename;

    try {
      if (isCloudStorageEnabled()) {
        const { url: fileUrl, provider } = await uploadResourceDocumentFromDisk(localPath, filename);
        try {
          fs.unlinkSync(localPath);
        } catch {
          /* ignore */
        }
        return res.json({
          filename,
          file_url: fileUrl,
          storageProvider: provider,
        });
      }

      const docsDir = path.join(uploadDir, "docs");
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
      const dest = path.join(docsDir, filename);
      try {
        fs.renameSync(localPath, dest);
      } catch {
        fs.copyFileSync(localPath, dest);
        try {
          fs.unlinkSync(localPath);
        } catch {
          /* ignore */
        }
      }
      return res.json({
        filename,
        file_url: getPublicDocumentUrl(filename),
        storageProvider: "local",
      });
    } catch (err) {
      console.error("Document upload failed:", err);
      try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
      const raw = err.message || String(err) || "Upload failed";
      return res.status(502).json({ message: `Storage upload failed: ${raw}` });
    }
  }
);

async function handleTicketAttachmentUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const localPath = req.file.path;
  const filename = req.file.filename;
  const original_name = String(req.file.originalname || filename).slice(0, 240);

  try {
    if (isCloudStorageEnabled()) {
      const { url: fileUrl, provider } = await uploadTicketAttachmentFromDisk(localPath, filename);
      try {
        fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
      return res.json({
        filename,
        original_name,
        file_url: fileUrl,
        storageProvider: provider,
      });
    }

    const ticketsDir = path.join(uploadDir, "tickets");
    if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir, { recursive: true });
    const dest = path.join(ticketsDir, filename);
    try {
      fs.renameSync(localPath, dest);
    } catch {
      fs.copyFileSync(localPath, dest);
      try {
        fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
    }
    return res.json({
      filename,
      original_name,
      file_url: getPublicTicketAttachmentUrl(filename),
      storageProvider: "local",
    });
  } catch (err) {
    console.error("Ticket attachment upload failed:", err);
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch {
      /* ignore */
    }
    const raw = err.message || String(err) || "Upload failed";
    return res.status(502).json({ message: `Storage upload failed: ${raw}` });
  }
}

router.post(
  "/ticket-attachment",
  authRequired,
  ticketAttachmentUpload.single("file"),
  handleTicketAttachmentUpload
);

router.post(
  "/upcoming-image",
  authRequired,
  allowRoles(ROLES.ADMIN),
  uploadImage.single("image"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const localPath = req.file.path;
    const filename = req.file.filename;

    try {
      if (isCloudStorageEnabled()) {
        const { url: imageUrl, provider } = await uploadUpcomingImageFromDisk(localPath, filename);
        try {
          fs.unlinkSync(localPath);
        } catch {
          /* ignore */
        }
        return res.json({
          filename,
          image_url: imageUrl,
          storageProvider: provider,
        });
      }

      const dir = path.join(uploadDir, "upcoming");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, filename);
      try {
        fs.renameSync(localPath, dest);
      } catch {
        fs.copyFileSync(localPath, dest);
        try {
          fs.unlinkSync(localPath);
        } catch {
          /* ignore */
        }
      }
      return res.json({
        filename,
        image_url: getPublicUpcomingImageUrl(filename),
        storageProvider: "local",
      });
    } catch (err) {
      console.error("Upcoming image upload failed:", err);
      try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
      const raw = err.message || String(err) || "Upload failed";
      return res.status(502).json({ message: `Storage upload failed: ${raw}` });
    }
  }
);

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const ticketMax = Number(process.env.IT_TICKET_UPLOAD_MAX_MB) || 15;
      const u = String(req.originalUrl || req.url || "");
      const maxMb = /ticket-attachment/i.test(u) ? ticketMax : Number(process.env.UPLOAD_MAX_MB) || 500;
      return res.status(413).json({ message: `File too large (max ${maxMb} MB).` });
    }
    return res.status(400).json({ message: err.message || "Upload failed." });
  }
  if (err.message === "INVALID_VIDEO_EXT") {
    return res.status(400).json({ message: "Only mp4, webm, mov, and mkv files are allowed." });
  }
  if (err.message === "INVALID_UPLOAD_EXT") {
    return res
      .status(400)
      .json({ message: "Only video (mp4, webm, mov, mkv) and documents (pdf, docx, pptx, xlsx, txt) are allowed." });
  }
  if (err.message === "INVALID_IMAGE_EXT") {
    return res.status(400).json({ message: "Only image files are allowed (jpg, png, gif, webp)." });
  }
  if (err.message === "INVALID_TICKET_ATTACHMENT_EXT") {
    return res.status(400).json({
      message:
        "Allowed: PDF, Word, Excel, PowerPoint, plain text, or images (jpg, png, gif, webp).",
    });
  }
  next(err);
});

module.exports = router;
module.exports.handleTicketAttachmentUpload = handleTicketAttachmentUpload;
module.exports.ticketAttachmentUploadSingle = ticketAttachmentUpload.single("file");
