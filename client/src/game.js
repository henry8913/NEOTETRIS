import {
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  calcScore,
  clearLines,
  createBoard,
  generateBag,
  ghostY,
  isResting,
  isValid,
  lockPiece,
  spawnPosition,
  tryRotate,
} from './tetris.js';

/**
 * Pure game state + reducer. No React, no side effects: everything here can be
 * driven from a test or from a UI frame.
 */

/** True when the player is allowed to act on the current piece. */
function canAct(state) {
  return Boolean(state.started) && !state.gameOver && !state.paused && Boolean(state.piece);
}

/** Builds a fresh piece of `type` at the spawn position. */
export function spawnPiece(type) {
  const { x, y } = spawnPosition(type);
  return { type, x, y, rotation: 0 };
}

/**
 * Draws one type from the bag, appending a fresh 7-bag whenever fewer than 7
 * entries are left (keeps the 7-bag distribution intact).
 */
export function takeNext(bag) {
  const next = bag.length >= 7 ? [...bag] : [...bag, ...generateBag()];
  const type = next.shift();
  return { type, bag: next };
}

/**
 * Shifts the head of the preview queue, refilling it from the bag so that
 * exactly NEXT_QUEUE_SIZE pieces remain.
 */
export function takeFromQueue(queue, bag) {
  const q = [...queue];
  let b = bag;
  while (q.length < NEXT_QUEUE_SIZE + 1) {
    const drawn = takeNext(b);
    b = drawn.bag;
    q.push(drawn.type);
  }
  const type = q.shift();
  return { type, queue: q, bag: b };
}

export function initialState() {
  const drawn = takeFromQueue([], generateBag());
  return {
    board: createBoard(),
    piece: spawnPiece(drawn.type),
    nextQueue: drawn.queue,
    bag: drawn.bag,
    holdType: null,
    canHold: true,
    paused: false,
    lockResets: 0,
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    started: false,
  };
}

function startState() {
  return { ...initialState(), started: true };
}

/** Adds one lock-delay reset, capped at MAX_LOCK_RESETS. */
function bumpResets(state) {
  return state.lockResets < MAX_LOCK_RESETS ? state.lockResets + 1 : state.lockResets;
}

/**
 * Locks the current piece into the board, clears lines, scores and spawns the
 * next piece from the queue. A blocked spawn ends the run.
 */
export function lockReduce(state) {
  const { board, piece } = state;
  const [cleaned, cleared] = clearLines(
    lockPiece(board, piece.type, piece.x, piece.y, piece.rotation),
  );

  const lines = state.lines + cleared;
  const level = Math.floor(lines / 10) + 1;
  // Points are awarded with the level the lines were cleared at.
  const score = state.score + calcScore(cleared, state.level);

  const drawn = takeFromQueue(state.nextQueue, state.bag);
  const nextPiece = spawnPiece(drawn.type);

  const locked = {
    ...state,
    board: cleaned,
    nextQueue: drawn.queue,
    bag: drawn.bag,
    score,
    level,
    lines,
    canHold: true,
    lockResets: 0,
  };

  if (!isValid(cleaned, nextPiece.type, nextPiece.x, nextPiece.y, nextPiece.rotation)) {
    return { ...locked, piece: null, gameOver: true };
  }
  return { ...locked, piece: nextPiece };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return startState();

    case 'RESET':
      return initialState();

    case 'MOVE': {
      if (!canAct(state)) return state;
      const { dx = 0, dy = 0 } = action;
      const { type, x, y, rotation } = state.piece;
      const moved = { ...state.piece, x: x + dx, y: y + dy };

      if (isValid(state.board, type, moved.x, moved.y, rotation)) {
        const resets = dx !== 0 && isResting(state.board, moved)
          ? bumpResets(state)
          : state.lockResets;
        return { ...state, piece: moved, lockResets: resets };
      }
      // Soft drop into the floor locks immediately.
      if (dy === 1) return lockReduce(state);
      return state;
    }

    case 'ROTATE': {
      if (!canAct(state)) return state;
      const rotated = tryRotate(state.board, state.piece, action.dir ?? 1);
      if (!rotated) return state;
      const piece = { ...state.piece, ...rotated };
      const resets = isResting(state.board, piece)
        ? bumpResets(state)
        : state.lockResets;
      return { ...state, piece, lockResets: resets };
    }

    case 'HARD_DROP': {
      if (!canAct(state)) return state;
      const { type, x, y, rotation } = state.piece;
      const dropped = { ...state.piece, y: ghostY(state.board, type, x, y, rotation) };
      return lockReduce({ ...state, piece: dropped });
    }

    case 'TICK': {
      if (!canAct(state)) return state;
      // Falls when possible; grounding is handled by the lock delay (LOCK).
      const { type, x, y, rotation } = state.piece;
      if (!isValid(state.board, type, x, y + 1, rotation)) return state;
      return { ...state, piece: { ...state.piece, y: y + 1 } };
    }

    case 'LOCK': {
      if (!canAct(state)) return state;
      return lockReduce(state);
    }

    case 'HOLD': {
      if (!canAct(state) || !state.canHold) return state;
      const held = state.holdType;
      const current = state.piece.type;

      if (held === null) {
        const drawn = takeFromQueue(state.nextQueue, state.bag);
        const piece = spawnPiece(drawn.type);
        const swapped = {
          ...state,
          holdType: current,
          nextQueue: drawn.queue,
          bag: drawn.bag,
          canHold: false,
          lockResets: 0,
        };
        if (!isValid(state.board, piece.type, piece.x, piece.y, piece.rotation)) {
          return { ...swapped, piece: null, gameOver: true };
        }
        return { ...swapped, piece };
      }

      const piece = spawnPiece(held);
      const swapped = {
        ...state,
        holdType: current,
        canHold: false,
        lockResets: 0,
      };
      if (!isValid(state.board, piece.type, piece.x, piece.y, piece.rotation)) {
        return { ...swapped, piece: null, gameOver: true };
      }
      return { ...swapped, piece };
    }

    case 'TOGGLE_PAUSE': {
      if (!state.started || state.gameOver) return state;
      return { ...state, paused: !state.paused };
    }

    default:
      return state;
  }
}
