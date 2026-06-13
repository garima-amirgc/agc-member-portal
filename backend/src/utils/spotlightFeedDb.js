const DEFAULT_WIDGET_ORDER = ["new-hires", "customer-wins", "community-involvement"];

const SPOTLIGHT_ORDER_KEY = "home_spotlight_widget_order";

const SPOTLIGHT_PUBLISHED_ORDER = "sort_order ASC, created_at DESC, id DESC";

function normalizeWidgetOrder(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_WIDGET_ORDER];
  const allowed = new Set(DEFAULT_WIDGET_ORDER);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const key = String(item || "").trim();
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  for (const key of DEFAULT_WIDGET_ORDER) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

async function readWidgetOrder(db) {
  try {
    const row = await db.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = ?").get(SPOTLIGHT_ORDER_KEY);
    if (!row?.setting_value) return [...DEFAULT_WIDGET_ORDER];
    const parsed = JSON.parse(String(row.setting_value));
    return normalizeWidgetOrder(parsed);
  } catch {
    return [...DEFAULT_WIDGET_ORDER];
  }
}

async function writeWidgetOrder(db, order) {
  const normalized = normalizeWidgetOrder(order);
  const now = new Date().toISOString();
  const value = JSON.stringify(normalized);
  const existing = await db.prepare("SELECT setting_key FROM portal_settings WHERE setting_key = ?").get(SPOTLIGHT_ORDER_KEY);
  if (existing) {
    await db
      .prepare("UPDATE portal_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?")
      .run(value, now, SPOTLIGHT_ORDER_KEY);
  } else {
    await db
      .prepare("INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)")
      .run(SPOTLIGHT_ORDER_KEY, value, now);
  }
  return normalized;
}

async function nextSortOrder(db, table) {
  const row = await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${table}`).get();
  return Number(row?.m || 0) + 1;
}

async function moveSpotlightEntry(db, table, id, direction) {
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    const err = new Error("Invalid id.");
    err.statusCode = 400;
    throw err;
  }
  const dir = String(direction || "").trim().toLowerCase();
  if (dir !== "up" && dir !== "down") {
    const err = new Error('Direction must be "up" or "down".');
    err.statusCode = 400;
    throw err;
  }

  const rows = await db.prepare(`SELECT id, sort_order FROM ${table} ORDER BY sort_order ASC, created_at DESC, id DESC`).all();
  const idx = rows.findIndex((r) => Number(r.id) === entryId);
  if (idx < 0) {
    const err = new Error("Entry not found.");
    err.statusCode = 404;
    throw err;
  }

  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return rows;

  const a = rows[idx];
  const b = rows[swapIdx];
  const aOrder = Number(a.sort_order) || 0;
  const bOrder = Number(b.sort_order) || 0;
  const now = new Date().toISOString();

  await db.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(bOrder, now, a.id);
  await db.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`).run(aOrder, now, b.id);

  return db.prepare(`SELECT * FROM ${table} ORDER BY sort_order ASC, created_at DESC, id DESC`).all();
}

module.exports = {
  DEFAULT_WIDGET_ORDER,
  SPOTLIGHT_PUBLISHED_ORDER,
  normalizeWidgetOrder,
  readWidgetOrder,
  writeWidgetOrder,
  nextSortOrder,
  moveSpotlightEntry,
};
