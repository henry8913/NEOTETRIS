import { normalizeName } from './leaderboard.js';

/**
 * The only place that talks HTTP.
 *
 * In development the client is served by Vite and `/api` is proxied to the
 * Express server (see `vite.config.js`); in production the same origin serves
 * both, so the empty base is correct. `VITE_API_URL` is the escape hatch for a
 * split deployment (absolute URL, no trailing slash).
 *
 * Every request is bounded by a timeout and never resolves with garbage: a
 * malformed row is dropped instead of being rendered.
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

const SELECTOR = '/api/scores';
const HEALTH = '/api/health';

/** `Error` with the HTTP status and the server `details` attached. */
function apiError(message, status, details) {
  const error = new Error(message);
  if (status != null) error.status = status;
  if (details != null) error.details = details;
  return error;
}

/**
 * `AbortSignal.timeout` rejects with a `TimeoutError` DOMException, the
 * controller fallback (and a caller abort) with `AbortError`: both count.
 */
function isTimeoutError(error) {
  return Boolean(error) && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * A timeout signal that is always cleaned up. `AbortSignal.timeout` is used
 * when the runtime has it; otherwise an `AbortController` + `setTimeout` pair
 * does the same job, with the timer cleared in `cleanup()`.
 */
function withTimeout(timeout) {
  const ms = Number.isFinite(timeout) && timeout > 0 ? timeout : 0;
  if (!ms) return { signal: undefined, cleanup: () => {} };

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), cleanup: () => {} };
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(apiError('Request timed out', 408)), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(id) };
}

/** Combines the timeout signal with the caller's, without leaking a listener. */
function combineSignals(...signals) {
  const list = signals.filter(Boolean);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);

  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

async function readJSON(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Normalises one API row, or `null` when it cannot be trusted. */
function parseScore(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const score = Number(raw.score);
  if (!Number.isFinite(score)) return null;

  const id = raw.id == null || raw.id === '' ? '' : String(raw.id);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!id || !name) return null;

  const level = Number(raw.level);
  const lines = Number(raw.lines);
  const date = typeof raw.date === 'string' ? raw.date : '';

  return {
    id,
    name,
    score: Math.trunc(score),
    level: Number.isFinite(level) ? Math.trunc(level) : 1,
    lines: Number.isFinite(lines) ? Math.trunc(lines) : 0,
    date: Number.isFinite(Date.parse(date)) ? date : '',
  };
}

/**
 * `GET /api/scores` → validated array (best first, malformed rows dropped).
 * Throws an `Error` carrying `status` on a non-2xx answer or a timeout.
 */
export async function fetchScores(limit = 10, { timeout = 5000, signal } = {}) {
  const bounded = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 10;
  const timer = withTimeout(timeout);

  try {
    const response = await fetch(`${API_BASE}${SELECTOR}?limit=${bounded}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: combineSignals(timer.signal, signal),
    });

    if (!response.ok) {
      throw apiError(`Leaderboard request failed (${response.status})`, response.status);
    }

    const data = await readJSON(response);
    if (!Array.isArray(data)) return [];
    return data.map(parseScore).filter(Boolean);
  } catch (error) {
    if (isTimeoutError(error) && timer.signal?.aborted) throw apiError('Request timed out', 408);
    throw error;
  } finally {
    timer.cleanup();
  }
}

/**
 * `POST /api/scores` → the created score. The server error body
 * (`{ error, details }`) is surfaced on the thrown `Error`, and a 429 also
 * carries `retryAfter` (seconds) when the header is present.
 */
export async function submitScore({ name, score, level, lines } = {}, { timeout = 5000 } = {}) {
  const timer = withTimeout(timeout);

  const payload = {
    name: normalizeName(name),
    score: Number.isFinite(Number(score)) ? Math.max(0, Math.trunc(Number(score))) : 0,
    level: Number.isFinite(Number(level)) ? Math.max(1, Math.trunc(Number(level))) : 1,
    lines: Number.isFinite(Number(lines)) ? Math.max(0, Math.trunc(Number(lines))) : 0,
  };

  try {
    const response = await fetch(`${API_BASE}${SELECTOR}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: timer.signal,
    });

    const body = await readJSON(response);

    if (!response.ok) {
      const message = body && typeof body.error === 'string' && body.error
        ? body.error
        : `Score rejected (${response.status})`;
      const details = body && Array.isArray(body.details) ? body.details : undefined;
      const error = apiError(message, response.status, details);

      const retryAfter = Number(response.headers?.get?.('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;

      throw error;
    }

    const created = parseScore(body);
    if (!created) throw apiError('Malformed score response', response.status);
    return created;
  } catch (error) {
    if (isTimeoutError(error) && timer.signal?.aborted) throw apiError('Request timed out', 408);
    throw error;
  } finally {
    timer.cleanup();
  }
}

/**
 * `GET /api/health` → `{ ok, db? }`. It never throws: it exists to tell the UI
 * whether a failed leaderboard fetch means "server down" or "server unhappy".
 */
export async function fetchHealth({ timeout = 3000 } = {}) {
  const timer = withTimeout(timeout);

  try {
    const response = await fetch(`${API_BASE}${HEALTH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: timer.signal,
    });
    if (!response.ok) return { ok: false };

    const body = await readJSON(response);
    if (!body || body.status !== 'ok') return { ok: false };
    return { ok: true, db: typeof body.db === 'string' ? body.db : undefined };
  } catch {
    return { ok: false };
  } finally {
    timer.cleanup();
  }
}
