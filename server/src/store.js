/**
 * Score storage abstraction.
 *
 * Two interchangeable implementations share the same interface:
 *   - listScores(limit) -> Promise<Array<{ id, name, score, level, lines, date }>>
 *   - addScore(data)    -> Promise<{ id, name, score, level, lines, date }>
 *   - getStatus()       -> 'mongo' | 'memory'
 *   - close()           -> Promise<void>
 * plus a `kind` property so callers can inspect the backend synchronously.
 *
 * `date` is always an ISO 8601 string and `_id` / `__v` are never exposed.
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';

export const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/tetris';
export const DEFAULT_LIMIT = 10;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 50;
export const MAX_MEMORY_SCORES = 200;
export const MONGO_SELECTION_TIMEOUT_MS = 3000;

/**
 * Clamps a requested limit into [MIN_LIMIT, MAX_LIMIT].
 * Non numeric input falls back to DEFAULT_LIMIT.
 *
 * @param {unknown} limit
 * @returns {number}
 */
export function clampLimit(limit) {
  if (limit === undefined || limit === null || limit === '') return DEFAULT_LIMIT;

  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(parsed), MIN_LIMIT), MAX_LIMIT);
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toPublicScore(doc) {
  return {
    id: String(doc._id ?? doc.id),
    name: doc.name,
    score: doc.score,
    level: doc.level,
    lines: doc.lines,
    date: toIsoDate(doc.date),
  };
}

// ---------------------------------------------------------------------------
// Memory store
// ---------------------------------------------------------------------------

/**
 * In-memory store: keeps at most `max` scores ordered by score desc, date asc.
 * Handy for local dev, CI and any environment without MongoDB.
 *
 * @param {{ max?: number }} [options]
 */
export function createMemoryStore({ max = MAX_MEMORY_SCORES } = {}) {
  /** @type {Array<{ id: string, name: string, score: number, level: number, lines: number, date: string }>} */
  let scores = [];

  function sortAndTrim() {
    scores.sort(
      (a, b) => b.score - a.score || Date.parse(a.date) - Date.parse(b.date),
    );
    if (scores.length > max) scores.length = max;
  }

  return {
    kind: 'memory',

    getStatus() {
      return 'memory';
    },

    /** Number of scores currently held (capped at `max`). */
    get size() {
      return scores.length;
    },

    async listScores(limit = DEFAULT_LIMIT) {
      return scores.slice(0, clampLimit(limit)).map((score) => ({ ...score }));
    },

    async addScore(data) {
      const entry = {
        id: crypto.randomUUID(),
        name: data.name,
        score: data.score,
        level: data.level ?? 1,
        lines: data.lines ?? 0,
        date: new Date().toISOString(),
      };

      scores.push(entry);
      sortAndTrim();

      return { ...entry };
    },

    /** Drops every score — used by tests. */
    reset() {
      scores = [];
    },

    async close() {
      // nothing to release
    },
  };
}

// ---------------------------------------------------------------------------
// Mongo store
// ---------------------------------------------------------------------------

export const scoreSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Anonymous', maxlength: 20, trim: true },
    score: { type: Number, required: true, min: 0 },
    level: { type: Number, default: 1 },
    lines: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
  },
  { versionKey: false, minimize: false },
);

scoreSchema.index({ score: -1, date: 1 });

/**
 * @param {import('mongoose').Connection} connection active mongoose connection
 */
export function createMongoStore(connection) {
  const Score = connection.models.Score || connection.model('Score', scoreSchema);

  return {
    kind: 'mongo',

    getStatus() {
      return 'mongo';
    },

    async listScores(limit = DEFAULT_LIMIT) {
      const docs = await Score.find({})
        .sort({ score: -1, date: 1 })
        .limit(clampLimit(limit))
        .lean();

      return docs.map(toPublicScore);
    },

    async addScore(data) {
      const doc = await Score.create({
        name: data.name,
        score: data.score,
        level: data.level ?? 1,
        lines: data.lines ?? 0,
        date: new Date(),
      });

      return toPublicScore(doc.toObject());
    },

    async close() {
      await connection.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Tries to connect to MongoDB, falling back to the memory store on any failure.
 * Never rejects: the server must boot even when Mongo is absent.
 *
 * @param {{
 *   mongoUri?: string,
 *   serverSelectionTimeoutMS?: number,
 *   logger?: Pick<Console, 'log' | 'warn'>,
 * }} [options]
 */
export async function createStore({
  mongoUri = DEFAULT_MONGO_URI,
  serverSelectionTimeoutMS = MONGO_SELECTION_TIMEOUT_MS,
  logger = console,
} = {}) {
  if (!mongoUri) {
    logger.warn('[store] No MONGO_URI configured — using in-memory store (scores will not persist).');
    return createMemoryStore();
  }

  let connection;
  try {
    connection = mongoose.createConnection(mongoUri, {
      serverSelectionTimeoutMS,
      connectTimeoutMS: serverSelectionTimeoutMS,
    });

    // Never let a later connection error become an uncaught EventEmitter throw.
    // Startup failures are reported by the catch block below, so keep this quiet
    // until we know the connection was actually established.
    let connected = false;
    connection.on('error', (err) => {
      if (connected) logger.warn(`[store] MongoDB connection error: ${err.message}`);
    });

    await connection.asPromise();
    connected = true;
    logger.log('[store] MongoDB connected — scores are persisted.');
    return createMongoStore(connection);
  } catch (err) {
    if (connection) {
      await connection.close().catch(() => {});
    }
    logger.warn(
      `[store] MongoDB unavailable (${err.message}) — using in-memory store (scores will not persist).`,
    );
    return createMemoryStore();
  }
}
