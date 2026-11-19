import test from 'node:test';
import assert from 'node:assert/strict';

import { assetName, buildTag, isStale, parseEntryAsset } from './buildInfo.js';

/** The real tail of a Vite production `index.html`. */
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="module" crossorigin src="/assets/index-CVs8dCcx.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-B4cWzEgq.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

/* ── parseEntryAsset ───────────────────────────────────────────── */

test('parseEntryAsset extracts the hashed entry module', () => {
  assert.equal(parseEntryAsset(INDEX_HTML), 'index-CVs8dCcx.js');
});

test('parseEntryAsset tolerates attribute order, single quotes and query strings', () => {
  const html =
    "<script src='/assets/index-abc12345.js?v=2' crossorigin type='module'></script>";
  assert.equal(parseEntryAsset(html), 'index-abc12345.js');
});

test('parseEntryAsset falls back to a modulepreload link', () => {
  const html =
    '<link rel="modulepreload" crossorigin href="/assets/index-9z8y7x6w.js"><div id="root"></div>';
  assert.equal(parseEntryAsset(html), 'index-9z8y7x6w.js');
});

test('parseEntryAsset returns null for dev HTML, malformed or empty input', () => {
  assert.equal(parseEntryAsset('<script type="module" src="/src/main.jsx"></script>'), null);
  assert.equal(parseEntryAsset('<html><body>nothing here</body></html>'), null);
  assert.equal(parseEntryAsset(''), null);
  assert.equal(parseEntryAsset(null), null);
  assert.equal(parseEntryAsset(42), null);
});

/* ── assetName / buildTag ──────────────────────────────────────── */

test('assetName keeps only the last JS path segment', () => {
  assert.equal(assetName('/assets/index-CVs8dCcx.js'), 'index-CVs8dCcx.js');
  assert.equal(assetName('https://cdn.test/a/b/index-1a2b3c4d.mjs?x=1#y'), 'index-1a2b3c4d.mjs');
  assert.equal(assetName('/src/main.jsx'), null);
  assert.equal(assetName(''), null);
  assert.equal(assetName(undefined), null);
});

test('buildTag is the first six characters of the entry hash', () => {
  assert.equal(buildTag('index-CVs8dCcx.js'), 'CVs8dC');
  assert.equal(buildTag('/assets/index-9z8y7x6w.js'), '9z8y7x');
  // Vite hashes are base64url: the hash itself can contain a dash.
  assert.equal(buildTag('index-CeKTIn-g.js'), 'CeKTIn');
});

test('buildTag reports dev when the entry carries no hash', () => {
  assert.equal(buildTag('main.jsx'), 'dev');
  assert.equal(buildTag(undefined), 'dev');
});

/* ── isStale ───────────────────────────────────────────────────── */

test('isStale flags a different entry asset', () => {
  assert.equal(isStale('index-CVs8dCcx.js', 'index-ZZZZZZZZ.js'), true);
});

test('isStale never fires when equal or when a hash is unknown', () => {
  assert.equal(isStale('index-CVs8dCcx.js', 'index-CVs8dCcx.js'), false);
  assert.equal(isStale('index-CVs8dCcx.js', 'index-CVs8dCcx.js?x=1'), false);
  assert.equal(isStale(null, 'index-ZZZZZZZZ.js'), false);
  assert.equal(isStale('index-CVs8dCcx.js', null), false);
  assert.equal(isStale('main.jsx', 'main.jsx'), false);
});
