/**
 * Pure math for the on-screen thumb stick — no DOM, no React, no timers.
 *
 * `components/Joystick.jsx` only measures pixels and feeds the normalised
 * values here; every decision (dead zone, dominant axis, tap, auto-repeat
 * cadence) is a pure function so it can be tested without a browser.
 *
 * The stick values are normalised offsets from the base centre: `dx` and `dy`
 * are in `[-1, 1]`, where `+dy` is *down* on screen (client coordinates).
 */

/** Hold before the first auto-repeat fires (classic Tetris DAS). */
export const DAS_MS = 200;
/** Auto-repeat cadence for horizontal movement. */
export const REPEAT_MS = 110;
/** Auto-repeat cadence for soft drop (a little faster than moving). */
export const SOFT_REPEAT_MS = 60;
/** Fraction of the stick travel that is treated as "centred". */
export const DEAD_ZONE = 0.3;
/** A press shorter than this that never leaves the dead zone is a tap. */
export const TAP_MS = 180;

const clampAxis = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return 1;
  if (n < -1) return -1;
  return n;
};

/**
 * Resolves a normalised stick offset into one axis of movement.
 *
 * - each axis is clamped to `[-1, 1]` and has to clear the dead zone;
 * - a diagonal drag never produces two actions: the dominant axis wins and a
 *   near-45° tie is resolved in favour of horizontal movement (Tetris rewards
 *   lateral precision, and a stray soft drop is the most expensive mistake).
 *
 * @param {number} dx horizontal offset, `-1..1`
 * @param {number} dy vertical offset, `-1..1` (`+` = down)
 * @param {{ deadZone?: number }} [opts]
 * @returns {{ x: -1 | 0 | 1, y: -1 | 0 | 1, magnitude: number }}
 */
export function stickIntent(dx, dy, opts = {}) {
  const requested = Number(opts.deadZone ?? DEAD_ZONE);
  const deadZone = Number.isFinite(requested) ? Math.min(1, Math.max(0, requested)) : DEAD_ZONE;
  const x = clampAxis(dx);
  const y = clampAxis(dy);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const magnitude = Math.min(1, Math.hypot(ax, ay));

  const outX = ax > deadZone ? Math.sign(x) : 0;
  const outY = ay > deadZone ? Math.sign(y) : 0;

  if (outX !== 0 && outY !== 0) {
    if (ax >= ay) return { x: outX, y: 0, magnitude };
    return { x: 0, y: outY, magnitude };
  }

  return { x: outX, y: outY, magnitude };
}

/**
 * The one action a resolved intent maps to, or `null` when it is centred.
 * Up rotates (a gesture, never a repeat); down soft drops; left/right move.
 */
export function intentAction(intent) {
  if (!intent) return null;
  if (intent.y < 0) return { type: 'ROTATE', dir: 1 };
  if (intent.y > 0) return { type: 'MOVE', dx: 0, dy: 1 };
  if (intent.x !== 0) return { type: 'MOVE', dx: intent.x, dy: 0 };
  return null;
}

/**
 * Auto-repeat cadence in ms for a resolved intent (0 = fire once, no repeat).
 * Rotating up is a single gesture, re-armed only when the stick recentres.
 */
export function repeatInterval(intent, opts = {}) {
  if (!intent) return 0;
  if (intent.y > 0) return opts.softRepeatMs ?? SOFT_REPEAT_MS;
  if (intent.x !== 0) return opts.repeatMs ?? REPEAT_MS;
  return 0;
}

/**
 * True when a gesture counts as a tap: short enough and released near the
 * point where it started (so it stayed inside the dead zone).
 *
 * @param {{ x: number, y: number, t: number }} start pointer down sample
 * @param {{ x: number, y: number, t: number }} end pointer up sample
 * @param {{ tapMs?: number, maxDistance?: number }} [opts] `maxDistance` in px
 */
export function isTap(start, end, opts = {}) {
  if (!start || !end) return false;
  const tapMs = opts.tapMs ?? TAP_MS;
  const maxDistance = opts.maxDistance ?? 0;

  const t0 = Number(start.t);
  const t1 = Number(end.t);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
  const elapsed = t1 - t0;
  if (elapsed < 0 || elapsed > tapMs) return false;

  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;

  return Math.hypot(dx, dy) <= maxDistance;
}
