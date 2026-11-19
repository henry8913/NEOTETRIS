/**
 * Express application factory.
 *
 * No `listen()` here: `createApp()` is pure so tests can mount it on an
 * ephemeral port. See `index.js` for the runnable entry point.
 */

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clampLimit } from './store.js';
import { validateScorePayload } from './validation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** <repo>/client/dist — resolved from server/src/app.js */
export const DEFAULT_STATIC_DIR = path.resolve(HERE, '../../client/dist');

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX = 30;

/**
 * Tiny in-memory, per-IP fixed-window limiter.
 * Applied to POST /api/scores only.
 */
function createRateLimiter({ windowMs, max }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    if (req.method !== 'POST') return next();

    const now = Date.now();
    sweep(now);

    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests', retryAfter });
    }

    return next();
  };
}

/**
 * @param {{
 *   store: ReturnType<typeof import('./store.js').createMemoryStore>,
 *   corsOrigin?: string,
 *   rateLimit?: boolean | { windowMs?: number, max?: number },
 *   staticDir?: string | null,
 *   logger?: Pick<Console, 'error' | 'warn'>,
 * }} options
 * @returns {import('express').Express}
 */
export function createApp({
  store,
  corsOrigin = '*',
  rateLimit = true,
  staticDir = DEFAULT_STATIC_DIR,
  logger = console,
} = {}) {
  if (!store) throw new TypeError('createApp requires a store');

  const app = express();
  app.disable('x-powered-by');

  app.use(cors({ origin: corsOrigin || '*' }));
  app.use(express.json({ limit: '10kb' }));

  if (rateLimit !== false) {
    const custom = typeof rateLimit === 'object' && rateLimit !== null ? rateLimit : {};
    app.use(
      '/api/scores',
      createRateLimiter({
        windowMs: custom.windowMs ?? RATE_LIMIT_WINDOW_MS,
        max: custom.max ?? RATE_LIMIT_MAX,
      }),
    );
  }

  // --- health -------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: store.getStatus(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // --- scores -------------------------------------------------------------
  app.get('/api/scores', async (req, res, next) => {
    try {
      const raw = req.query.limit;

      if (raw !== undefined && (Array.isArray(raw) || !/^-?\d+$/.test(String(raw)))) {
        return res.status(400).json({ error: 'Invalid limit', details: ['limit must be an integer'] });
      }

      const scores = await store.listScores(clampLimit(raw));
      return res.json(scores);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/scores', async (req, res, next) => {
    try {
      const result = validateScorePayload(req.body);

      if (!result.ok) {
        return res.status(400).json({ error: 'Invalid payload', details: result.errors });
      }

      // 200 = the idempotency key was already known, 201 = a new row.
      const { row, created } = await store.addScore(result.value);
      return res.status(created ? 201 : 200).json(row);
    } catch (err) {
      return next(err);
    }
  });

  // --- unknown API routes -------------------------------------------------
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // --- optional SPA static hosting ---------------------------------------
  const indexHtml = staticDir ? path.join(staticDir, 'index.html') : null;
  const hasStatic = Boolean(indexHtml && fs.existsSync(indexHtml));

  if (hasStatic) {
    app.use(express.static(staticDir));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(indexHtml, (err) => {
        if (err) next(err);
      });
    });
  }

  // --- error handler ------------------------------------------------------
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);

    let status = err.status || err.statusCode || 500;

    if (err.type === 'entity.parse.failed') status = 400;
    else if (err.type === 'entity.too.large') status = 413;

    if (status >= 500) logger.error('[api] Unhandled error:', err);

    const isProduction = process.env.NODE_ENV === 'production';
    const message =
      status >= 500
        ? isProduction
          ? 'Internal server error'
          : err.message || 'Internal server error'
        : err.message || 'Bad request';

    return res.status(status).json({ error: message });
  });

  return app;
}
