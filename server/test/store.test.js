import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampLimit,
  createMemoryStore,
  createStore,
  MAX_LIMIT,
  MAX_MEMORY_SCORES,
  scoreSchema,
} from '../src/store.js';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function makeScore(i, score) {
  return { name: `P${i}`, score, level: 1, lines: i };
}

test('memory store starts empty and reports its status', async () => {
  const store = createMemoryStore();

  assert.equal(store.getStatus(), 'memory');
  assert.equal(store.kind, 'memory');
  assert.equal(store.size, 0);
  assert.deepEqual(await store.listScores(), []);
});

test('memory store adds scores with a uniform public shape', async () => {
  const store = createMemoryStore();

  const { row: created, created: isNew } = await store.addScore({
    name: 'Ada',
    score: 100,
    level: 2,
    lines: 7,
  });

  assert.equal(isNew, true);
  assert.deepEqual(Object.keys(created).sort(), ['date', 'id', 'level', 'lines', 'name', 'score']);
  assert.equal(created._id, undefined);
  assert.equal(created.__v, undefined);
  assert.equal(typeof created.id, 'string');
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.match(created.date, ISO_8601);
  assert.equal(created.name, 'Ada');
  assert.equal(created.score, 100);
  assert.equal(created.level, 2);
  assert.equal(created.lines, 7);
  assert.equal(store.size, 1);
});

test('memory store keeps scores ordered by score desc', async () => {
  const store = createMemoryStore();

  await store.addScore(makeScore(1, 50));
  await store.addScore(makeScore(2, 300));
  await store.addScore(makeScore(3, 100));

  const scores = await store.listScores();
  assert.deepEqual(scores.map((score) => score.score), [300, 100, 50]);
  assert.deepEqual(scores.map((score) => score.name), ['P2', 'P3', 'P1']);
});

test('memory store breaks score ties by date ascending', async () => {
  const store = createMemoryStore();

  const { row: first } = await store.addScore(makeScore(1, 100));
  const { row: second } = await store.addScore(makeScore(2, 100));

  const scores = await store.listScores();
  assert.deepEqual(scores.map((score) => score.id), [first.id, second.id]);
});

test('memory store defaults to 10 results', async () => {
  const store = createMemoryStore();

  for (let i = 0; i < 15; i += 1) {
    await store.addScore(makeScore(i, i * 10));
  }

  const scores = await store.listScores();
  assert.equal(scores.length, 10);
  assert.equal(scores[0].score, 140);
});

test('clampLimit enforces 1..50 and falls back on garbage', () => {
  assert.equal(clampLimit(undefined), 10);
  assert.equal(clampLimit('abc'), 10);
  assert.equal(clampLimit(5), 5);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(-20), 1);
  assert.equal(clampLimit(MAX_LIMIT + 1), MAX_LIMIT);
  assert.equal(clampLimit(3.9), 3);
  assert.equal(clampLimit(null), 10);
});

test('memory store applies the limit', async () => {
  const store = createMemoryStore();

  for (let i = 0; i < 20; i += 1) {
    await store.addScore(makeScore(i, i));
  }

  assert.equal((await store.listScores(3)).length, 3);
  assert.equal((await store.listScores(0)).length, 1, 'limit 0 clamps to 1');
  assert.equal((await store.listScores(500)).length, 20, 'limit 500 clamps to 50 but only 20 exist');
});

test('memory store caps storage at MAX_MEMORY_SCORES and drops the lowest', async () => {
  const store = createMemoryStore();

  for (let i = 0; i < MAX_MEMORY_SCORES + 10; i += 1) {
    await store.addScore(makeScore(i, i));
  }

  assert.equal(store.size, MAX_MEMORY_SCORES);

  const scores = await store.listScores(MAX_LIMIT);
  assert.equal(scores[0].score, MAX_MEMORY_SCORES + 9);
  assert.ok(scores.every((score) => score.score >= 10), 'lowest scores were evicted');
});

test('memory store reset clears everything', async () => {
  const store = createMemoryStore();

  await store.addScore(makeScore(1, 10));
  await store.addScore(makeScore(2, 20));
  assert.equal(store.size, 2);

  store.reset();

  assert.equal(store.size, 0);
  assert.deepEqual(await store.listScores(), []);
});

test('memory store close is a no-op that resolves', async () => {
  const store = createMemoryStore();
  await assert.doesNotReject(store.close());
});

test('listScores returns copies (mutating results does not corrupt the store)', async () => {
  const store = createMemoryStore();
  await store.addScore(makeScore(1, 10));

  const [score] = await store.listScores();
  score.score = 999999;

  const [fresh] = await store.listScores();
  assert.equal(fresh.score, 10);
});

test('memory store dedupes a repeated idempotency key', async () => {
  const store = createMemoryStore();
  const payload = { name: 'Ada', score: 4200, level: 4, lines: 33, key: 'run-abc_123' };

  const first = await store.addScore(payload);
  const second = await store.addScore(payload);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(second.row, first.row, 'same id, same date, same fields');
  assert.equal(store.size, 1);
  assert.equal(second.row.key, undefined);
  assert.deepEqual(Object.keys(second.row).sort(), [
    'date',
    'id',
    'level',
    'lines',
    'name',
    'score',
  ]);
});

test('memory store dedupes by key, not by content', async () => {
  const store = createMemoryStore();
  const base = { name: 'Ada', score: 100, level: 1, lines: 0 };

  await store.addScore({ ...base, key: 'key-aaaaaaaa' });
  await store.addScore({ ...base, key: 'key-bbbbbbbb' });

  assert.equal(store.size, 2);
});

test('memory store inserts every time when no key is given', async () => {
  const store = createMemoryStore();
  const payload = { name: 'Ada', score: 100, level: 1, lines: 0 };

  const first = await store.addScore(payload);
  const second = await store.addScore(payload);

  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.notEqual(first.row.id, second.row.id);
  assert.equal(store.size, 2);
});

test('memory store forgets keys whose row was evicted by the cap', async () => {
  const store = createMemoryStore({ max: 1 });

  await store.addScore({ name: 'low', score: 1, level: 1, lines: 0, key: 'evicted-key' });
  await store.addScore({ name: 'high', score: 900, level: 1, lines: 0 });

  assert.equal(store.size, 1);

  const retried = await store.addScore({
    name: 'low',
    score: 1,
    level: 1,
    lines: 0,
    key: 'evicted-key',
  });

  assert.equal(retried.created, true, 'the guarded row is gone, so a re-run is a new insert');
});

test('score schema declares a unique sparse index on key', () => {
  const keyIndex = scoreSchema.indexes().find(([fields]) => fields.key === 1);

  assert.ok(keyIndex, 'key index is declared');
  assert.equal(keyIndex[1].unique, true);
  assert.equal(keyIndex[1].sparse, true, 'legacy rows without a key stay unindexed');
});

test('createStore without a mongoUri goes straight to memory', async () => {
  const logs = [];
  const logger = { log: (line) => logs.push(line), warn: (line) => logs.push(line) };

  const store = await createStore({ mongoUri: '', logger });

  assert.equal(store.getStatus(), 'memory');
  assert.equal(store.size, 0);
  assert.ok(logs.some((line) => line.includes('in-memory store')));
  await store.close();
});

test('createStore falls back to memory when MongoDB is unreachable', async () => {
  const logs = [];
  const logger = { log: (line) => logs.push(line), warn: (line) => logs.push(line) };

  const store = await createStore({
    mongoUri: 'mongodb://127.0.0.1:59999/neotetris-test',
    serverSelectionTimeoutMS: 250,
    logger,
  });

  assert.equal(store.getStatus(), 'memory');
  assert.ok(logs.some((line) => line.includes('MongoDB unavailable')));

  const { row: created } = await store.addScore({ name: 'Ada', score: 1, level: 1, lines: 0 });
  assert.equal(created.name, 'Ada');

  await store.close();
});
