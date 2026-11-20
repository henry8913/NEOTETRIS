import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDLE_SAVE_SESSION,
  clearSaveSession,
  patchSaveSession,
  readSaveSession,
  resetSaveSessions,
  subscribeSaveSession,
} from './saveSession.js';

/*
 * The store behind the game-over save flow. It exists because a layout flip
 * (resize / rotation / on-screen keyboard) unmounts and remounts the whole stage
 * subtree in App.jsx: without it a save that landed during the flip was lost —
 * the run was on the server, the player still saw the form, a second submit
 * wrote a second row and the rankings never opened.
 *
 * Every test starts from a clean registry: the module keeps state between
 * imports on purpose (it has to outlive a component).
 */

test('an unknown run reads as idle', () => {
  resetSaveSessions();
  const session = readSaveSession('run-1');
  assert.equal(session.status, 'idle');
  assert.equal(session.attempted, false);
  assert.equal(session.pendingOpen, false);
  assert.equal(session.key, '');
  assert.equal(session.rank, null);
  assert.deepEqual(session, { ...IDLE_SAVE_SESSION });
});

test('patch/read round-trips a save in flight and its confirmation', () => {
  resetSaveSessions();
  patchSaveSession(7, { status: 'saving', name: 'NEO', key: 'k-1', attempted: true });
  let session = readSaveSession(7);
  assert.equal(session.status, 'saving');
  assert.equal(session.name, 'NEO');
  assert.equal(session.key, 'k-1');
  assert.equal(session.attempted, true);

  const entry = { id: 'srv-1', name: 'NEO', score: 1200, level: 3, lines: 12 };
  patchSaveSession(7, { status: 'saved', rank: 4, savedEntry: entry, pendingOpen: true });
  session = readSaveSession(7);
  assert.equal(session.status, 'saved');
  assert.equal(session.rank, 4);
  assert.equal(session.pendingOpen, true);
  // The earlier fields are merged, not replaced.
  assert.equal(session.key, 'k-1');
  assert.deepEqual(session.savedEntry, entry);
});

test('reads are copies: mutating one never leaks back into the store', () => {
  resetSaveSessions();
  patchSaveSession(1, { name: 'NEO' });
  const copy = readSaveSession(1);
  copy.name = 'HACKED';
  copy.status = 'saved';
  assert.equal(readSaveSession(1).name, 'NEO');
  assert.equal(readSaveSession(1).status, 'idle');
});

test('pendingOpen is consumed exactly once', () => {
  resetSaveSessions();
  patchSaveSession('run-a', { status: 'saved', pendingOpen: true });
  const first = readSaveSession('run-a');
  assert.equal(first.pendingOpen, true);
  patchSaveSession('run-a', { pendingOpen: false });
  // The next consumer (a remounted instance, a re-run effect) sees nothing.
  assert.equal(readSaveSession('run-a').pendingOpen, false);
  assert.equal(readSaveSession('run-a').status, 'saved');
});

test('the registry is pruned to the last two runs', () => {
  resetSaveSessions();
  patchSaveSession(1, { name: 'ONE' });
  patchSaveSession(2, { name: 'TWO' });
  patchSaveSession(3, { name: 'THREE' });

  assert.equal(readSaveSession(1).status, 'idle');
  assert.equal(readSaveSession(1).name, '');
  assert.equal(readSaveSession(2).name, 'TWO');
  assert.equal(readSaveSession(3).name, 'THREE');
});

test('pruning drops the least recently used run, not the first inserted', () => {
  resetSaveSessions();
  patchSaveSession('a', { name: 'A' });
  patchSaveSession('b', { name: 'B' });
  // Touching `a` makes `b` the oldest.
  patchSaveSession('a', { rank: 2 });
  patchSaveSession('c', { name: 'C' });

  assert.equal(readSaveSession('b').status, 'idle');
  assert.equal(readSaveSession('a').rank, 2);
  assert.equal(readSaveSession('c').name, 'C');
});

test('clearSaveSession forgets one run and leaves the others alone', () => {
  resetSaveSessions();
  patchSaveSession('keep', { status: 'saved', name: 'KEEP' });
  patchSaveSession('drop', { status: 'saved', name: 'DROP' });
  clearSaveSession('drop');

  assert.equal(readSaveSession('drop').status, 'idle');
  assert.equal(readSaveSession('keep').status, 'saved');
  // Clearing twice is safe.
  clearSaveSession('drop');
});

test('subscribeSaveSession notifies after every patch and unsubscribes cleanly', () => {
  resetSaveSessions();
  const seen = [];
  const off = subscribeSaveSession('run-s', (session) => seen.push(session.status));

  patchSaveSession('run-s', { status: 'saving' });
  patchSaveSession('run-s', { status: 'saved', pendingOpen: true });
  off();
  patchSaveSession('run-s', { status: 'error' });

  assert.deepEqual(seen, ['saving', 'saved']);
  // No listener left behind once the last one unsubscribes.
  const again = [];
  const offAgain = subscribeSaveSession('run-s', (session) => again.push(session.status));
  patchSaveSession('run-s', { status: 'saved' });
  offAgain();
  assert.deepEqual(again, ['saved']);
});

test('a listener can consume the pending flag without losing the saved status', () => {
  resetSaveSessions();
  let opens = 0;
  const off = subscribeSaveSession('run-late', (session) => {
    if (session.status === 'saved' && session.pendingOpen) {
      patchSaveSession('run-late', { pendingOpen: false });
      opens += 1;
    }
  });
  // The response of an unmounted instance lands here.
  patchSaveSession('run-late', { status: 'saved', pendingOpen: true });
  patchSaveSession('run-late', { attempted: true, name: 'NEO' });
  off();
  assert.equal(opens, 1);
  assert.equal(readSaveSession('run-late').status, 'saved');
  assert.equal(readSaveSession('run-late').pendingOpen, false);
});

test('a new run starts from idle even right after a saved one', () => {
  resetSaveSessions();
  patchSaveSession(4, {
    status: 'saved',
    name: 'OLD',
    key: 'k-4',
    pendingOpen: true,
  });
  // START bumps runId and remounts Overlays under a new key: the fresh run must
  // not inherit the frozen name, the key or the pending modal.
  const fresh = readSaveSession(5);
  assert.equal(fresh.status, 'idle');
  assert.equal(fresh.name, '');
  assert.equal(fresh.key, '');
  assert.equal(fresh.pendingOpen, false);
});
