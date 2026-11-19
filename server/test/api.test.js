import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/store.js';
import { KEY_ERROR_MESSAGE } from '../src/validation.js';

/**
 * Boots the app on an ephemeral port so tests never fight over 3001.
 */
async function startServer({ store = createMemoryStore(), ...options } = {}) {
  const app = createApp({ store, staticDir: null, ...options });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const { port } = server.address();

  return {
    store,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function postScore(baseUrl, body) {
  return fetch(`${baseUrl}/api/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('GET /api/scores returns an empty array when there are no scores', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/scores`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('POST /api/scores returns 201 and the score is then listed', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const created = await postScore(ctx.baseUrl, { name: 'Ada', score: 4200, level: 4, lines: 33 });

  assert.equal(created.status, 201);

  const body = await created.json();
  assert.equal(body.name, 'Ada');
  assert.equal(body.score, 4200);
  assert.equal(body.level, 4);
  assert.equal(body.lines, 33);
  assert.equal(typeof body.id, 'string');
  assert.equal(body._id, undefined);
  assert.equal(body.__v, undefined);

  const listRes = await fetch(`${ctx.baseUrl}/api/scores`);
  assert.equal(listRes.status, 200);

  const list = await listRes.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, body.id);
  assert.equal(list[0].score, 4200);
});

test('POST /api/scores applies defaults for omitted fields', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await postScore(ctx.baseUrl, { score: 10 });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.name, 'Anonymous');
  assert.equal(body.level, 1);
  assert.equal(body.lines, 0);
});

test('a repeated idempotency key returns the original row with 200', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const payload = { name: 'Ada', score: 4200, level: 4, lines: 33, key: 'run-abc_123456' };

  const firstRes = await postScore(ctx.baseUrl, payload);
  assert.equal(firstRes.status, 201);
  const first = await firstRes.json();

  const retryRes = await postScore(ctx.baseUrl, payload);
  assert.equal(retryRes.status, 200, 'a retry must not report a creation');
  const retry = await retryRes.json();

  assert.deepEqual(retry, first, 'same id, original date, unchanged fields');
  assert.equal(retry.key, undefined, 'the key is never exposed');
  assert.equal(retry._id, undefined);
  assert.equal(retry.__v, undefined);

  const listRes = await fetch(`${ctx.baseUrl}/api/scores`);
  const list = await listRes.json();
  assert.equal(list.length, 1, 'exactly one row was stored');
  assert.equal(list[0].id, first.id);
});

test('concurrent requests with the same key produce exactly one row', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const payload = { name: 'Ada', score: 900, level: 2, lines: 10, key: 'parallel-key-1' };
  const responses = await Promise.all([
    postScore(ctx.baseUrl, payload),
    postScore(ctx.baseUrl, payload),
  ]);

  const statuses = responses.map((res) => res.status).sort();
  assert.deepEqual(statuses, [200, 201]);

  const rows = await Promise.all(responses.map((res) => res.json()));
  assert.equal(rows[0].id, rows[1].id);
  assert.equal((await (await fetch(`${ctx.baseUrl}/api/scores`)).json()).length, 1);
});

test('different keys with an identical payload create two rows', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const base = { name: 'Ada', score: 4200, level: 4, lines: 33 };

  const firstRes = await postScore(ctx.baseUrl, { ...base, key: 'key-aaaaaaaa' });
  const secondRes = await postScore(ctx.baseUrl, { ...base, key: 'key-bbbbbbbb' });

  assert.equal(firstRes.status, 201);
  assert.equal(secondRes.status, 201);

  const first = await firstRes.json();
  const second = await secondRes.json();
  assert.notEqual(first.id, second.id);

  const list = await (await fetch(`${ctx.baseUrl}/api/scores`)).json();
  assert.equal(list.length, 2, 'dedupe is by key, not by content');
});

test('POST /api/scores without a key still inserts every time (regression)', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const payload = { name: 'Ada', score: 100 };

  const firstRes = await postScore(ctx.baseUrl, payload);
  const secondRes = await postScore(ctx.baseUrl, payload);

  assert.equal(firstRes.status, 201);
  assert.equal(secondRes.status, 201);

  const list = await (await fetch(`${ctx.baseUrl}/api/scores`)).json();
  assert.equal(list.length, 2);
});

test('POST /api/scores rejects invalid idempotency keys with 400 and details', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  for (const key of ['ab', 'has spaces', 'x'.repeat(65), 123]) {
    const res = await postScore(ctx.baseUrl, { score: 10, key });

    assert.equal(res.status, 400, `key ${JSON.stringify(key)} should be rejected`);

    const body = await res.json();
    assert.equal(body.error, 'Invalid payload');
    assert.deepEqual(body.details, [{ field: 'key', message: KEY_ERROR_MESSAGE }]);
  }

  assert.equal(ctx.store.size, 0);
});

test('POST /api/scores rejects invalid payloads with 400 and details', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  for (const payload of [
    { score: -5 },
    { score: 'not-a-number' },
    { name: 'x'.repeat(21), score: 1 },
    { level: 1 },
    {},
  ]) {
    const res = await postScore(ctx.baseUrl, payload);

    assert.equal(res.status, 400, `payload ${JSON.stringify(payload)} should be rejected`);

    const body = await res.json();
    assert.equal(body.error, 'Invalid payload');
    assert.ok(Array.isArray(body.details));
    assert.ok(body.details.length > 0);
    assert.equal(typeof body.details[0].field, 'string');
  }

  assert.equal(ctx.store.size, 0);
});

test('POST /api/scores rejects malformed JSON with 400', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ not json',
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(typeof body.error, 'string');
});

test('GET /api/scores respects and clamps the limit parameter', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  for (let i = 0; i < 12; i += 1) {
    await postScore(ctx.baseUrl, { name: `P${i}`, score: i * 10 });
  }

  const defaultRes = await fetch(`${ctx.baseUrl}/api/scores`);
  assert.equal((await defaultRes.json()).length, 10);

  const threeRes = await fetch(`${ctx.baseUrl}/api/scores?limit=3`);
  const three = await threeRes.json();
  assert.equal(three.length, 3);
  assert.equal(three[0].score, 110);

  const clampedRes = await fetch(`${ctx.baseUrl}/api/scores?limit=999`);
  assert.ok((await clampedRes.json()).length <= 12);

  const zeroRes = await fetch(`${ctx.baseUrl}/api/scores?limit=0`);
  assert.equal((await zeroRes.json()).length, 1);
});

test('GET /api/scores rejects a non numeric limit with 400', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/scores?limit=abc`);

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Invalid limit');
});

test('GET /api/health reports the memory store', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/health`);

  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'memory');
  assert.equal(typeof body.uptime, 'number');
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
});

test('unknown /api routes return a JSON 404', async (t) => {
  const ctx = await startServer();
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/nope`);

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('POST rate limit kicks in after 30 requests within the window', async (t) => {
  const ctx = await startServer({ rateLimit: { windowMs: 60_000, max: 30 } });
  t.after(() => ctx.close());

  for (let i = 0; i < 30; i += 1) {
    const res = await postScore(ctx.baseUrl, { score: i });
    assert.equal(res.status, 201, `request ${i + 1} should be allowed`);
    assert.equal(res.headers.get('x-ratelimit-limit'), '30');
  }

  const blocked = await postScore(ctx.baseUrl, { score: 999 });

  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);

  const body = await blocked.json();
  assert.equal(body.error, 'Too many requests');
  assert.ok(Number(body.retryAfter) >= 1);

  // GET is not rate limited
  const listRes = await fetch(`${ctx.baseUrl}/api/scores`);
  assert.equal(listRes.status, 200);
});

test('rate limit can be disabled for tests', async (t) => {
  const ctx = await startServer({ rateLimit: false });
  t.after(() => ctx.close());

  for (let i = 0; i < 35; i += 1) {
    const res = await postScore(ctx.baseUrl, { score: i });
    assert.equal(res.status, 201);
  }
});

test('CORS headers are set from corsOrigin', async (t) => {
  const ctx = await startServer({ corsOrigin: 'https://example.test' });
  t.after(() => ctx.close());

  const res = await fetch(`${ctx.baseUrl}/api/health`);

  assert.equal(res.headers.get('access-control-allow-origin'), 'https://example.test');
});

test('createApp requires a store', () => {
  assert.throws(() => createApp({}), TypeError);
});

test('serves a built client with SPA fallback, keeping /api/* as JSON', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neotetris-dist-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>NEOTETRIS</title>');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const ctx = await startServer({ staticDir: dir });
  t.after(() => ctx.close());

  const page = await fetch(`${ctx.baseUrl}/play/now`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /NEOTETRIS/);

  const apiRes = await fetch(`${ctx.baseUrl}/api/nope`);
  assert.equal(apiRes.status, 404);
  assert.deepEqual(await apiRes.json(), { error: 'Not found' });
});

test('skips static serving silently when the dist dir is missing', async (t) => {
  const ctx = await startServer({ staticDir: '/nonexistent/neotetris-dist' });
  t.after(() => ctx.close());

  const page = await fetch(`${ctx.baseUrl}/play`);
  assert.equal(page.status, 404);

  const health = await fetch(`${ctx.baseUrl}/api/health`);
  assert.equal(health.status, 200);
});
