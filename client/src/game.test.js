import test from 'node:test';
import assert from 'node:assert/strict';

import { initialState, reducer, takeNext } from './game.js';
import {
  BOARD_ROWS,
  BOARD_COLS,
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  PIECE_NAMES,
  createBoard,
  generateBag,
} from './tetris.js';

function started() {
  return reducer(initialState(), { type: 'START' });
}

test('START resets the board and fills the preview queue', () => {
  const state = started();

  assert.equal(state.started, true);
  assert.equal(state.gameOver, false);
  assert.equal(state.paused, false);
  assert.equal(state.score, 0);
  assert.equal(state.level, 1);
  assert.equal(state.lines, 0);
  assert.equal(state.holdType, null);
  assert.equal(state.canHold, true);
  assert.equal(state.lockResets, 0);

  assert.equal(state.board.length, BOARD_ROWS);
  assert.ok(state.board.every(row => row.length === BOARD_COLS));
  assert.ok(state.board.every(row => row.every(cell => cell === 0)));

  assert.ok(PIECE_NAMES.includes(state.piece.type));
  assert.equal(state.piece.rotation, 0);
  assert.equal(state.nextQueue.length, NEXT_QUEUE_SIZE);
  assert.equal(state.nextQueue.filter(t => t === undefined).length, 0);
  assert.ok(state.nextQueue.every(type => PIECE_NAMES.includes(type)));
});

test('RESET goes back to the idle screen', () => {
  const state = reducer(started(), { type: 'RESET' });
  assert.equal(state.started, false);
  assert.equal(state.score, 0);
  assert.ok(PIECE_NAMES.includes(state.piece.type));
});

test('HOLD with an empty slot stores the piece and spawns from the queue', () => {
  const state = started();
  const held = state.piece.type;
  const upcoming = state.nextQueue[0];

  const next = reducer(state, { type: 'HOLD' });

  assert.equal(next.holdType, held);
  assert.equal(next.piece.type, upcoming);
  assert.equal(next.piece.rotation, 0);
  assert.equal(next.canHold, false);
  assert.equal(next.lockResets, 0);
  assert.equal(next.nextQueue.length, NEXT_QUEUE_SIZE);
});

test('a second HOLD without a lock is a no-op', () => {
  const held = reducer(started(), { type: 'HOLD' });
  assert.equal(reducer(held, { type: 'HOLD' }), held);
});

test('HOLD swaps the pieces once the current one has locked', () => {
  let state = started();
  const first = state.piece.type;

  state = reducer(state, { type: 'HOLD' });        // first -> hold, queue[0] -> board
  const active = state.piece.type;
  assert.equal(state.holdType, first);
  assert.notEqual(active, first);

  state = reducer(state, { type: 'HARD_DROP' });   // lock, canHold is back
  assert.equal(state.canHold, true);

  const beforeSwap = state.piece.type;
  state = reducer(state, { type: 'HOLD' });

  assert.equal(state.holdType, beforeSwap);
  assert.equal(state.piece.type, first);
  assert.equal(state.canHold, false);
});

test('HARD_DROP locks the piece and scores the cleared lines', () => {
  const base = started();
  const board = createBoard();
  for (let r = 18; r < BOARD_ROWS; r++) {
    for (let c = 2; c < BOARD_COLS; c++) board[r][c] = 'X';
  }

  const state = {
    ...base,
    board,
    piece: { type: 'O', x: 0, y: 0, rotation: 0 },
    lockResets: 4,
  };
  const next = reducer(state, { type: 'HARD_DROP' });

  assert.equal(next.lines, 2);
  assert.equal(next.score, 300);
  assert.equal(next.level, 1);
  assert.equal(next.lockResets, 0);
  assert.ok(next.piece);
  assert.ok(next.board[BOARD_ROWS - 1].every(cell => cell === 0));
  assert.ok(next.board[BOARD_ROWS - 2].every(cell => cell === 0));
});

test('TICK does not lock a resting piece, LOCK does', () => {
  const base = started();
  const state = {
    ...base,
    piece: { type: 'O', x: 4, y: BOARD_ROWS - 2, rotation: 0 },
  };

  assert.equal(reducer(state, { type: 'TICK' }), state);

  const locked = reducer(state, { type: 'LOCK' });
  assert.notEqual(locked, state);
  assert.equal(locked.board[BOARD_ROWS - 1][4], 'O');
  assert.equal(locked.board[BOARD_ROWS - 2][5], 'O');
  assert.ok(locked.piece);
  assert.equal(locked.lockResets, 0);
});

test('TICK moves a falling piece down by one row', () => {
  const state = started();
  const next = reducer(state, { type: 'TICK' });
  assert.equal(next.piece.y, state.piece.y + 1);
  assert.equal(next.board, state.board);
});

test('lock resets accumulate at rest and stop at the cap', () => {
  const base = started();
  const resting = {
    ...base,
    piece: { type: 'O', x: 4, y: BOARD_ROWS - 2, rotation: 0 },
  };

  const moved = reducer(resting, { type: 'MOVE', dx: -1, dy: 0 });
  assert.equal(moved.piece.x, 3);
  assert.equal(moved.lockResets, 1);

  const rotated = reducer({
    ...moved,
    lockResets: 0,
    piece: { type: 'T', x: 4, y: BOARD_ROWS - 2, rotation: 0 },
  }, { type: 'ROTATE' });
  assert.equal(rotated.lockResets, 1);
  assert.notEqual(rotated.piece.rotation, 0);

  const capped = reducer({ ...resting, lockResets: MAX_LOCK_RESETS }, { type: 'MOVE', dx: 1, dy: 0 });
  assert.equal(capped.lockResets, MAX_LOCK_RESETS);

  const airborne = { ...base, piece: { type: 'O', x: 4, y: 0, rotation: 0 } };
  assert.equal(reducer(airborne, { type: 'MOVE', dx: -1, dy: 0 }).lockResets, 0);
});

test('soft drop into the floor locks immediately', () => {
  const base = started();
  const state = {
    ...base,
    piece: { type: 'O', x: 4, y: BOARD_ROWS - 2, rotation: 0 },
  };
  const next = reducer(state, { type: 'MOVE', dx: 0, dy: 1 });
  assert.equal(next.board[BOARD_ROWS - 1][4], 'O');
  assert.ok(next.piece);
});

test('pause blocks MOVE, TICK, ROTATE, HOLD and HARD_DROP', () => {
  const paused = reducer(started(), { type: 'TOGGLE_PAUSE' });
  assert.equal(paused.paused, true);

  for (const action of [
    { type: 'MOVE', dx: -1, dy: 0 },
    { type: 'MOVE', dx: 0, dy: 1 },
    { type: 'TICK' },
    { type: 'ROTATE' },
    { type: 'HOLD' },
    { type: 'HARD_DROP' },
    { type: 'LOCK' },
  ]) {
    assert.equal(reducer(paused, action), paused, `${action.type} must be ignored`);
  }

  const resumed = reducer(paused, { type: 'TOGGLE_PAUSE' });
  assert.equal(resumed.paused, false);
  assert.notEqual(reducer(resumed, { type: 'MOVE', dx: -1, dy: 0 }), resumed);
});

test('pause is not available before the start or after game over', () => {
  const idle = initialState();
  assert.equal(reducer(idle, { type: 'TOGGLE_PAUSE' }), idle);

  const over = { ...started(), gameOver: true };
  assert.equal(reducer(over, { type: 'TOGGLE_PAUSE' }), over);
});

test('game over when the spawn area is blocked', () => {
  const base = started();
  const board = createBoard();
  // Blocks every piece type at its spawn columns without filling a whole row.
  for (let c = 3; c <= 6; c++) {
    board[0][c] = 'X';
    board[1][c] = 'X';
  }

  const state = {
    ...base,
    board,
    piece: { type: 'O', x: 4, y: BOARD_ROWS - 4, rotation: 0 },
  };
  const next = reducer(state, { type: 'HARD_DROP' });

  assert.equal(next.gameOver, true);
  assert.equal(next.piece, null);
  assert.equal(next.board[BOARD_ROWS - 1][4], 'O');

  // Everything is inert once the run is over.
  assert.equal(reducer(next, { type: 'MOVE', dx: -1, dy: 0 }), next);
  assert.equal(reducer(next, { type: 'LOCK' }), next);
});

test('the queue never runs dry and follows the 7-bag', () => {
  let state = started();
  // One entry per piece that actually becomes active, in draw order.
  const drawn = [state.piece.type];

  while (drawn.length < 35) {
    state = reducer({ ...state, board: createBoard() }, { type: 'HARD_DROP' });
    assert.ok(state.piece, 'a new piece must spawn');
    assert.equal(state.nextQueue.length, NEXT_QUEUE_SIZE);
    assert.ok(state.nextQueue.every(type => PIECE_NAMES.includes(type)));
    drawn.push(state.piece.type);
  }

  assert.equal(drawn.length, 35);
  assert.ok(drawn.every(type => PIECE_NAMES.includes(type)));

  const sortedPieces = [...PIECE_NAMES].sort();
  for (let i = 0; i + 7 <= drawn.length; i += 7) {
    assert.deepEqual([...drawn.slice(i, i + 7)].sort(), sortedPieces, `bag starting at ${i}`);
  }
});

test('takeNext refills the bag with complete 7-bags', () => {
  let bag = generateBag();
  const seen = [];

  for (let i = 0; i < 28; i++) {
    const drawn = takeNext(bag);
    bag = drawn.bag;
    assert.ok(PIECE_NAMES.includes(drawn.type));
    seen.push(drawn.type);
  }

  const sortedPieces = [...PIECE_NAMES].sort();
  for (let i = 0; i < seen.length; i += 7) {
    assert.deepEqual([...seen.slice(i, i + 7)].sort(), sortedPieces);
  }
  assert.ok(bag.length >= 7);
});
