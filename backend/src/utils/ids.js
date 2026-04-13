/** Parse a positive integer id from JSON body / query (often arrives as string). */
function parsePositiveInt(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

module.exports = { parsePositiveInt };
