import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_NAME } from './leaderboard.js';

/*
 * `storage.js` touches `globalThis.localStorage` lazily inside its helpers
 * (every call is already wrapped in try/catch), so a tiny in-memory shim is
 * enough to exercise the real code paths under `node --test`.
 */
class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  clear() {
    this.#items.clear();
  }
}

const memory = new MemoryStorage();
globalThis.localStorage = memory;

const { loadBest, loadLocalScores, loadName, saveBest, saveLocalScore } = await import(
  './storage.js'
);

const NAME_KEY = 'neotetris.player';

/* ── remembered name ───────────────────────────────────────────── */

test('loadName normalises a legacy stored name instead of echoing it', () => {
  // Older sessions could leave any of these behind; the game-over field must
  // never show them verbatim.
  memory.setItem(NAME_KEY, 'PLAYER ');
  assert.equal(loadName(), 'PLAYER');

  memory.setItem(NAME_KEY, '  Neo   Tetris  ');
  assert.equal(loadName(), 'Neo Tetris');

  memory.setItem(NAME_KEY, 'NE\u0000O\tTET\u001fRIS');
  assert.equal(loadName(), 'NE O TET RIS');
});

test('loadName falls back to PLAYER when the stored name is empty or absent', () => {
  memory.setItem(NAME_KEY, '   ');
  assert.equal(loadName(), DEFAULT_NAME);

  memory.removeItem(NAME_KEY);
  assert.equal(loadName(), DEFAULT_NAME);
});

/* ── best run ──────────────────────────────────────────────────── */

test('saveBest never records a zero-score run', () => {
  memory.clear();

  saveBest({ score: 0, level: 2, lines: 10 });
  assert.equal(loadBest(), null);

  saveBest({ score: 900, level: 4, lines: 40 });
  saveBest({ score: 0, level: 4, lines: 41 });
  assert.equal(loadBest()?.score, 900);
});

/* ── local runs ────────────────────────────────────────────────── */

test('saveLocalScore keeps the stored entry and normalises its name', () => {
  memory.clear();

  const entry = saveLocalScore({ name: ' Henry  ', score: 120, level: 1, lines: 4 });
  assert.equal(entry.name, 'Henry');
  assert.equal(loadLocalScores().length, 1);
  assert.equal(loadLocalScores()[0].score, 120);
});
