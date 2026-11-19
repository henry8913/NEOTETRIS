import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NAME,
  MAX_NAME_LENGTH,
  compareScores,
  formatDate,
  isRecord,
  mergeScores,
  normalizeName,
  rankOf,
} from './leaderboard.js';

/* ── normalizeName ─────────────────────────────────────────────── */

test('normalizeName trims, collapses spaces and keeps the text', () => {
  assert.equal(normalizeName('  Neo   Tetris  '), 'Neo Tetris');
});

test('normalizeName strips control characters before collapsing', () => {
  assert.equal(normalizeName('NE\u0000O\tTET\u001fRIS'), 'NE O TET RIS');
});

test('normalizeName caps the name at 20 characters', () => {
  const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const name = normalizeName(long);
  assert.equal(name.length, MAX_NAME_LENGTH);
  assert.equal(name, 'ABCDEFGHIJKLMNOPQRST');
});

test('normalizeName never returns an empty string', () => {
  assert.equal(normalizeName('   '), DEFAULT_NAME);
  assert.equal(normalizeName(''), DEFAULT_NAME);
  assert.equal(normalizeName(null), DEFAULT_NAME);
  assert.equal(normalizeName(42), DEFAULT_NAME);
});

test('normalizeName does not leave a trailing space after the cut', () => {
  assert.equal(normalizeName('ABCDEFGHIJKLMNOPQRST UVW'), 'ABCDEFGHIJKLMNOPQRST');
});

/* ── compareScores ─────────────────────────────────────────────── */

test('compareScores orders by score, then by the older date', () => {
  const rows = [
    { id: 'b', score: 100, date: '2024-05-02T10:00:00.000Z' },
    { id: 'a', score: 300, date: '2024-05-03T10:00:00.000Z' },
    { id: 'c', score: 100, date: '2024-05-01T10:00:00.000Z' },
  ].sort(compareScores);

  assert.deepEqual(rows.map((row) => row.id), ['a', 'c', 'b']);
});

/* ── mergeScores ───────────────────────────────────────────────── */

test('mergeScores unions both lists, best first', () => {
  const remote = [{ id: 'r1', name: 'REMOTE', score: 900, date: '2024-01-02' }];
  const local = [{ id: 'l1', name: 'LOCAL', score: 100, date: '2024-01-01' }];

  const merged = mergeScores(remote, local);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((row) => row.id), ['r1', 'l1']);
});

test('mergeScores dedupes by id and keeps the remote copy', () => {
  const remote = [{ id: 'same', name: 'SERVER', score: 500, date: '2024-01-01' }];
  const local = [
    { id: 'same', name: 'LOCAL', score: 500, date: '2024-01-01' },
    { id: 'other', name: 'OTHER', score: 400, date: '2024-01-01' },
  ];

  const merged = mergeScores(remote, local);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, 'SERVER');
  assert.deepEqual(merged.map((row) => row.id), ['same', 'other']);
});

test('mergeScores truncates to the requested limit', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `id-${i}`,
    name: `P${i}`,
    score: i * 10,
    date: '2024-01-01',
  }));

  const merged = mergeScores(rows, [], 10);
  assert.equal(merged.length, 10);
  assert.equal(merged[0].score, 110);
  assert.equal(merged[9].score, 20);
  assert.equal(mergeScores(rows, rows, 3).length, 3);
});

test('mergeScores tolerates missing, malformed and duplicate-free input', () => {
  assert.deepEqual(mergeScores(null, undefined), []);
  assert.deepEqual(mergeScores('nope', 42), []);

  const messy = [null, 5, { name: 'NOID', score: 10 }, { id: 'ok', score: 20 }];
  const merged = mergeScores(messy, []);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((row) => row.id), ['ok', undefined]);
});

/* ── rankOf ────────────────────────────────────────────────────── */

test('rankOf finds an entry by id and by score value', () => {
  const scores = [
    { id: 'a', score: 300, date: '2024-01-01' },
    { id: 'b', score: 200, date: '2024-01-01' },
    { id: 'c', score: 100, date: '2024-01-01' },
  ];

  assert.equal(rankOf({ id: 'a' }, scores), 1);
  assert.equal(rankOf({ id: 'c' }, scores), 3);
  assert.equal(rankOf({ score: 200 }, scores), 2);
  assert.equal(rankOf(100, scores), 3);
});

test('rankOf returns null when the score is not on the board', () => {
  const scores = [{ id: 'a', score: 300, date: '2024-01-01' }];
  assert.equal(rankOf({ id: 'zzz' }, scores), null);
  assert.equal(rankOf({ score: 999 }, scores), null);
  assert.equal(rankOf(null, scores), null);
  assert.equal(rankOf({ id: 'a' }, []), null);
});

/* ── isRecord ──────────────────────────────────────────────────── */

test('isRecord compares against the stored best', () => {
  assert.equal(isRecord(500, null), true);
  assert.equal(isRecord(500, { score: 400 }), true);
  assert.equal(isRecord(400, { score: 400 }), false);
  assert.equal(isRecord(0, null), false);
  assert.equal(isRecord(Number.NaN, { score: 10 }), false);
  assert.equal(isRecord(50, { score: 'nope' }), true);
});

/* ── formatDate ────────────────────────────────────────────────── */

test('formatDate renders a short DD/MM label in UTC', () => {
  assert.equal(formatDate('2024-03-07T23:30:00.000Z'), '07/03');
  assert.equal(formatDate('2024-12-31T00:00:00.000Z'), '31/12');
});

test('formatDate is robust to invalid input', () => {
  assert.equal(formatDate('not-a-date'), '--');
  assert.equal(formatDate(''), '--');
  assert.equal(formatDate(null), '--');
  assert.equal(formatDate(undefined), '--');
});
