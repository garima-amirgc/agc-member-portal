const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant, requireAdminGrantAny } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS, SPOTLIGHT_ADMIN_GRANT_KEYS, hasAdminGrant } = require("../config/adminGrants");
const {
  getPublicVideoUrl,
  getPublicDocumentUrl,
  getPublicUpcomingImageUrl,
  getPublicPollBannerUrl,
  getPublicTicketAttachmentUrl,
} = require("../services/storage.service");
const {
  isUploadStorageEnabled,
  requiresDigitalOceanSpacesForUploads,
  uploadStorageUnavailableMessage,
  uploadLessonVideoFromDisk,
  uploadResourceDocumentFromDisk,
  uploadUpcomingImageFromDisk,
  uploadPollBannerImageFromDisk,
  uploadTicketAttachmentFromDisk,
  createPresignedVideoUpload,
  createPresignedDocumentUpload,
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
    const allowed = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp"]);
    const heic = new Set([".heic", ".heif"]);
    if (heic.has(ext)) return cb(new Error("HEIC_NOT_SUPPORTED"));
    if (!allowed.has(ext)) return cb(new Error("INVALID_IMAGE_EXT"));
    return cb(null, true);
  },
});

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

function requireDocumentUploadGrant(req, res, next) {
  if (
    hasAdminGrant(req.user, ADMIN_GRANT_KEYS.LEARNING_ADMIN) ||
    hasAdminGrant(req.user, ADMIN_GRANT_KEYS.COMPANY_CONTENT)
  ) {
    return next();
  }
  return res.status(403).json({ message: "Forbidden" });
}

function removeTempFile(localPath) {
  try {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch {
  }
}

function rejectMissingUploadStorage(res, localPath) {
  removeTempFile(localPath);
  return res.status(503).json({ message: uploadStorageUnavailableMessage() });
}

function presignErrorResponse(res, err) {
  const raw = err?.message || String(err) || "Presign failed";
  if (raw === "INVALID_UPLOAD_EXT") {
    return res.status(400).json({ message: "Unsupported file type." });
  }
  if (/contentLength|File exceeds/i.test(raw)) {
    return res.status(400).json({ message: raw });
  }
  if (!isUploadStorageEnabled()) {
    return res.json({ direct: false });
  }
  console.error("Presign failed:", err);
  return res.status(502).json({ message: raw });
}

router.post(
  "/presign/video",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.LEARNING_ADMIN),
  async (req, res) => {
    if (!isUploadStorageEnabled()) {
      return res.json({ direct: false });
    }
    const { filename, contentType, contentLength } = req.body || {};
    if (!filename || !String(filename).trim()) {
      return res.status(400).json({ message: "filename is required" });
    }
    try {
      const result = await createPresignedVideoUpload({
        originalFilename: filename,
        contentType: contentType ? String(contentType) : undefined,
        contentLength,
      });
      return res.json(result);
    } catch (err) {
      return presignErrorResponse(res, err);
    }
  }
);

router.post(
  "/presign/document",
  authRequired,
  requireDocumentUploadGrant,
  async (req, res) => {
    if (!isUploadStorageEnabled()) {
      return res.json({ direct: false });
    }
    const { filename, contentType, contentLength } = req.body || {};
    if (!filename || !String(filename).trim()) {
      return res.status(400).json({ message: "filename is required" });
    }
    try {
      const result = await createPresignedDocumentUpload({
        originalFilename: filename,
        contentType: contentType ? String(contentType) : undefined,
        contentLength,
      });
      return res.json(result);
    } catch (err) {
      return presignErrorResponse(res, err);
    }
  }
);

router.post(
  "/",
  authRequired,
  requireAdminGrantAny(ADMIN_GRANT_KEYS.LEARNING_ADMIN, ADMIN_GRANT_KEYS.SOCIAL_COMMITTEE),
  upload.single("video"),
  async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "No video file uploaded (check type: mp4, webm, mov, mkv)." });
  }

  const localPath = req.file.path;
  const filename = req.file.filename;

  try {
    if (isUploadStorageEnabled()) {
      const { url: videoUrl, provider } = await uploadLessonVideoFromDisk(localPath, filename);
      removeTempFile(localPath);
      return res.json({
        filename,
        video_url: videoUrl,
        storageProvider: provider,
      });
    }

    if (requiresDigitalOceanSpacesForUploads()) {
      return rejectMissingUploadStorage(res, localPath);
    }

    return res.json({
      filename,
      video_url: getPublicVideoUrl(filename),
      storageProvider: "local",
    });
  } catch (err) {
    console.error("Upload failed:", err);
    removeTempFile(localPath);
    const raw = err.message || String(err) || "Upload failed";
    const name = err.name || err.Code || "";
    const badCreds =
      /does not exist in our records|InvalidAccessKeyId|InvalidSecretAccessKey|SignatureDoesNotMatch/i.test(
        `${raw} ${name}`
      );
    const hint = badCreds
      ? `${raw} Regenerate Spaces access keys in DigitalOcean (API → Spaces keys, or your Space → Access keys). Update DO_SPACES_KEY and DO_SPACES_SECRET in backend/.env, restart the server.`
      : raw;
    return res.status(502).json({ message: `Storage upload failed: ${hint}` });
  }
});

router.post(
  "/document",
  authRequired,
  requireDocumentUploadGrant,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No document uploaded." });
    }

    const localPath = req.file.path;
    const filename = req.file.filename;

    try {
      if (isUploadStorageEnabled()) {
        const { url: fileUrl, provider } = await uploadResourceDocumentFromDisk(localPath, filename);
        removeTempFile(localPath);
        return res.json({
          filename,
          file_url: fileUrl,
          storageProvider: provider,
        });
      }

      if (requiresDigitalOceanSpacesForUploads()) {
        return rejectMissingUploadStorage(res, localPath);
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
        }
      }
      return res.json({
        filename,
        file_url: getPublicDocumentUrl(filename),
        storageProvider: "local",
      });
    } catch (err) {
      console.error("Document upload failed:", err);
      removeTempFile(localPath);
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
    if (isUploadStorageEnabled()) {
      const { url: fileUrl, provider } = await uploadTicketAttachmentFromDisk(localPath, filename);
      removeTempFile(localPath);
      return res.json({
        filename,
        original_name,
        file_url: fileUrl,
        storageProvider: provider,
      });
    }

    if (requiresDigitalOceanSpacesForUploads()) {
      return rejectMissingUploadStorage(res, localPath);
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
    removeTempFile(localPath);
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
  requireAdminGrantAny(...SPOTLIGHT_ADMIN_GRANT_KEYS, ADMIN_GRANT_KEYS.UPCOMING_EVENTS, ADMIN_GRANT_KEYS.SOCIAL_COMMITTEE, ADMIN_GRANT_KEYS.HR_NEWSFEED),
  (req, res, next) => {
    uploadImage.single("image")(req, res, (err) => {
      if (err) {
        console.error("[upload] multer error on /upcoming-image:", err.message);
        // Ensure CORS header is present so the browser can read the error body
        const origin = req.headers.origin;
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        const msg =
          err.message === "HEIC_NOT_SUPPORTED"
            ? "HEIC photos can't be displayed in browsers. On iPhone: open the photo, tap Share → Save as File → choose JPG, then upload that."
            : err.message === "INVALID_IMAGE_EXT"
              ? "Unsupported image type. Please use JPG, PNG, WEBP, AVIF, or BMP."
              : err.code === "LIMIT_FILE_SIZE"
                ? `Image too large (max ${process.env.UPLOAD_IMAGE_MAX_MB || 8} MB).`
                : err.message || "Upload error.";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  async (req, res) => {
    // Always ensure CORS header is present so the browser can read any error response
    const reqOrigin = req.headers.origin;
    if (reqOrigin) res.setHeader("Access-Control-Allow-Origin", reqOrigin);

    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const localPath = req.file.path;
    const filename = req.file.filename;

    try {
      if (isUploadStorageEnabled()) {
        const { url: imageUrl, provider } = await uploadUpcomingImageFromDisk(localPath, filename);
        removeTempFile(localPath);
        return res.json({
          filename,
          image_url: imageUrl,
          storageProvider: provider,
        });
      }

      if (requiresDigitalOceanSpacesForUploads()) {
        return rejectMissingUploadStorage(res, localPath);
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
        }
      }
      return res.json({
        filename,
        image_url: getPublicUpcomingImageUrl(filename),
        storageProvider: "local",
      });
    } catch (err) {
      console.error("[upload] /upcoming-image failed:", err);
      removeTempFile(localPath);
      const raw = err.message || String(err) || "Upload failed";
      return res.status(502).json({ message: `Storage upload failed: ${raw}` });
    }
  }
);

router.post(
  "/poll-banner",
  authRequired,
  requireAdminGrant(ADMIN_GRANT_KEYS.FEEDBACK_POLLS),
  uploadImage.single("image"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const localPath = req.file.path;
    const filename = req.file.filename;

    try {
      if (isUploadStorageEnabled()) {
        const { url: imageUrl, provider } = await uploadPollBannerImageFromDisk(localPath, filename);
        removeTempFile(localPath);
        return res.json({
          filename,
          image_url: imageUrl,
          storageProvider: provider,
        });
      }

      if (requiresDigitalOceanSpacesForUploads()) {
        return rejectMissingUploadStorage(res, localPath);
      }

      const dir = path.join(uploadDir, "polls");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, filename);
      try {
        fs.renameSync(localPath, dest);
      } catch {
        fs.copyFileSync(localPath, dest);
        try {
          fs.unlinkSync(localPath);
        } catch {
        }
      }
      return res.json({
        filename,
        image_url: getPublicPollBannerUrl(filename),
        storageProvider: "local",
      });
    } catch (err) {
      console.error("Poll banner upload failed:", err);
      removeTempFile(localPath);
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
