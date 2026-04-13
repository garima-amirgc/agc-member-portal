/**
 * Quick check: loads backend/.env and calls Spaces ListBuckets (same creds as the app).
 * Run: node scripts/testDoSpaces.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const { S3Client, ListBucketsCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

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

(async () => {
  const key = envCred("DO_SPACES_KEY");
  const secret = envCred("DO_SPACES_SECRET");
  const regionSlug = envCred("DO_SPACES_REGION");
  const explicit = envCred("DO_SPACES_ENDPOINT");
  const endpoint = (explicit || `https://${regionSlug}.digitaloceanspaces.com`).replace(/\/+$/, "");

  console.log("Endpoint:", endpoint);
  console.log("Access key id (len):", key.length, "starts:", key.slice(0, 8), "ends:", key.slice(-4));

  const client = new S3Client({
    region: "us-east-1",
    endpoint,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });

  const bucket = envCred("DO_SPACES_BUCKET");
  const testKey = `health-check-${Date.now()}.txt`;

  try {
    const out = await client.send(new ListBucketsCommand({}));
    console.log("ListBuckets OK:", (out.Buckets || []).map((b) => b.Name).join(", ") || "(none)");
  } catch (e) {
    console.log("ListBuckets (optional):", e.name, "- limited keys often cannot list all buckets");
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: Buffer.from("ok"),
        ContentType: "text/plain",
      })
    );
    console.log("PutObject OK:", bucket, "/", testKey);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("DeleteObject OK (cleaned up test file)");
  } catch (e) {
    console.error("PutObject FAILED:", e.name, e.message);
    process.exit(1);
  }
})();
