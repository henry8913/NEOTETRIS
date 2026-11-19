import { compareScores, normalizeName } from './leaderboard.js';

/**
 * Safe `localStorage` wrapper. Every access is guarded: private mode, a
 * disabled storage and SSR all degrade to "works in memory for this session"
 * instead of throwing, and a corrupted value is treated as missing.
 */

const NAME_KEY = 'neotetris.player';
const BEST_KEY = 'neotetris.best';
const SCORES_KEY = 'neotetris.scores';

/** How many runs are kept on the device (the panel shows at most 10). */
export const MAX_LOCAL_SCORES = 20;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(key) {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* blocked storage: the value simply does not survive the reload */
  }
}

function removeRaw(key) {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readJSON(key) {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* not serialisable: never let persistence break the game */
  }
}

function makeId() {
  const stamp = Date.now().toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `local-${stamp}-${salt}`;
}

/** Coerces a stored/created row into `{ id, name, score, level, lines, date }`. */
function toEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const score = Number(raw.score);
  if (!Number.isFinite(score) || score < 0) return null;

  const level = Number(raw.level);
  const lines = Number(raw.lines);
  const id = raw.id == null || raw.id === '' ? makeId() : String(raw.id);
  const date = typeof raw.date === 'string' && Number.isFinite(Date.parse(raw.date))
    ? raw.date
    : new Date().toISOString();

  return {
    id,
    name: normalizeName(typeof raw.name === 'string' ? raw.name : ''),
    score: Math.trunc(score),
    level: Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1,
    lines: Number.isFinite(lines) ? Math.max(0, Math.trunc(lines)) : 0,
    date,
  };
}

function sortAndCap(list) {
  return [...list].sort(compareScores).slice(0, MAX_LOCAL_SCORES);
}

/** Last name the player used (normalised, `PLAYER` when nothing is stored). */
export function loadName() {
  return normalizeName(readRaw(NAME_KEY) ?? '');
}

/** Remembers the name for the next game over. */
export function saveName(name) {
  writeRaw(NAME_KEY, normalizeName(name));
}

/** Best local run, or `null` when there is none. */
export function loadBest() {
  const raw = readJSON(BEST_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const score = Number(raw.score);
  if (!Number.isFinite(score)) return null;
  const level = Number(raw.level);
  const lines = Number(raw.lines);
  return {
    score: Math.trunc(score),
    level: Number.isFinite(level) ? Math.trunc(level) : 1,
    lines: Number.isFinite(lines) ? Math.trunc(lines) : 0,
    date: typeof raw.date === 'string' ? raw.date : '',
  };
}

/** Stores the best run (only call it when the run actually beats it). */
export function saveBest({ score, level, lines, date } = {}) {
  const value = Number(score);
  if (!Number.isFinite(value)) return;
  writeJSON(BEST_KEY, {
    score: Math.trunc(value),
    level: Number.isFinite(Number(level)) ? Math.trunc(Number(level)) : 1,
    lines: Number.isFinite(Number(lines)) ? Math.trunc(Number(lines)) : 0,
    date: typeof date === 'string' && date ? date : new Date().toISOString(),
  });
}

/** Local runs, best first, capped at 20. Corrupted rows are dropped. */
export function loadLocalScores() {
  const raw = readJSON(SCORES_KEY);
  if (!Array.isArray(raw)) return [];
  const entries = [];
  for (const item of raw) {
    const entry = toEntry(item);
    if (entry) entries.push(entry);
  }
  return sortAndCap(entries);
}

/**
 * Adds one run to the local list and returns the stored entry (with the id it
 * was saved under, so the UI can rank and highlight it). Keeping the id stable
 * is what lets `mergeScores` dedupe a server row against its local copy.
 */
export function saveLocalScore(entry) {
  const stored = toEntry(entry ?? {});
  if (!stored) return null;

  const existing = loadLocalScores().filter((row) => row.id !== stored.id);
  const next = sortAndCap([...existing, stored]);
  writeJSON(SCORES_KEY, next);
  return stored;
}

/** Removes one local run (used to retire the offline copy after a retry). */
export function removeLocalScore(id) {
  if (id == null) return;
  const key = String(id);
  const next = loadLocalScores().filter((row) => row.id !== key);
  writeJSON(SCORES_KEY, next);
}

/** Wipes every NEOTETRIS key — used by tests and by a future "reset" action. */
export function clearAll() {
  removeRaw(NAME_KEY);
  removeRaw(BEST_KEY);
  removeRaw(SCORES_KEY);
}
