import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateScorePayload,
  sanitizeName,
  DEFAULT_LINES,
  DEFAULT_LEVEL,
  KEY_ERROR_MESSAGE,
  KEY_MAX_LENGTH,
  KEY_MIN_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SCORE,
} from '../src/validation.js';

test('valid payload passes through unchanged', () => {
  const result = validateScorePayload({ name: '  Ada  ', score: 1234, level: 3, lines: 42 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'Ada', score: 1234, level: 3, lines: 42 });
});

test('missing name, level and lines fall back to defaults', () => {
  const result = validateScorePayload({ score: 0 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    name: 'Anonymous',
    score: 0,
    level: DEFAULT_LEVEL,
    lines: DEFAULT_LINES,
  });
});

test('empty or whitespace-only name becomes Anonymous', () => {
  for (const name of ['', '   ', '\t\n']) {
    const result = validateScorePayload({ name, score: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.value.name, 'Anonymous');
  }
});

test('negative score is rejected', () => {
  const result = validateScorePayload({ score: -1 });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    { field: 'score', message: 'Score must be greater than or equal to 0' },
  ]);
});

test('string score is rejected (no coercion)', () => {
  const result = validateScorePayload({ score: '1000' });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'score');
  assert.match(result.errors[0].message, /integer number/);
});

test('non-integer score is rejected', () => {
  for (const score of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateScorePayload({ score });
    assert.equal(result.ok, false, `score ${score} should be rejected`);
    assert.equal(result.errors[0].field, 'score');
  }
});

test('score above the maximum is rejected', () => {
  const result = validateScorePayload({ score: MAX_SCORE + 1 });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'score');
});

test('missing score is an error', () => {
  const result = validateScorePayload({ name: 'Ada' });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [{ field: 'score', message: 'Score is required' }]);
});

test('name longer than the limit is rejected, not truncated', () => {
  const result = validateScorePayload({ score: 1, name: 'x'.repeat(MAX_NAME_LENGTH + 1) });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, 'name');
  assert.match(result.errors[0].message, /at most 20 characters/);
});

test('name of exactly the limit is accepted', () => {
  const name = 'x'.repeat(MAX_NAME_LENGTH);
  const result = validateScorePayload({ score: 1, name });

  assert.equal(result.ok, true);
  assert.equal(result.value.name, name);
});

test('non-string name is rejected', () => {
  const result = validateScorePayload({ score: 1, name: 42 });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'name');
});

test('level and lines out of range are rejected', () => {
  const levelResult = validateScorePayload({ score: 1, level: 100 });
  assert.equal(levelResult.ok, false);
  assert.equal(levelResult.errors[0].field, 'level');

  const linesResult = validateScorePayload({ score: 1, lines: -1 });
  assert.equal(linesResult.ok, false);
  assert.equal(linesResult.errors[0].field, 'lines');
});

test('multiple errors are all reported', () => {
  const result = validateScorePayload({ score: -5, level: 'x', lines: 1.2 });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field).sort(),
    ['level', 'lines', 'score'],
  );
});

test('extra fields are ignored', () => {
  const result = validateScorePayload({ score: 5, hacked: true, _id: 'nope' });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ['level', 'lines', 'name', 'score']);
});

test('a valid idempotency key is passed through', () => {
  const key = 'run_2026-11-19T10-00-00Z-abc';
  const result = validateScorePayload({ score: 10, key });

  assert.equal(result.ok, true);
  assert.equal(result.value.key, key);
});

test('key length boundaries are inclusive', () => {
  const short = 'a'.repeat(KEY_MIN_LENGTH);
  const long = 'a'.repeat(KEY_MAX_LENGTH);

  assert.equal(validateScorePayload({ score: 1, key: short }).value.key, short);
  assert.equal(validateScorePayload({ score: 1, key: long }).value.key, long);
});

test('key is absent from the value when the client does not send one', () => {
  const result = validateScorePayload({ score: 10 });

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.value, 'key'), false);
});

test('invalid idempotency keys are rejected with a strict message', () => {
  for (const key of ['ab', 'has spaces', 'x'.repeat(KEY_MAX_LENGTH + 1), 123, true, ['key']]) {
    const result = validateScorePayload({ score: 1, key });

    assert.equal(result.ok, false, `key ${JSON.stringify(key)} should be rejected`);
    assert.deepEqual(result.errors, [{ field: 'key', message: KEY_ERROR_MESSAGE }]);
  }
});

test('key errors are reported together with the other field errors', () => {
  const result = validateScorePayload({ score: -1, key: 'nope' });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field).sort(),
    ['key', 'score'],
  );
});

test('a null key is treated as absent (no idempotency)', () => {
  const result = validateScorePayload({ score: 1, key: null });

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.value, 'key'), false);
});

test('non-object bodies are treated as empty payloads', () => {
  for (const body of [undefined, null, 'string', 42, []]) {
    const result = validateScorePayload(body);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].field, 'score');
  }
});

test('sanitizeName strips control characters and caps the length', () => {
  assert.equal(sanitizeName('A\u0000d\u001fa'), 'Ada');
  assert.equal(sanitizeName('   '), 'Anonymous');
  assert.equal(sanitizeName(undefined), 'Anonymous');
  assert.equal(sanitizeName('y'.repeat(30)), 'y'.repeat(MAX_NAME_LENGTH));
});
