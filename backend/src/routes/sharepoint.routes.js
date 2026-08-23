const express = require("express");
const multer = require("multer");
const { authRequired } = require("../middleware/auth");
const { requireAdminGrant } = require("../middleware/adminGrants");
const { ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const sp = require("../services/sharepoint.service");

const router = express.Router();

function handleError(res, e, fallbackMessage) {
  if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
  console.error("[sharepoint]", e);
  return res.status(500).json({ message: fallbackMessage || "Something went wrong." });
}

router.use(authRequired, requireAdminGrant(ADMIN_GRANT_KEYS.SHAREPOINT));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get("/status", (req, res) => {
  res.json({ configured: sp.isConfigured() });
});

router.get("/sites", async (req, res) => {
  try {
    res.json(await sp.searchSites(req.query.q));
  } catch (e) {
    handleError(res, e, "Could not search SharePoint sites.");
  }
});

router.get("/sites/:siteId/drives", async (req, res) => {
  try {
    res.json(await sp.listSiteDrives(req.params.siteId));
  } catch (e) {
    handleError(res, e, "Could not list document libraries for that site.");
  }
});

router.get("/browse", async (req, res) => {
  try {
    const { driveId, itemId } = req.query;
    if (!driveId) return res.status(400).json({ message: "driveId is required." });
    res.json(await sp.listFolder({ driveId, itemId: itemId || null }));
  } catch (e) {
    handleError(res, e, "Could not load that folder.");
  }
});

router.get("/download", async (req, res) => {
  try {
    const { driveId, itemId } = req.query;
    if (!driveId || !itemId) return res.status(400).json({ message: "driveId and itemId are required." });
    const { nodeStream, meta } = await sp.getDownloadStream({ driveId, itemId });
    const safeName = String(meta.name || "file").replace(/["\r\n]/g, "");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    if (meta.size) res.setHeader("Content-Length", String(meta.size));
    if (meta.file?.mimeType) res.setHeader("Content-Type", meta.file.mimeType);
    nodeStream.on("error", (err) => {
      console.error("[sharepoint] download stream error:", err);
      if (!res.headersSent) res.status(502).json({ message: "Download failed partway through." });
      else res.end();
    });
    nodeStream.pipe(res);
  } catch (e) {
    handleError(res, e, "Could not download that file.");
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { driveId, parentItemId } = req.body;
    if (!driveId || !req.file) return res.status(400).json({ message: "driveId and a file are required." });
    const item = await sp.uploadFile({
      driveId,
      parentItemId: parentItemId || null,
      filename: req.file.originalname,
      buffer: req.file.buffer,
    });
    res.json(item);
  } catch (e) {
    handleError(res, e, "Could not upload that file to SharePoint.");
  }
});

router.post("/folders", async (req, res) => {
  try {
    const { driveId, parentItemId, name } = req.body;
    if (!driveId || !name || !String(name).trim()) {
      return res.status(400).json({ message: "driveId and a folder name are required." });
    }
    const item = await sp.createFolder({ driveId, parentItemId: parentItemId || null, name: String(name).trim() });
    res.json(item);
  } catch (e) {
    handleError(res, e, "Could not create that folder.");
  }
});

module.exports = router;
