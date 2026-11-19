/**
 * In-memory cache for the merged leaderboard (server + local rows).
 *
 * Kept in its own module so the React component only exports a component, and
 * so both the dialog and the save flow can drop the cache without importing
 * each other. It is per-tab memory: a reload starts empty.
 */

export const CACHE_TTL_MS = 30000;

let cache = { at: 0, rows: null };

/** Fresh rows, or `null` when the entry is missing or older than the TTL. */
export function readScoreCache() {
  if (!cache.rows) return null;
  return Date.now() - cache.at < CACHE_TTL_MS ? cache.rows : null;
}

/** Stores a successful response. */
export function writeScoreCache(rows) {
  cache = { at: Date.now(), rows };
}

/** Drops the cache (called after a score is saved or on a manual refresh). */
export function invalidateScoreCache() {
  cache = { at: 0, rows: null };
}
