const path = require("path");
const fs = require("fs");

const backendRoot = path.join(__dirname, "..", "..");
const uploadBase = path.resolve(
  backendRoot,
  String(process.env.UPLOAD_DIR || "uploads").replace(/^\.\/+/, "")
);

/** Local disk: URL path served by Express `/uploads`. */
const getPublicVideoUrl = (filename) => `/uploads/${filename}`;

/** Resource documents stored under `uploads/docs/` when not using object storage. */
const getPublicDocumentUrl = (filename) => `/uploads/docs/${filename}`;

/** Upcoming event images under `uploads/upcoming/` when not using object storage. */
const getPublicUpcomingImageUrl = (filename) => `/uploads/upcoming/${filename}`;

/** IT ticket attachments under `uploads/tickets/` when not using object storage. */
const getPublicTicketAttachmentUrl = (filename) => `/uploads/tickets/${filename}`;

const resolveStoragePath = (filename) => path.join(uploadBase, filename);

/**
 * If `storedUrl` is a same-server `/uploads/...` path, return the absolute file path if it exists.
 * Used to stream documents stored on local disk.
 */
function resolveLocalUploadFileUrl(storedUrl) {
  const s = String(storedUrl || "").trim();
  const prefix = "/uploads/";
  if (!s.startsWith(prefix)) return null;
  const rel = s.slice(prefix.length).replace(/^\/+/, "");
  if (!rel) return null;
  const full = path.resolve(uploadBase, rel);
  const baseResolved = path.resolve(uploadBase);
  if (!full.startsWith(baseResolved + path.sep) && full !== baseResolved) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

module.exports = {
  getPublicVideoUrl,
  getPublicDocumentUrl,
  getPublicUpcomingImageUrl,
  getPublicTicketAttachmentUrl,
  resolveStoragePath,
  resolveLocalUploadFileUrl,
  uploadBase,
};
