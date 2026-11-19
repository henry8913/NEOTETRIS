/**
 * Score storage abstraction.
 *
 * Two interchangeable implementations share the same interface:
 *   - listScores(limit) -> Promise<Array<{ id, name, score, level, lines, date }>>
 *   - addScore(data)    -> Promise<{ row: { id, name, score, level, lines, date }, created: boolean }>
 *   - getStatus()       -> 'mongo' | 'memory'
 *   - close()           -> Promise<void>
 * plus a `kind` property so callers can inspect the backend synchronously.
 *
 * `addScore` accepts an optional `data.key`: the idempotency key. When a score
 * with that key already exists the original row is returned with
 * `created: false` (the caller answers 200 instead of 201) and nothing is
 * inserted. Retrying a POST after a network timeout therefore stays a no-op.
 *
 * `date` is always an ISO 8601 string and `_id` / `__v` / `key` are never exposed.
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

function toPublicEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    score: entry.score,
    level: entry.level,
    lines: entry.lines,
    date: entry.date,
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
  /** @type {Array<{ id: string, name: string, score: number, level: number, lines: number, date: string, key?: string }>} */
  let scores = [];
  /** Idempotency keys -> stored entry (mirrors `scores`). @type {Map<string, object>} */
  let byKey = new Map();

  function sortAndTrim() {
    scores.sort(
      (a, b) => b.score - a.score || Date.parse(a.date) - Date.parse(b.date),
    );
    if (scores.length > max) {
      // Forget the keys of the evicted rows: the duplicate they guarded
      // against no longer exists in the leaderboard.
      for (const dropped of scores.slice(max)) {
        if (dropped.key !== undefined) byKey.delete(dropped.key);
      }
      scores.length = max;
    }
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
      return scores.slice(0, clampLimit(limit)).map(toPublicEntry);
    },

    async addScore(data) {
      if (data.key !== undefined) {
        const existing = byKey.get(data.key);
        if (existing) return { row: toPublicEntry(existing), created: false };
      }

      const entry = {
        id: crypto.randomUUID(),
        name: data.name,
        score: data.score,
        level: data.level ?? 1,
        lines: data.lines ?? 0,
        date: new Date().toISOString(),
      };
      if (data.key !== undefined) entry.key = data.key;

      scores.push(entry);
      if (data.key !== undefined) byKey.set(data.key, entry);
      sortAndTrim();

      return { row: toPublicEntry(entry), created: true };
    },

    /** Drops every score — used by tests. */
    reset() {
      scores = [];
      byKey = new Map();
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
    // Optional client idempotency key. Sparse + unique: rows without a key
    // are not indexed, so legacy inserts stay unaffected.
    key: { type: String },
  },
  { versionKey: false, minimize: false },
);

scoreSchema.index({ score: -1, date: 1 });
scoreSchema.index({ key: 1 }, { unique: true, sparse: true });

/**
 * True for a MongoDB duplicate-key failure (unique index violation).
 *
 * @param {unknown} err
 */
function isDuplicateKeyError(err) {
  return Boolean(err) && typeof err === 'object' && err.code === 11000;
}

/**
 * @param {import('mongoose').Connection} connection active mongoose connection
 */
export function createMongoStore(connection) {
  const Score = connection.models.Score || connection.model('Score', scoreSchema);

  // The unique index is what makes two concurrent first attempts safe: one
  // insert wins, the other gets E11000 and re-reads the winner. Waiting for it
  // here (once, memoised) closes the window before the very first keyed insert.
  const indexesReady = Promise.resolve()
    .then(() => Score.createIndexes())
    .catch(() => {});

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
      const hasKey = data.key !== undefined;

      if (hasKey) {
        await indexesReady;

        const existing = await Score.findOne({ key: data.key }).lean();
        if (existing) return { row: toPublicScore(existing), created: false };
      }

      try {
        const doc = await Score.create({
          name: data.name,
          score: data.score,
          level: data.level ?? 1,
          lines: data.lines ?? 0,
          date: new Date(),
          ...(hasKey ? { key: data.key } : {}),
        });

        return { row: toPublicScore(doc.toObject()), created: true };
      } catch (err) {
        // Lost a race against a concurrent retry with the same key: the row
        // exists, so answer exactly like the pre-check would have.
        if (hasKey && isDuplicateKeyError(err)) {
          const existing = await Score.findOne({ key: data.key }).lean();
          if (existing) return { row: toPublicScore(existing), created: false };
        }
        throw err;
      }
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
