/**
 * Lightweight fuzzy search utilities.
 * No external dependencies — pure TS, safe for server and client.
 */

/**
 * Wagner-Fischer Levenshtein distance.
 * O(m*n) time and space — acceptable for short strings (plates, names < 50 chars).
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }

  return dp[n];
}

/**
 * Scores a query against a candidate string.
 * Returns 0-100 where higher = better match.
 *
 * Priority:
 *   100 — exact match
 *    80 — prefix match
 *    60 — contains (substring)
 *    40 — fuzzy (Levenshtein ≤ 2)
 *     0 — no match
 */
export function scoreMatch(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (!q) return 0;

  if (c === q) return 100;
  if (c.startsWith(q)) return 80;
  if (c.includes(q)) return 60;
  if (q.length >= 3 && levenshtein(q, c.slice(0, q.length + 2)) <= 2) return 40;
  return 0;
}

/**
 * Ranks an array of items by their best field match against the query.
 * Items with score 0 are excluded.
 * Returns items sorted by score descending, with score attached.
 */
export function rankSuggestions<T>(
  query: string,
  items: T[],
  getFields: (item: T) => string[],
): Array<T & { score: number }> {
  const scored = items
    .map((item) => {
      const fields = getFields(item).filter(Boolean);
      const score = Math.max(0, ...fields.map((f) => scoreMatch(query, f)));
      return { ...item, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
