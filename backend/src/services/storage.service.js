const path = require("path");
const fs = require("fs");

const backendRoot = path.join(__dirname, "..", "..");
const uploadBase = path.resolve(
  backendRoot,
  String(process.env.UPLOAD_DIR || "uploads").replace(/^\.\/+/, "")
);

const getPublicVideoUrl = (filename) => `/uploads/${filename}`;

const getPublicDocumentUrl = (filename) => `/uploads/docs/${filename}`;

const getPublicUpcomingImageUrl = (filename) => `/uploads/upcoming/${filename}`;

const getPublicPollBannerUrl = (filename) => `/uploads/polls/${filename}`;

const getPublicTicketAttachmentUrl = (filename) => `/uploads/tickets/${filename}`;

const resolveStoragePath = (filename) => path.join(uploadBase, filename);

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
  getPublicPollBannerUrl,
  getPublicTicketAttachmentUrl,
  resolveStoragePath,
  resolveLocalUploadFileUrl,
  uploadBase,
};
