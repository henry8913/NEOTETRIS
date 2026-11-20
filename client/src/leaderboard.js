/**
 * Leaderboard helpers — pure functions, no DOM, no storage, no fetch.
 *
 * They are shared by the API layer (`api.js`), the persistence layer
 * (`storage.js`) and the UI, and they are the only place where "what is a
 * score and how do we order them" is decided. Keeping them pure is what makes
 * `leaderboard.test.js` runnable under plain `node --test`.
 */

export const MAX_NAME_LENGTH = 20;
export const DEFAULT_NAME = 'PLAYER';

/**
 * Replaces control characters (C0 + DEL + C1) with a space: they are never
 * valid in a display name and they would break the input line or the preview.
 */
function stripControl(value) {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
  }
  return out;
}

/**
 * Trim → drop control characters → collapse runs of whitespace → cap at 20.
 * An empty result falls back to `PLAYER`, so the server never gets a 400 for
 * a name the player did not really type.
 */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  const cleaned = stripControl(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || DEFAULT_NAME;
}

/** Timestamp of an ISO date, or `Infinity` when it cannot be parsed. */
function timeOf(iso) {
  const time = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * Leaderboard order: higher score first, then the older run first (a tie is
 * broken in favour of whoever got there first). Entries with an unparseable
 * date sort last; a non-numeric score counts as 0.
 */
export function compareScores(a, b) {
  const scoreA = Number(a?.score ?? 0);
  const scoreB = Number(b?.score ?? 0);
  const safeA = Number.isFinite(scoreA) ? scoreA : 0;
  const safeB = Number.isFinite(scoreB) ? scoreB : 0;
  if (safeB !== safeA) return safeB - safeA;
  const timeA = timeOf(a?.date);
  const timeB = timeOf(b?.date);
  if (timeA === timeB) return 0;
  return timeA - timeB;
}

/**
 * Merges two score lists into one board: dedupe by `id` (the first list wins,
 * so a server copy replaces a provisional local one), sort, truncate.
 * Malformed rows and non-arrays are ignored, so a bad response can never break
 * the panel.
 *
 * The global board is **not** a merge any more: when the server answers, the
 * leaderboard renders its rows only (the shared ranking is the single source of
 * truth). This helper now serves the offline board — `mergeScores([],
 * loadLocalScores())` — where deduping and sorting the device's own runs is
 * still exactly what the `LOCAL` view needs.
 */
export function mergeScores(remote, local, limit = 10) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  const seen = new Set();
  const merged = [];

  for (const list of [remote, local]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const id = item.id == null || item.id === '' ? null : String(item.id);
      if (id !== null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(item);
    }
  }

  merged.sort(compareScores);
  return merged.slice(0, max);
}

/**
 * 1-based position of a score in a list. An entry (object with `id`) is looked
 * up by id; a bare number by value. `null` when it is not in the list.
 */
export function rankOf(score, scores = []) {
  if (!Array.isArray(scores) || scores.length === 0) return null;

  if (score && typeof score === 'object') {
    const id = score.id == null || score.id === '' ? null : String(score.id);
    if (id !== null) {
      const index = scores.findIndex((row) => row && row.id != null && String(row.id) === id);
      return index === -1 ? null : index + 1;
    }
  }

  const value = Number(score && typeof score === 'object' ? score.score : score);
  if (!Number.isFinite(value)) return null;
  const index = scores.findIndex((row) => Number(row?.score) === value);
  return index === -1 ? null : index + 1;
}

/** True when `score` beats the stored best (a fresh record, or no best yet). */
export function isRecord(score, best) {
  const value = Number(score);
  if (!Number.isFinite(value)) return false;
  const previous = Number(best?.score ?? 0);
  return value > (Number.isFinite(previous) ? previous : 0);
}

/**
 * Product rule: a run that ends on 0 is not a score, so the client never
 * offers to save it, never POSTs it, never writes it to `neotetris.best` /
 * `neotetris.scores` and never opens the rankings for it. The server stays
 * permissive on purpose (`score >= 0` is accepted for API compatibility):
 * this is a client-side decision, kept in one pure place so the prompt, the
 * submit path and the local persistence cannot disagree.
 */
export function shouldOfferSave(score) {
  const value = Number(score);
  return Number.isFinite(value) && value > 0;
}

/** Short `DD/MM` label (UTC, so a run never shifts day by timezone). */
export function formatDate(iso) {
  const time = timeOf(iso);
  if (!Number.isFinite(time)) return '--';
  const date = new Date(time);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}
