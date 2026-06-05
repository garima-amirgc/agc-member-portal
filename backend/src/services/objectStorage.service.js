const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

/** Trim and strip a single pair of surrounding quotes from .env values. */
function envCred(key) {
  const v = process.env[key];
  if (v == null) return "";
  let s = String(v).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

const VIDEO_EXT_TO_MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

const DOC_EXT_TO_MIME = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

const IMAGE_EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function isR2Enabled() {
  if (String(process.env.STORAGE_SKIP_R2 || "").trim() === "1") return false;
  return Boolean(
    process.env.R2_BUCKET_NAME &&
      envCred("R2_ACCESS_KEY_ID") &&
      envCred("R2_SECRET_ACCESS_KEY") &&
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_PUBLIC_URL
  );
}

/** DigitalOcean Spaces (S3-compatible). */
function isSpacesEnabled() {
  const hasApiTarget = Boolean(envCred("DO_SPACES_ENDPOINT") || envCred("DO_SPACES_REGION"));
  return Boolean(
    envCred("DO_SPACES_BUCKET") &&
      envCred("DO_SPACES_KEY") &&
      envCred("DO_SPACES_SECRET") &&
      hasApiTarget &&
      envCred("DO_SPACES_PUBLIC_URL")
  );
}

function isCloudStorageEnabled() {
  return isR2Enabled() || isSpacesEnabled();
}

function isProductionRuntime() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" || Boolean(process.env.RENDER);
}

function requiresDigitalOceanSpacesForUploads() {
  const raw =
    envCred("REQUIRE_DIGITALOCEAN_SPACES") ||
    envCred("FORCE_DIGITALOCEAN_UPLOADS");
  const normalized = String(raw || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return isProductionRuntime();
}

function isUploadStorageEnabled() {
  if (isSpacesEnabled()) return true;
  if (requiresDigitalOceanSpacesForUploads()) return false;
  return isR2Enabled();
}

function uploadStorageUnavailableMessage() {
  if (requiresDigitalOceanSpacesForUploads()) {
    return "DigitalOcean Spaces is required for uploads in production. Configure DO_SPACES_BUCKET, DO_SPACES_REGION or DO_SPACES_ENDPOINT, DO_SPACES_KEY, DO_SPACES_SECRET, and DO_SPACES_PUBLIC_URL.";
  }
  return "No object storage (DigitalOcean Spaces or R2) is configured.";
}

function trimSlashes(s) {
  return String(s || "").replace(/\/+$/, "").replace(/^\/+/, "");
}

function tryParseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Extract object key from a known public base URL + full object URL.
 * Returns null if the URL is not under the expected base.
 */
function keyFromPublicUrl(objectUrl, publicBaseUrl) {
  const base = String(publicBaseUrl || "").trim().replace(/\/+$/, "");
  const obj = String(objectUrl || "").trim();
  if (!base || !obj) return null;

  // Most common: stored URL is `${base}/${key}`
  const directPrefix = `${base}/`;
  if (obj.startsWith(directPrefix)) return trimSlashes(obj.slice(directPrefix.length));

  // Handle minor variations (e.g. base has path, or URL parsing needed).
  const baseU = tryParseUrl(base);
  const objU = tryParseUrl(obj);
  if (!baseU || !objU) return null;
  if (baseU.origin !== objU.origin) return null;
  const basePath = baseU.pathname.replace(/\/+$/, "");
  const objPath = objU.pathname;
  if (!objPath.startsWith(`${basePath}/`)) return null;
  return trimSlashes(objPath.slice(basePath.length + 1));
}

async function deleteFromSpaces(key) {
  const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
  if (!bucket) throw new Error("Missing DO_SPACES_BUCKET");
  await getSpacesClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function deleteFromR2(key) {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
}

function isNotFoundDelete(err) {
  const status = err?.$metadata?.httpStatusCode;
  if (status === 404) return true;
  const name = String(err?.name || err?.Code || "");
  return /NoSuchKey|NotFound/i.test(name);
}

/**
 * Delete an uploaded lesson video if it belongs to our configured storage.
 * Safe no-op for local `/uploads/...` and external URLs.
 */
async function deleteLessonVideoByUrl(videoUrl) {
  const raw = String(videoUrl || "").trim();
  if (!raw) return { deleted: false, skipped: true, reason: "empty_url" };
  if (raw.startsWith("/uploads/")) return { deleted: false, skipped: true, reason: "local_uploads" };

  // Prefer Spaces if URL matches Spaces public base; otherwise try R2.
  const spacesBase = envCred("DO_SPACES_PUBLIC_URL") || process.env.DO_SPACES_PUBLIC_URL;
  const r2Base = envCred("R2_PUBLIC_URL") || process.env.R2_PUBLIC_URL;

  const spacesKey = keyFromPublicUrl(raw, spacesBase);
  if (spacesKey && isSpacesEnabled()) {
    try {
      await deleteFromSpaces(spacesKey);
      return { deleted: true, provider: "spaces", key: spacesKey };
    } catch (err) {
      if (isNotFoundDelete(err)) return { deleted: false, skipped: true, provider: "spaces", key: spacesKey };
      throw err;
    }
  }

  const r2Key = keyFromPublicUrl(raw, r2Base);
  if (r2Key && isR2Enabled()) {
    try {
      await deleteFromR2(r2Key);
      return { deleted: true, provider: "r2", key: r2Key };
    } catch (err) {
      if (isNotFoundDelete(err)) return { deleted: false, skipped: true, provider: "r2", key: r2Key };
      throw err;
    }
  }

  return { deleted: false, skipped: true, reason: "not_managed_url" };
}

let r2Client = null;
function getR2Client() {
  if (r2Client) return r2Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: envCred("R2_ACCESS_KEY_ID"),
      secretAccessKey: envCred("R2_SECRET_ACCESS_KEY"),
    },
  });
  return r2Client;
}

function getSpacesClient() {
  const regionSlug = envCred("DO_SPACES_REGION");
  const explicit = envCred("DO_SPACES_ENDPOINT");
  const endpoint = explicit || (regionSlug ? `https://${regionSlug}.digitaloceanspaces.com` : "");
  return new S3Client({
    // DO Spaces docs: signing region is often us-east-1; endpoint carries real region.
    region: "us-east-1",
    endpoint: endpoint.replace(/\/+$/, ""),
    credentials: {
      accessKeyId: envCred("DO_SPACES_KEY"),
      secretAccessKey: envCred("DO_SPACES_SECRET"),
    },
    forcePathStyle: false,
  });
}

let spacesKeyLogged = false;
function logSpacesCredentialHintOnce() {
  if (spacesKeyLogged) return;
  spacesKeyLogged = true;
  const k = envCred("DO_SPACES_KEY");
  if (!k) return;
  console.log(
    `[objectStorage] Spaces upload will use access key id length ${k.length}, prefix ${k.slice(0, 8)}… (if uploads fail, confirm this matches DigitalOcean → Connection details)`
  );
}

/**
 * Upload lesson video to R2 or DigitalOcean Spaces (key: videos/&lt;filename&gt;).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadLessonVideoFromDisk(localPath, filename) {
  const key = `videos/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = VIDEO_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    // Prefer Spaces when both are configured: stray R2_* in the OS env often breaks uploads
    // (DO keys sent to Cloudflare → "The access key ID you provided does not exist in our records").
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Upload a resource document to R2 or DigitalOcean Spaces (key: docs/<filename>).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadResourceDocumentFromDisk(localPath, filename) {
  const key = `docs/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = DOC_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Upload an upcoming-event image (key: upcoming/&lt;filename&gt;).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadUpcomingImageFromDisk(localPath, filename) {
  const key = `upcoming/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Upload a poll banner image (key: polls/&lt;filename&gt;).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadPollBannerImageFromDisk(localPath, filename) {
  const key = `polls/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Public-read image at an explicit object key (e.g. branding/amir-group-logo.png).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadPublicImageFromDisk(localPath, objectKey) {
  const key = String(objectKey || "").replace(/^\/+/, "");
  const ext = path.extname(key).toLowerCase();
  const ContentType = IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Org chart headshots (key: org-chart/&lt;filename&gt;) — public read, long cache.
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadOrgChartImageFromDisk(localPath, filename) {
  const key = `org-chart/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Upload a profile/avatar image (key: avatars/&lt;filename&gt;).
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadAvatarImageFromDisk(localPath, filename) {
  const key = `avatars/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = IMAGE_EXT_TO_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
          CacheControl: "public, max-age=31536000",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

const TICKET_ATTACHMENT_MIME = { ...DOC_EXT_TO_MIME, ...IMAGE_EXT_TO_MIME };

/**
 * IT ticket attachments (key: tickets/&lt;filename&gt;) — images + office/pdf/txt.
 * @returns {Promise<{ url: string, provider: 'r2' | 'spaces' }>}
 */
async function uploadTicketAttachmentFromDisk(localPath, filename) {
  const key = `tickets/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const ContentType = TICKET_ATTACHMENT_MIME[ext] || "application/octet-stream";
  const { size: ContentLength } = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  try {
    if (isSpacesEnabled()) {
      logSpacesCredentialHintOnce();
      const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
      await getSpacesClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ACL: "public-read",
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "spaces" };
    }

    if (isR2Enabled()) {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: stream,
          ContentLength,
          ContentType,
          ContentDisposition: "inline",
        })
      );
      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return { url: `${base}/${key}`, provider: "r2" };
    }
  } finally {
    stream.destroy();
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

const VIDEO_UPLOAD_EXTS = new Set([".mp4", ".webm", ".mov", ".mkv"]);
const DOC_UPLOAD_EXTS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt"]);
const PRESIGN_EXPIRES_SEC = 3600;

function buildStoredFilename(originalName) {
  return `${Date.now()}-${String(originalName || "file").replace(/\s/g, "_")}`;
}

function validateUploadContentLength(contentLength) {
  const maxBytes = (Number(process.env.UPLOAD_MAX_MB) || 500) * 1024 * 1024;
  const size = Number(contentLength);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("contentLength must be a positive number");
  }
  if (size > maxBytes) {
    throw new Error(`File exceeds ${Number(process.env.UPLOAD_MAX_MB) || 500} MB limit`);
  }
  return size;
}

async function presignPutObjectUpload({ key, contentType, contentLength, usePublicAcl }) {
  if (isSpacesEnabled()) {
    logSpacesCredentialHintOnce();
    const bucket = envCred("DO_SPACES_BUCKET") || String(process.env.DO_SPACES_BUCKET || "").trim();
    const params = {
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      ContentDisposition: "inline",
    };
    if (usePublicAcl) params.ACL = "public-read";
    const uploadUrl = await getSignedUrl(getSpacesClient(), new PutObjectCommand(params), {
      expiresIn: PRESIGN_EXPIRES_SEC,
    });
    const base = String(process.env.DO_SPACES_PUBLIC_URL).replace(/\/+$/, "");
    return { uploadUrl, publicUrl: `${base}/${key}`, provider: "spaces" };
  }

  if (isR2Enabled()) {
    const uploadUrl = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
        ContentDisposition: "inline",
      }),
      { expiresIn: PRESIGN_EXPIRES_SEC }
    );
    const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
    return { uploadUrl, publicUrl: `${base}/${key}`, provider: "r2" };
  }

  throw new Error("No object storage (R2 or Spaces) is configured");
}

/**
 * Presigned PUT so the browser uploads straight to object storage (skips backend disk hop).
 */
async function createPresignedVideoUpload({ originalFilename, contentType, contentLength }) {
  const ext = path.extname(String(originalFilename || "")).toLowerCase();
  if (!VIDEO_UPLOAD_EXTS.has(ext)) throw new Error("INVALID_UPLOAD_EXT");

  const size = validateUploadContentLength(contentLength);
  const filename = buildStoredFilename(originalFilename);
  const key = `videos/${filename}`;
  const resolvedType = contentType || VIDEO_EXT_TO_MIME[ext] || "application/octet-stream";
  const { uploadUrl, publicUrl, provider } = await presignPutObjectUpload({
    key,
    contentType: resolvedType,
    contentLength: size,
    usePublicAcl: isSpacesEnabled(),
  });

  return {
    direct: true,
    method: "PUT",
    uploadUrl,
    video_url: publicUrl,
    filename,
    contentType: resolvedType,
    storageProvider: provider,
  };
}

async function createPresignedDocumentUpload({ originalFilename, contentType, contentLength }) {
  const ext = path.extname(String(originalFilename || "")).toLowerCase();
  if (!DOC_UPLOAD_EXTS.has(ext)) throw new Error("INVALID_UPLOAD_EXT");

  const size = validateUploadContentLength(contentLength);
  const filename = buildStoredFilename(originalFilename);
  const key = `docs/${filename}`;
  const resolvedType = contentType || DOC_EXT_TO_MIME[ext] || "application/octet-stream";
  const { uploadUrl, publicUrl, provider } = await presignPutObjectUpload({
    key,
    contentType: resolvedType,
    contentLength: size,
    usePublicAcl: isSpacesEnabled(),
  });

  return {
    direct: true,
    method: "PUT",
    uploadUrl,
    file_url: publicUrl,
    filename,
    contentType: resolvedType,
    storageProvider: provider,
  };
}

module.exports = {
  isR2Enabled,
  isSpacesEnabled,
  isCloudStorageEnabled,
  isUploadStorageEnabled,
  requiresDigitalOceanSpacesForUploads,
  uploadStorageUnavailableMessage,
  uploadLessonVideoFromDisk,
  uploadResourceDocumentFromDisk,
  uploadUpcomingImageFromDisk,
  uploadPollBannerImageFromDisk,
  uploadPublicImageFromDisk,
  uploadOrgChartImageFromDisk,
  uploadAvatarImageFromDisk,
  uploadTicketAttachmentFromDisk,
  createPresignedVideoUpload,
  createPresignedDocumentUpload,
  deleteLessonVideoByUrl,
  DOC_EXT_TO_MIME,
  IMAGE_EXT_TO_MIME,
};
