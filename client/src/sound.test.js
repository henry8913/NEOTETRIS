import test from 'node:test';
import assert from 'node:assert/strict';

import {
  audioState,
  initAudio,
  isMuted,
  masterVolume,
  playSound,
  setMuted,
} from './sound.js';

/*
 * The audio engine is DOM-heavy: these tests only pin the diagnostic contract
 * and the "never throws" rule, which are the properties the game relies on.
 */

test('audioState reports a documented value before the first gesture', () => {
  assert.ok(['unsupported', 'uninitialized'].includes(audioState()));
});

test('masterVolume follows the mute switch', () => {
  setMuted(false);
  assert.equal(isMuted(), false);
  assert.equal(masterVolume(), 0.45);

  setMuted(true);
  assert.equal(isMuted(), true);
  assert.equal(masterVolume(), 0);

  setMuted(false);
  assert.equal(masterVolume(), 0.45);
});

test('initAudio and playSound never throw without a usable AudioContext', () => {
  assert.doesNotThrow(() => initAudio());
  assert.doesNotThrow(() => playSound('tetris'));
  assert.doesNotThrow(() => playSound('not-a-sound'));
  assert.ok(['unsupported', 'uninitialized'].includes(audioState()));
});
