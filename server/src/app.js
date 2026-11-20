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

import { readBuildTag } from './buildInfo.js';
import { clampLimit } from './store.js';
import { validateScorePayload } from './validation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** <repo>/client/dist — resolved from server/src/app.js */
export const DEFAULT_STATIC_DIR = path.resolve(HERE, '../../client/dist');

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX = 30;

/**
 * Cache policy of the SPA document. A tab that keeps a stale shell can never be
 * refreshed by the "new version available" probe, so the document itself is
 * un-cacheable: every navigation hits the network.
 */
export const DOCUMENT_CACHE_CONTROL = 'no-store, no-cache, must-revalidate';

/**
 * `no-store` plus the pre-HTTP/1.1 equivalents, for old WebViews and proxies
 * that ignore it. Hashed assets under `/assets/` are untouched.
 */
function setDocumentCacheHeaders(res) {
  res.setHeader('Cache-Control', DOCUMENT_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/** `setHeaders` for `express.static`: only HTML documents lose their cache. */
function setStaticHeaders(res, filePath) {
  if (/\.html?$/i.test(filePath)) setDocumentCacheHeaders(res);
}

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

  // --- static dir / deployed build ---------------------------------------
  // Resolved once per process: the build tag only changes on a redeploy, so
  // `/api/health` is stable for the lifetime of this server.
  const indexHtml = staticDir ? path.join(staticDir, 'index.html') : null;
  const hasStatic = Boolean(indexHtml && fs.existsSync(indexHtml));
  const build = hasStatic ? readBuildTag(indexHtml) : null;

  // --- health -------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: store.getStatus(),
      build,
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
  if (hasStatic) {
    /**
     * The document is always served by hand, never by `express.static`: `send`
     * appends `Last-Modified`/`ETag` *after* `setHeaders` runs, and the shell
     * must be impossible to revalidate. `etag`/`lastModified: false` drop both
     * validators, so a 304 can never resurrect an old bundle.
     */
    function serveDocument(req, res, next) {
      if (req.path.startsWith('/api')) return next();
      setDocumentCacheHeaders(res);
      return res.sendFile(
        indexHtml,
        { etag: false, lastModified: false, cacheControl: false },
        (err) => {
          if (err) next(err);
        },
      );
    }

    // A direct /index.html request must not reach express.static either.
    app.get('/index.html', serveDocument);

    // Hashed assets keep their long-lived caching untouched. `index: false`
    // keeps `/` out of the static handler so it lands on the document route.
    app.use(express.static(staticDir, { index: false, setHeaders: setStaticHeaders }));

    // SPA fallback: deep links and `/` get the un-cacheable document.
    app.get('*', serveDocument);
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
