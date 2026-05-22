/**
 * Upload org-chart headshots to DigitalOcean Spaces (or R2) using backend/.env.
 *
 * Single file (object key is always under org-chart/):
 *   node scripts/upload-org-chart-to-spaces.js <localPath> <filenameInBucket.ext>
 *   node scripts/upload-org-chart-to-spaces.js ./maurizio.png maurizio-calconi.png
 *
 * Whole directory (*.png, *.jpg, *.jpeg, *.webp — keeps basenames, collisions overwrite):
 *   node scripts/upload-org-chart-to-spaces.js --dir "C:\path\to\images"
 *
 * Optional: ORG_CHART_PREFIX=my-batch/  → keys org-chart/my-batch/foo.png
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const {
  uploadOrgChartImageFromDisk,
  isSpacesEnabled,
  isR2Enabled,
} = require("../src/services/objectStorage.service");

const IMAGE_RE = /\.(png|jpe?g|webp)$/i;

function safePrefix() {
  const p = String(process.env.ORG_CHART_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
  return p ? `${p}/` : "";
}

async function uploadOne(absLocal, filenameInOrgChart) {
  const prefix = safePrefix();
  const keyName = `${prefix}${filenameInOrgChart}`.replace(/\\/g, "/").replace(/^\/+/, "");
  const { url, provider } = await uploadOrgChartImageFromDisk(absLocal, keyName);
  return { key: `org-chart/${keyName}`, url, provider };
}

async function main() {
  if (!isSpacesEnabled() && !isR2Enabled()) {
    console.error("Configure DigitalOcean Spaces (DO_SPACES_*) or Cloudflare R2 (R2_*) in backend/.env.");
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    console.log(`Usage:
  node scripts/upload-org-chart-to-spaces.js <localPath> <filenameInBucket.ext>
  node scripts/upload-org-chart-to-spaces.js --dir <folderWithImages>
Env: ORG_CHART_PREFIX=subfolder/  (optional, prepended inside org-chart/)`);
    process.exit(0);
  }

  const out = [];

  if (argv[0] === "--dir") {
    const dir = path.resolve(argv[1] || "");
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      console.error("Missing or invalid directory after --dir");
      process.exit(1);
    }
    const names = fs.readdirSync(dir).filter((n) => IMAGE_RE.test(n));
    if (!names.length) {
      console.error("No image files found in directory.");
      process.exit(1);
    }
    for (const n of names.sort()) {
      const abs = path.join(dir, n);
      const r = await uploadOne(abs, n);
      out.push(r);
      console.log(r.url);
    }
  } else if (argv.length >= 2) {
    const localPath = path.resolve(argv[0]);
    const destName = argv[1];
    if (!fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
      console.error("Local file not found:", localPath);
      process.exit(1);
    }
    if (!IMAGE_RE.test(destName)) {
      console.error("Destination name should end with .png, .jpg, .jpeg, or .webp");
      process.exit(1);
    }
    const r = await uploadOne(localPath, destName);
    out.push(r);
    console.log(r.url);
  } else {
    console.error("Usage: node scripts/upload-org-chart-to-spaces.js <localPath> <org-chart-filename.ext>");
    console.error("   or: node scripts/upload-org-chart-to-spaces.js --dir <folderWithImages>");
    process.exit(1);
  }

  console.log("\nJSON (for records):\n" + JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
