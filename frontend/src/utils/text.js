/**
 * Trims to at most `maxWords` words; appends "..." when truncated.
 * @param {string | null | undefined} text
 * @param {number} [maxWords]
 */
export function truncateWords(text, maxWords = 200) {
  if (text == null || typeof text !== "string") return "";
  const s = text.trim();
  if (!s) return "";
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return s;
  return `${words.slice(0, maxWords).join(" ")}...`;
}
