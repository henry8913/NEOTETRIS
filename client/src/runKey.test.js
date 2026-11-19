import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN_KEY_MAX_LENGTH, RUN_KEY_MIN_LENGTH, makeRunKey } from './runKey.js';

/** The server's accepted shape: 8..64 chars, `[A-Za-z0-9_-]` only. */
const VALID = /^[A-Za-z0-9_-]{8,64}$/;

test('uses crypto.randomUUID when the runtime provides it', () => {
  const key = makeRunKey({ uuid: () => 'a3f1c2d4-0000-4000-8000-123456789abc' });
  assert.equal(key, 'a3f1c2d4-0000-4000-8000-123456789abc');
  assert.match(key, VALID);
});

test('falls back to timestamp + random when uuid throws', () => {
  const key = makeRunKey({
    uuid: () => {
      throw new Error('insecure context');
    },
    now: () => 1_700_000_000_000,
    random: () => 0.5,
  });
  assert.match(key, /^run-[0-9a-z]+-[0-9a-z]+$/);
  assert.match(key, VALID);
  assert.ok(key.length <= RUN_KEY_MAX_LENGTH);
});

test('the all-zero fallback still satisfies the server minimum', () => {
  const key = makeRunKey({ uuid: null, now: () => 0, random: () => 0 });
  assert.ok(key.length >= RUN_KEY_MIN_LENGTH, key);
  assert.ok(key.length <= RUN_KEY_MAX_LENGTH, key);
  assert.match(key, VALID);
  assert.equal(key, 'run-0-0000000');
});

test('the fallback is stable for the same inputs and changes with the clock', () => {
  const at = (ms) => makeRunKey({ uuid: null, now: () => ms, random: () => 0.25 });
  assert.equal(at(1000), at(1000));
  assert.notEqual(at(1000), at(1001));
  assert.notEqual(
    makeRunKey({ uuid: null, now: () => 1000, random: () => 0 }),
    makeRunKey({ uuid: null, now: () => 1000, random: () => 0.5 }),
  );
});

test('two default keys never collide', () => {
  const a = makeRunKey();
  const b = makeRunKey();
  assert.equal(typeof a, 'string');
  assert.match(a, VALID);
  assert.match(b, VALID);
  assert.notEqual(a, b);
});

test('caps an over-long uuid instead of forwarding it', () => {
  const key = makeRunKey({ uuid: () => 'x'.repeat(200) });
  assert.equal(key.length, RUN_KEY_MAX_LENGTH);
  assert.match(key, VALID);
});

test('sanitises disallowed characters in the uuid branch', () => {
  const key = makeRunKey({ uuid: () => ' ab cd!$%ef-gh_ij ' });
  assert.equal(key, 'abcdef-gh_ij');
  assert.match(key, VALID);
});

test('a uuid that sanitises below the minimum falls back to the timestamp', () => {
  const key = makeRunKey({ uuid: () => 'abc', now: () => 0, random: () => 0 });
  assert.equal(key, 'run-0-0000000');
  assert.match(key, VALID);
  // Purely disallowed input behaves the same way.
  assert.equal(
    makeRunKey({ uuid: () => '!@#$%^&*', now: () => 0, random: () => 0 }),
    'run-0-0000000',
  );
});

test('a missing or empty uuid falls back without ever returning an invalid key', () => {
  for (const value of [null, undefined, () => '', () => '   ']) {
    const key = makeRunKey({ uuid: value, now: () => 0, random: () => 0 });
    assert.match(key, VALID);
  }
});
