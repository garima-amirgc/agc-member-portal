/**
 * Copy existing local `/uploads/...` files to DigitalOcean Spaces and update DB URLs.
 *
 * Run only on a machine/server where the referenced local files still exist:
 *   node scripts/migrate-local-uploads-to-spaces.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const dbModule = require("../src/config/db");
const { resolveLocalUploadFileUrl } = require("../src/services/storage.service");
const {
  isSpacesEnabled,
  uploadLessonVideoFromDisk,
  uploadResourceDocumentFromDisk,
  uploadUpcomingImageFromDisk,
  uploadPollBannerImageFromDisk,
  uploadAvatarImageFromDisk,
  uploadTicketAttachmentFromDisk,
} = require("../src/services/objectStorage.service");

function basenameFromUploadUrl(uploadUrl) {
  const localPath = resolveLocalUploadFileUrl(uploadUrl);
  return localPath ? path.basename(localPath) : "";
}

async function migrateUrl({ label, id, uploadUrl, uploader, update }) {
  const localPath = resolveLocalUploadFileUrl(uploadUrl);
  if (!localPath) {
    return { status: "missing", label, id, from: uploadUrl };
  }

  const filename = basenameFromUploadUrl(uploadUrl);
  const { url } = await uploader(localPath, filename);
  await update(url);
  return { status: "migrated", label, id, from: uploadUrl, to: url };
}

async function migrateTableUrls({ db, label, selectSql, updateSql, urlColumn, uploader }) {
  const rows = await db.prepare(selectSql).all();
  const results = [];
  for (const row of rows) {
    const id = row.id;
    const uploadUrl = row[urlColumn];
    results.push(
      await migrateUrl({
        label,
        id,
        uploadUrl,
        uploader,
        update: (newUrl) => db.prepare(updateSql).run(newUrl, id),
      })
    );
  }
  return results;
}

async function migrateTicketAttachments(db) {
  const rows = await db
    .prepare("SELECT id, attachments FROM it_tickets WHERE attachments LIKE '%/uploads/tickets/%'")
    .all();
  const results = [];

  for (const row of rows) {
    let arr;
    try {
      arr = JSON.parse(String(row.attachments || ""));
    } catch {
      results.push({ status: "invalid_json", label: "ticket attachment", id: row.id });
      continue;
    }
    if (!Array.isArray(arr)) continue;

    let changed = false;
    for (const item of arr) {
      const uploadUrl = String(item?.url || "").trim();
      if (!uploadUrl.startsWith("/uploads/tickets/")) continue;
      const migrated = await migrateUrl({
        label: "ticket attachment",
        id: row.id,
        uploadUrl,
        uploader: uploadTicketAttachmentFromDisk,
        update: async (newUrl) => {
          item.url = newUrl;
          changed = true;
        },
      });
      results.push(migrated);
    }

    if (changed) {
      await db.prepare("UPDATE it_tickets SET attachments = ? WHERE id = ?").run(JSON.stringify(arr), row.id);
    }
  }

  return results;
}

async function main() {
  if (!isSpacesEnabled()) {
    throw new Error("DigitalOcean Spaces is not configured. Set DO_SPACES_* env vars before running.");
  }

  await dbModule.initDb();
  const db = dbModule.db;

  const groups = [
    await migrateTableUrls({
      db,
      label: "avatar",
      selectSql: "SELECT id, profile_image_url FROM users WHERE profile_image_url LIKE '/uploads/avatars/%'",
      updateSql: "UPDATE users SET profile_image_url = ? WHERE id = ?",
      urlColumn: "profile_image_url",
      uploader: uploadAvatarImageFromDisk,
    }),
    await migrateTableUrls({
      db,
      label: "lesson video",
      selectSql: "SELECT id, video_url FROM lessons WHERE video_url LIKE '/uploads/%'",
      updateSql: "UPDATE lessons SET video_url = ? WHERE id = ?",
      urlColumn: "video_url",
      uploader: uploadLessonVideoFromDisk,
    }),
    await migrateTableUrls({
      db,
      label: "resource document",
      selectSql: "SELECT id, file_url FROM resource_documents WHERE file_url LIKE '/uploads/docs/%'",
      updateSql: "UPDATE resource_documents SET file_url = ? WHERE id = ?",
      urlColumn: "file_url",
      uploader: uploadResourceDocumentFromDisk,
    }),
    await migrateTableUrls({
      db,
      label: "upcoming image",
      selectSql: "SELECT id, image_url FROM facility_upcoming WHERE image_url LIKE '/uploads/upcoming/%'",
      updateSql: "UPDATE facility_upcoming SET image_url = ? WHERE id = ?",
      urlColumn: "image_url",
      uploader: uploadUpcomingImageFromDisk,
    }),
    await migrateTableUrls({
      db,
      label: "poll banner",
      selectSql: "SELECT id, banner_image_url FROM polls WHERE banner_image_url LIKE '/uploads/polls/%'",
      updateSql: "UPDATE polls SET banner_image_url = ? WHERE id = ?",
      urlColumn: "banner_image_url",
      uploader: uploadPollBannerImageFromDisk,
    }),
    await migrateTicketAttachments(db),
  ];

  const results = groups.flat();
  const migrated = results.filter((r) => r.status === "migrated");
  const missing = results.filter((r) => r.status === "missing");
  const invalid = results.filter((r) => r.status === "invalid_json");

  for (const r of migrated) console.log(`Migrated ${r.label} #${r.id}: ${r.to}`);
  for (const r of missing) console.warn(`Missing local file for ${r.label} #${r.id}: ${r.from}`);
  for (const r of invalid) console.warn(`Invalid attachments JSON for ticket #${r.id}`);

  console.log(`Done. Migrated ${migrated.length}; missing ${missing.length}; invalid ${invalid.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
