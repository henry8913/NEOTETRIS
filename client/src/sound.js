/**
 * Minimal WebAudio engine — no audio assets, only oscillators and gain nodes.
 *
 * The AudioContext is created lazily on the first gesture (`initAudio`),
 * because browsers block audio before an interaction. The signal path is
 * `voice → master gain → compressor → destination`: the compressor keeps the
 * mix loud enough for a phone speaker without ever clipping, which is why the
 * master sits high (0.45) while every note envelope stays short and soft.
 *
 * Mobile reality check: iOS starts the context `suspended` (and can interrupt
 * it again on a call, a screen lock or an app switch). Nothing here throws and
 * no sound is dropped because of it: `playSound` resumes and schedules, and
 * the app re-arms the context from persistent, passive gestures (see App.jsx).
 */

const STORAGE_KEY = 'neotetris.muted';
const MASTER_VOLUME = 0.45;

/** Phone-speaker friendly glue: −18 dB threshold, 6:1, fast attack. */
const COMPRESSOR = {
  threshold: -18,
  knee: 12,
  ratio: 6,
  attack: 0.003,
  release: 0.25,
};

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
/** @type {DynamicsCompressorNode | null} */
let bus = null;
/** The iOS silent-buffer unlock only has to happen once per page. */
let unlocked = false;
let muted = readMuted();

function readMuted() {
  try {
    // `window` is the browser-only guard: Node exposes a stub `localStorage`
    // that warns on access, and the game never runs without a window.
    return globalThis.window?.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistMuted(value) {
  try {
    globalThis.window?.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage can be blocked (private mode): muting still works in-session */
  }
}

function audioCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext;
}

/** True when the player silenced the game (persisted across reloads). */
export function isMuted() {
  return muted;
}

/** Silences/un-silences the engine and remembers the choice. */
export function setMuted(next) {
  muted = Boolean(next);
  persistMuted(muted);
  if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
}

/**
 * Diagnostic only (never printed): reports the engine state so a bug report or
 * a test can tell "no gesture yet" from "blocked by the browser".
 *
 * @returns {'uninitialized' | 'suspended' | 'running' | 'unsupported'}
 */
export function audioState() {
  if (typeof audioCtor() !== 'function') return 'unsupported';
  if (!ctx) return 'uninitialized';
  return ctx.state === 'running' ? 'running' : 'suspended';
}

/** Diagnostic only: the effective master gain (0 while muted). */
export function masterVolume() {
  return muted ? 0 : MASTER_VOLUME;
}

/**
 * The iOS workaround: playing one silent sample through the context flips the
 * page's audio session from "ambient/locked" to "playable". Harmless elsewhere.
 */
function unlockSession() {
  if (unlocked || !ctx) return;
  unlocked = true;
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* older engines: the silent buffer is a no-op, nothing to recover from */
  }
}

/**
 * Creates (or resumes) the AudioContext. Safe to call on every gesture: it is
 * idempotent, returns immediately while the context runs and never throws when
 * WebAudio is unavailable.
 */
export function initAudio() {
  try {
    const AudioCtor = audioCtor();
    if (!AudioCtor) return;

    if (!ctx) {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      bus = ctx.createDynamicsCompressor();
      bus.threshold.value = COMPRESSOR.threshold;
      bus.knee.value = COMPRESSOR.knee;
      bus.ratio.value = COMPRESSOR.ratio;
      bus.attack.value = COMPRESSOR.attack;
      bus.release.value = COMPRESSOR.release;
      master.connect(bus).connect(ctx.destination);
      unlockSession();
    }

    // Cheap guard: once running, every later gesture is a no-op.
    if (ctx.state === 'running') return;
    if (typeof ctx.resume === 'function') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
    master = null;
    bus = null;
  }
}

/*
 * Each sound is a tiny score: `f` start frequency, `t` end frequency (optional
 * glide), `d` duration in seconds, `delay` offset inside the score, `type`
 * waveform and `g` peak gain (0..1, before the master volume).
 */
const SOUNDS = {
  move: [{ f: 210, t: 170, d: 0.045, type: 'square', g: 0.3 }],
  rotate: [{ f: 360, t: 520, d: 0.055, type: 'triangle', g: 0.4 }],
  lock: [{ f: 160, t: 70, d: 0.09, type: 'sine', g: 0.7 }],
  hold: [{ f: 300, t: 460, d: 0.07, type: 'sine', g: 0.45 }],
  clear1: [{ f: 520, t: 780, d: 0.1, type: 'triangle', g: 0.45 }],
  clear2: [
    { f: 520, t: 620, d: 0.09, type: 'triangle', g: 0.45 },
    { f: 780, t: 900, d: 0.1, type: 'triangle', g: 0.4, delay: 0.07 },
  ],
  clear3: [
    { f: 520, t: 600, d: 0.08, type: 'triangle', g: 0.42 },
    { f: 700, t: 780, d: 0.08, type: 'triangle', g: 0.42, delay: 0.06 },
    { f: 900, t: 980, d: 0.09, type: 'triangle', g: 0.4, delay: 0.12 },
  ],
  clear4: [
    { f: 520, t: 560, d: 0.08, type: 'triangle', g: 0.45 },
    { f: 700, t: 760, d: 0.08, type: 'triangle', g: 0.45, delay: 0.06 },
    { f: 880, t: 940, d: 0.08, type: 'triangle', g: 0.45, delay: 0.12 },
    { f: 1180, t: 1320, d: 0.16, type: 'triangle', g: 0.5, delay: 0.18 },
  ],
  // Four lines: a wider, brighter arpeggio than the 1-3 ladder.
  tetris: [
    { f: 660, t: 660, d: 0.07, type: 'square', g: 0.26 },
    { f: 880, t: 880, d: 0.07, type: 'square', g: 0.26, delay: 0.07 },
    { f: 1100, t: 1100, d: 0.08, type: 'triangle', g: 0.3, delay: 0.14 },
    { f: 1320, t: 1760, d: 0.22, type: 'triangle', g: 0.4, delay: 0.2 },
  ],
  // Empty board: a glassy sparkle over a low confirmation thump.
  perfect: [
    { f: 220, t: 110, d: 0.3, type: 'sine', g: 0.38 },
    { f: 880, t: 1320, d: 0.12, type: 'sine', g: 0.32, delay: 0.04 },
    { f: 1320, t: 1980, d: 0.14, type: 'sine', g: 0.28, delay: 0.12 },
    { f: 1760, t: 2640, d: 0.18, type: 'triangle', g: 0.26, delay: 0.2 },
  ],
  levelup: [
    { f: 480, t: 480, d: 0.07, type: 'square', g: 0.28 },
    { f: 720, t: 720, d: 0.07, type: 'square', g: 0.28, delay: 0.07 },
    { f: 960, t: 1080, d: 0.14, type: 'square', g: 0.26, delay: 0.14 },
  ],
  gameover: [
    { f: 420, t: 300, d: 0.16, type: 'sawtooth', g: 0.3 },
    { f: 300, t: 190, d: 0.18, type: 'sawtooth', g: 0.3, delay: 0.16 },
    { f: 190, t: 80, d: 0.34, type: 'sine', g: 0.42, delay: 0.32 },
  ],
  start: [
    { f: 260, t: 520, d: 0.12, type: 'triangle', g: 0.4 },
    { f: 520, t: 880, d: 0.16, type: 'triangle', g: 0.36, delay: 0.1 },
  ],
  'ui-click': [{ f: 620, t: 700, d: 0.035, type: 'square', g: 0.26 }],
};

function schedule(notes) {
  if (!ctx || !master) return;
  const now = ctx.currentTime + 0.005;

  for (const note of notes) {
    const at = now + (note.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = note.type || 'triangle';
    osc.frequency.setValueAtTime(note.f, at);
    if (note.t && note.t !== note.f) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(note.t, 20), at + note.d);
    }

    const peak = note.g ?? 0.4;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.d);

    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + note.d + 0.03);
  }
}

/**
 * Plays one named sound. Silent (and harmless) when muted, before the first
 * gesture or when the browser has no WebAudio.
 *
 * A suspended context is resumed and the notes are scheduled *after* the
 * promise resolves: on iOS the first sounds arrive while the context is still
 * waking up, and dropping them would leave the phone silent for a while.
 */
export function playSound(name) {
  if (muted || !ctx || !master) return;
  const notes = SOUNDS[name];
  if (!notes) return;

  try {
    if (ctx.state === 'running') {
      schedule(notes);
      return;
    }
    // Suspended (iOS first gesture, app switch, call, screen lock): wake first,
    // then schedule. A closed context rejects and is simply ignored.
    if (typeof ctx.resume !== 'function') return;
    ctx
      .resume()
      .then(() => {
        if (!muted) schedule(notes);
      })
      .catch(() => {});
  } catch {
    /* never let audio break the game loop */
  }
}
