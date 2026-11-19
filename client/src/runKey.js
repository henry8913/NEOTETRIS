/**
 * Idempotency key for a single run's score submission.
 *
 * One key is minted when the game-over form is first submitted and then kept
 * for the whole run: every attempt — including RETRY after a timeout — sends
 * the same value. That is what stops a slow POST (which already inserted) from
 * becoming a duplicate row when the player retries.
 *
 * `crypto.randomUUID()` is only available in a secure context, so a timestamp +
 * random fallback covers `http://` LAN dev hosts and old browsers. The helper
 * takes its non-deterministic inputs as options, which keeps it testable.
 *
 * The server contract is strict: 8..64 characters from `[A-Za-z0-9_-]`. Both
 * branches are sanitised here, because a key the server rejects with a 400
 * would push a perfectly good run into the local-only path.
 */

/** Bounds the server enforces on the `key` field (400 outside them). */
export const RUN_KEY_MIN_LENGTH = 8;
export const RUN_KEY_MAX_LENGTH = 64;

/** Everything the server would reject, removed rather than re-encoded. */
const DISALLOWED = /[^A-Za-z0-9_-]/g;

/** Base36 chars needed for the 32-bit random salt ('1z141z4' is the longest). */
const SALT_LENGTH = 7;

function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value.replace(DISALLOWED, '').slice(0, RUN_KEY_MAX_LENGTH);
}

function defaultUuid() {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.randomUUID !== 'function') return null;
  return crypto.randomUUID.bind(crypto);
}

/**
 * A unique, opaque string of 8..64 `[A-Za-z0-9_-]` characters. Never derived
 * from the score or the name: two identical runs must still produce two
 * different keys.
 *
 * @param {{ uuid?: (() => string) | null, now?: () => number, random?: () => number }} [options]
 */
export function makeRunKey({ uuid, now = Date.now, random = Math.random } = {}) {
  const generator = uuid === undefined ? defaultUuid() : uuid;

  if (typeof generator === 'function') {
    try {
      // A uuid is already allowed-charset, but a custom generator may not be:
      // sanitise, and only accept it when it can still satisfy the minimum.
      const fromUuid = sanitize(generator());
      if (fromUuid.length >= RUN_KEY_MIN_LENGTH) return fromUuid;
    } catch {
      /* blocked API / insecure context: fall through to the timestamp */
    }
  }

  const stamp = Number(typeof now === 'function' ? now() : now);
  const roll = Number(typeof random === 'function' ? random() : random);
  const ms = Number.isFinite(stamp) ? Math.max(Math.trunc(stamp), 0) : 0;
  // `% 1` keeps a mocked `random()` returning 1 inside the 32-bit range.
  const fraction = Number.isFinite(roll) ? Math.abs(roll) % 1 : 0;
  const salt = Math.floor(fraction * 0x100000000)
    .toString(36)
    .padStart(SALT_LENGTH, '0');

  // `run-<ms36>-<7 chars>` is at least 13 characters, so the padding below is
  // belt and braces; it only matters if the shape ever shrinks again.
  return `run-${ms.toString(36)}-${salt}`
    .slice(0, RUN_KEY_MAX_LENGTH)
    .padEnd(RUN_KEY_MIN_LENGTH, '0');
}
