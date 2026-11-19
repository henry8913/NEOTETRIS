import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAS_MS,
  DEAD_ZONE,
  REPEAT_MS,
  SOFT_REPEAT_MS,
  TAP_MS,
  intentAction,
  isTap,
  repeatInterval,
  stickIntent,
} from './joystick.js';

/* ── stickIntent: dead zone ────────────────────────────────────── */

test('stickIntent treats everything inside the dead zone as centred', () => {
  assert.deepEqual(stickIntent(0, 0), { x: 0, y: 0, magnitude: 0 });
  assert.equal(stickIntent(DEAD_ZONE, 0).x, 0);
  assert.equal(stickIntent(0, -DEAD_ZONE).y, 0);
  // A hair beyond the threshold is a real direction.
  assert.equal(stickIntent(DEAD_ZONE + 0.01, 0).x, 1);
});

test('stickIntent is symmetric on both axes', () => {
  assert.equal(stickIntent(-0.9, 0).x, -1);
  assert.equal(stickIntent(0.9, 0).x, 1);
  assert.equal(stickIntent(0, -0.9).y, -1);
  assert.equal(stickIntent(0, 0.9).y, 1);
});

test('stickIntent clamps out-of-range input instead of trusting it', () => {
  assert.deepEqual(stickIntent(4, 0), { x: 1, y: 0, magnitude: 1 });
  assert.deepEqual(stickIntent(0, -7), { x: 0, y: -1, magnitude: 1 });
});

test('stickIntent survives zero, negative and non-numeric input', () => {
  assert.deepEqual(stickIntent(0, 0), { x: 0, y: 0, magnitude: 0 });
  assert.deepEqual(stickIntent(NaN, undefined), { x: 0, y: 0, magnitude: 0 });
  assert.deepEqual(stickIntent(null, null), { x: 0, y: 0, magnitude: 0 });
});

/* ── stickIntent: diagonal priority ────────────────────────────── */

test('stickIntent never reports a diagonal: the dominant axis wins', () => {
  const mostlyRight = stickIntent(0.9, 0.5);
  assert.deepEqual([mostlyRight.x, mostlyRight.y], [1, 0]);

  const mostlyDown = stickIntent(0.35, 0.9);
  assert.deepEqual([mostlyDown.x, mostlyDown.y], [0, 1]);
});

test('stickIntent breaks a near-45° tie in favour of horizontal movement', () => {
  const tie = stickIntent(0.8, 0.8);
  assert.deepEqual([tie.x, tie.y], [1, 0]);
});

test('stickIntent reports the vector magnitude, capped at 1', () => {
  assert.equal(stickIntent(0.5, 0).magnitude, 0.5);
  assert.equal(stickIntent(1, 1).magnitude, 1);
});

/* ── intentAction ─────────────────────────────────────────────── */

test('intentAction maps up to rotate and down to soft drop', () => {
  assert.deepEqual(intentAction({ x: 0, y: -1 }), { type: 'ROTATE', dir: 1 });
  assert.deepEqual(intentAction({ x: 0, y: 1 }), { type: 'MOVE', dx: 0, dy: 1 });
});

test('intentAction maps horizontal movement and ignores a centred stick', () => {
  assert.deepEqual(intentAction({ x: -1, y: 0 }), { type: 'MOVE', dx: -1, dy: 0 });
  assert.deepEqual(intentAction({ x: 1, y: 0 }), { type: 'MOVE', dx: 1, dy: 0 });
  assert.equal(intentAction({ x: 0, y: 0 }), null);
  assert.equal(intentAction(null), null);
});

/* ── repeatInterval ───────────────────────────────────────────── */

test('repeatInterval uses the documented cadences and never repeats a rotate', () => {
  assert.equal(DAS_MS, 200);
  assert.equal(REPEAT_MS, 110);
  assert.equal(SOFT_REPEAT_MS, 60);
  assert.equal(repeatInterval({ x: 1, y: 0 }), REPEAT_MS);
  assert.equal(repeatInterval({ x: -1, y: 0 }), REPEAT_MS);
  assert.equal(repeatInterval({ x: 0, y: 1 }), SOFT_REPEAT_MS);
  assert.equal(repeatInterval({ x: 0, y: -1 }), 0);
  assert.equal(repeatInterval({ x: 0, y: 0 }), 0);
});

/* ── isTap ────────────────────────────────────────────────────── */

test('isTap accepts a short press that stays near its origin', () => {
  assert.equal(TAP_MS, 180);
  const start = { x: 100, y: 100, t: 1000 };
  const end = { x: 104, y: 103, t: 1120 };
  assert.equal(isTap(start, end, { maxDistance: 9 }), true);
});

test('isTap rejects a long press or one that travelled away', () => {
  const start = { x: 100, y: 100, t: 1000 };
  assert.equal(isTap(start, { x: 100, y: 100, t: 1200 }, { maxDistance: 9 }), false);
  assert.equal(isTap(start, { x: 100, y: 130, t: 1100 }, { maxDistance: 9 }), false);
});

test('isTap is false for missing, reversed or non-numeric samples', () => {
  const start = { x: 0, y: 0, t: 500 };
  assert.equal(isTap(null, start, { maxDistance: 9 }), false);
  assert.equal(isTap(start, null, { maxDistance: 9 }), false);
  assert.equal(isTap(start, { x: 0, y: 0, t: 400 }, { maxDistance: 9 }), false);
  assert.equal(isTap(start, { x: NaN, y: 0, t: 520 }, { maxDistance: 9 }), false);
});
