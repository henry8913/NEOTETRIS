/**
 * Minimal WebAudio engine — no audio assets, only oscillators and gain nodes.
 *
 * The AudioContext is created lazily on the first user gesture (`initAudio`),
 * because browsers block audio before an interaction. Every sound is a short
 * envelope at a low master volume, so nothing clips and the game never gets in
 * the way of the music the player might be listening to.
 */

const STORAGE_KEY = 'neotetris.muted';
const MASTER_VOLUME = 0.12;

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
let muted = readMuted();

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistMuted(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage can be blocked (private mode): muting still works in-session */
  }
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
 * Creates (or resumes) the AudioContext. Safe to call on every gesture: it is
 * idempotent and never throws when WebAudio is unavailable.
 */
export function initAudio() {
  try {
    const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtor) return;
    if (!ctx) {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
    master = null;
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
 * gesture, or when the AudioContext is suspended/unavailable.
 */
export function playSound(name) {
  if (muted || !ctx || !master) return;
  if (ctx.state !== 'running') return;
  const notes = SOUNDS[name];
  if (!notes) return;
  try {
    schedule(notes);
  } catch {
    /* never let audio break the game loop */
  }
}
