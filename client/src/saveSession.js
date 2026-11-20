/**
 * Per-run save state that survives a component remount.
 *
 * Why this exists: `App.jsx` renders the same `stage` element inside two
 * different `<main>` elements, one per composition. When `wide` flips (a window
 * resize, a rotation, and on iOS the on-screen keyboard shrinking the viewport)
 * React unmounts and remounts the whole stage subtree, `<Overlays>` included.
 * Before this module, a flip during a save left a brand-new Overlays with
 * `saveStatus: 'idle'`, an empty `keyRef` and `savedRef: false` — the run was on
 * the server, but the player still saw the name form, the rankings never
 * opened, and a second submit wrote a second row under a new key.
 *
 * So the save state of a run lives here, keyed by `runId`, and the component is
 * only a view over it: every transition is written **before** the corresponding
 * `setState`, and a response that arrives after unmount still lands.
 *
 * Deliberately in memory only: a page reload has to start clean, and a stale
 * `saved` row from a previous session must never swallow the next attempt.
 * Bounded to the last `MAX_SESSIONS` runs so nothing accumulates.
 */

const MAX_SESSIONS = 2;

/** The shape every run starts from. Frozen: callers get copies, never this. */
export const IDLE_SAVE_SESSION = Object.freeze({
  status: 'idle', // idle | saving | saved | error
  name: '',
  rank: null,
  key: '',
  savedEntry: null,
  attempted: false,
  pendingOpen: false,
  error: '',
});

/** runId → session. Values are replaced on every patch (never mutated). */
const sessions = new Map();
/** runId → touch counter, so pruning drops the least recently used run. */
const recency = new Map();
/** runId → Set<listener>, notified after each patch. */
const listeners = new Map();
let clock = 0;

function prune() {
  if (sessions.size <= MAX_SESSIONS) return;
  const ordered = [...recency.entries()].sort((a, b) => a[1] - b[1]);
  const excess = ordered.length - MAX_SESSIONS;
  for (let i = 0; i < excess; i += 1) {
    const [runId] = ordered[i];
    sessions.delete(runId);
    recency.delete(runId);
    listeners.delete(runId);
  }
}

function notify(runId) {
  const set = listeners.get(runId);
  if (!set) return;
  const snapshot = readSaveSession(runId);
  for (const listener of set) listener(snapshot);
}

/** The save state of `runId` (a copy; `idle` for a run never seen). */
export function readSaveSession(runId) {
  const entry = sessions.get(runId);
  return entry ? { ...entry } : { ...IDLE_SAVE_SESSION };
}

/** Merge `patch` into the run's state and notify subscribers. */
export function patchSaveSession(runId, patch) {
  if (runId === undefined || runId === null) return readSaveSession(runId);
  const next = { ...readSaveSession(runId), ...patch };
  sessions.set(runId, next);
  recency.set(runId, (clock += 1));
  prune();
  notify(runId);
  return { ...next };
}

/** Forget a run (a rebooted/replaced session, or test cleanup). */
export function clearSaveSession(runId) {
  sessions.delete(runId);
  recency.delete(runId);
  listeners.delete(runId);
}

/**
 * Observe a run's save state. The listener receives a fresh copy after every
 * patch; the returned function unsubscribes. Used by `Overlays` so a response
 * that lands after a remount still reaches the mounted instance.
 */
export function subscribeSaveSession(runId, listener) {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(runId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(runId);
  };
}

/** Test hook: forget every run (and the listener registry). */
export function resetSaveSessions() {
  sessions.clear();
  recency.clear();
  listeners.clear();
  clock = 0;
}
