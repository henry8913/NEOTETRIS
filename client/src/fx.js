import { initialState, reducer } from './game.js';
import { BOARD_COLS, BOARD_ROWS, getShape, ghostY } from './tetris.js';

/**
 * Presentation layer, kept out of the rules.
 *
 * The game reducer stays pure and untouched; this wrapper derives the transient
 * effect state (clear burst, level banner and wash, screen shake, entry flash,
 * hard-drop ripple, TETRIS shockwave) in the same dispatch that produced the
 * game change, so no effect ever needs to call setState. Each layer is removed
 * by its own `animationend`, which dispatches FX_DONE.
 */

export const INITIAL_FX = {
  flash: null,
  banner: null,
  wash: null,
  shock: null,
  shake: null,
  shakeId: 0,
  intro: null,
  introSeq: 0,
  drop: null,
  dropSeq: 0,
};

/**
 * Landing point of a hard drop, as percentages of the playfield, so the UI can
 * draw the ripple exactly where the piece became part of the stack.
 */
function dropMeta(state, fx) {
  const piece = state?.piece;
  if (!piece) return null;

  const { type, x, y, rotation } = piece;
  const shape = getShape(type, rotation);
  let minC = BOARD_COLS;
  let maxC = -1;
  let bottom = -1;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r > bottom) bottom = r;
    }
  }
  if (maxC < 0) return null;

  const landY = ghostY(state.board, type, x, y, rotation) + bottom;
  const id = fx.dropSeq + 1;
  return {
    id,
    color: type,
    x: ((x + (minC + maxC + 1) / 2) / BOARD_COLS) * 100,
    // Centre of the lowest landed cell, so the ring sits on the stack edge.
    y: ((landY + 0.5) / BOARD_ROWS) * 100,
  };
}

export function deriveFx(prev, next, fx) {
  let out = fx;
  const lc = next.lastClear;
  const prevId = prev.lastClear?.id ?? 0;

  // A lock that cleared at least one line: flash the removed rows, throw the
  // neon burst from them and, on a TETRIS / perfect clear, ring the screen.
  if (next.started && lc.id > prevId && lc.count > 0) {
    out = {
      ...out,
      flash: {
        id: lc.id,
        count: lc.count,
        rows: lc.rows,
        colors: lc.colors ?? [],
        perfect: Boolean(lc.perfect),
      },
    };
    if (lc.count >= 4) out = { ...out, shake: { id: `clear-${lc.id}`, kind: 'heavy' } };
    if (lc.count >= 4 || lc.perfect) {
      out = {
        ...out,
        shock: { id: `shock-${lc.id}`, perfect: Boolean(lc.perfect) },
      };
    }
  }
  if (next.started && next.level > (prev.level ?? 1)) {
    out = {
      ...out,
      banner: { id: `level-${next.level}`, level: next.level },
      wash: { id: `wash-${next.level}`, level: next.level },
    };
  }
  if (next.gameOver && !prev.gameOver) {
    out = { ...out, shake: { id: `over-${lc.id}`, kind: 'heavy' } };
  }
  if (next.started && !prev.started) {
    const introSeq = out.introSeq + 1;
    out = { ...out, introSeq, intro: { id: introSeq } };
  }
  return out;
}

/** Game reducer + presentation metadata, still a pure reducer. */
export function reduceAll(state, action) {
  const fx = state.fx ?? INITIAL_FX;

  if (action.type === 'FX_DONE') {
    if (fx[action.key] == null) return state;
    return { ...state, fx: { ...fx, [action.key]: null } };
  }
  if (action.type === 'FX_SHAKE') {
    const shakeId = fx.shakeId + 1;
    return {
      ...state,
      fx: { ...fx, shakeId, shake: { id: `shake-${shakeId}`, kind: action.kind ?? 'light' } },
    };
  }

  // Metadata the reducer cannot know afterwards (the piece moves into the
  // stack on HARD_DROP), computed from the state the action is about to change.
  let base = fx;
  if (
    action.type === 'HARD_DROP' &&
    state.started && !state.gameOver && !state.paused && state.piece
  ) {
    const drop = dropMeta(state, fx);
    if (drop) base = { ...fx, drop, dropSeq: drop.id };
  }

  const next = reducer(state, action);
  const nextFx = deriveFx(state, next, base);
  if (next === state && nextFx === fx) return state;
  return { ...next, fx: nextFx };
}

export function initAll() {
  return { ...initialState(), fx: INITIAL_FX };
}

/** Clears one effect layer (called from `animationend`). */
export function fxDone(key) {
  return { type: 'FX_DONE', key };
}
