/**
 * Upload frontend/public/amir-group-logo.png to Spaces for reliable email embedding.
 * Run: node scripts/upload-email-logo-to-spaces.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { uploadPublicImageFromDisk, isSpacesEnabled, isR2Enabled } = require("../src/services/objectStorage.service");

async function main() {
  if (!isSpacesEnabled() && !isR2Enabled()) {
    console.error("Configure DO_SPACES_* or R2_* in backend/.env first.");
    process.exit(1);
  }

  const localPath = path.join(__dirname, "..", "..", "frontend", "public", "amir-group-logo.png");
  const { url, provider } = await uploadPublicImageFromDisk(localPath, "branding/amir-group-logo.png");
  console.log("Uploaded email logo via", provider);
  console.log(url);
  console.log("\nOptional: set on Render API Environment:");
  console.log(`EMAIL_LOGO_URL=${url}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
