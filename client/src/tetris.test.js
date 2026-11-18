import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_ROWS,
  BOARD_COLS,
  PIECE_NAMES,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  calcScore,
  clearLines,
  createBoard,
  generateBag,
  getShape,
  ghostY,
  isValid,
  isResting,
  spawnPosition,
  tickSpeed,
  tryRotate,
} from './tetris.js';

test('tuning constants are exported with the expected values', () => {
  assert.equal(LOCK_DELAY_MS, 500);
  assert.equal(MAX_LOCK_RESETS, 15);
  assert.equal(NEXT_QUEUE_SIZE, 3);
});

test('the I piece rotates through the four SRS states', () => {
  const r0 = getShape('I', 0);
  assert.deepEqual(r0[1], [1, 1, 1, 1]);
  assert.equal(r0.flat().filter(Boolean).length, 4);

  const r1 = getShape('I', 1);
  assert.deepEqual(r1.map(row => row[2]), [1, 1, 1, 1]);

  const r2 = getShape('I', 2);
  assert.deepEqual(r2[2], [1, 1, 1, 1]);

  const r3 = getShape('I', 3);
  assert.deepEqual(r3.map(row => row[1]), [1, 1, 1, 1]);

  // Four quarter turns are the identity.
  assert.deepEqual(getShape('I', 4), getShape('I', 0));
});

test('tryRotate kicks the I piece off the left wall', () => {
  const board = createBoard();
  const piece = { type: 'I', x: -2, y: 0, rotation: 1 };
  assert.ok(isValid(board, piece.type, piece.x, piece.y, piece.rotation));

  assert.deepEqual(tryRotate(board, piece, 1), { x: 0, y: 0, rotation: 2 });
  // The piece handed in is never mutated.
  assert.deepEqual(piece, { type: 'I', x: -2, y: 0, rotation: 1 });
});

test('tryRotate kicks the I piece off the right wall', () => {
  const board = createBoard();
  const piece = { type: 'I', x: 7, y: 0, rotation: 1 };
  assert.ok(isValid(board, piece.type, piece.x, piece.y, piece.rotation));

  assert.deepEqual(tryRotate(board, piece, 1), { x: 6, y: 0, rotation: 2 });
});

test('tryRotate kicks T off the left wall on a CCW turn', () => {
  const board = createBoard();
  const piece = { type: 'T', x: -1, y: 2, rotation: 1 };
  assert.ok(isValid(board, piece.type, piece.x, piece.y, piece.rotation));

  assert.deepEqual(tryRotate(board, piece, -1), { x: 0, y: 2, rotation: 0 });
});

test('tryRotate kicks a grounded T back up', () => {
  const board = createBoard();
  const piece = { type: 'T', x: 3, y: BOARD_ROWS - 2, rotation: 0 };
  assert.ok(isResting(board, piece));

  // rotation 1 would poke into the floor: the kick lifts the piece.
  const rotated = tryRotate(board, piece, 1);
  assert.ok(rotated);
  assert.ok(isValid(board, 'T', rotated.x, rotated.y, rotated.rotation));
  assert.equal(rotated.y, piece.y - 1);
});

test('tryRotate returns null when no kick fits', () => {
  const board = createBoard().map(row => row.fill('X'));
  for (const [r, c] of [[0, 1], [1, 0], [1, 1], [1, 2]]) board[r][c] = 0;

  const piece = { type: 'T', x: 0, y: 0, rotation: 0 };
  assert.ok(isValid(board, piece.type, piece.x, piece.y, piece.rotation));
  assert.equal(tryRotate(board, piece, 1), null);
});

test('the O piece rotates without kick tests', () => {
  const board = createBoard();
  const piece = { type: 'O', x: 4, y: 0, rotation: 0 };
  assert.deepEqual(tryRotate(board, piece, 1), { x: 4, y: 0, rotation: 1 });

  // Even when it is boxed in, an O can always "rotate" in place.
  const tight = createBoard().map(row => row.fill('X'));
  for (const [r, c] of [[0, 4], [0, 5], [1, 4], [1, 5]]) tight[r][c] = 0;
  assert.deepEqual(tryRotate(tight, piece, -1), { x: 4, y: 0, rotation: 3 });
});

test('isResting tells when the piece cannot fall', () => {
  const empty = createBoard();
  assert.equal(isResting(empty, { type: 'O', x: 4, y: 0, rotation: 0 }), false);
  assert.equal(isResting(empty, { type: 'O', x: 4, y: BOARD_ROWS - 2, rotation: 0 }), true);

  const stacked = createBoard();
  stacked[BOARD_ROWS - 1].fill('X');
  assert.equal(isResting(stacked, { type: 'O', x: 4, y: BOARD_ROWS - 2, rotation: 0 }), true);
  assert.equal(isResting(stacked, { type: 'T', x: 4, y: BOARD_ROWS - 5, rotation: 0 }), false);
});

test('clearLines removes several rows at once and keeps the rest', () => {
  const board = createBoard();
  for (let r = 16; r < BOARD_ROWS; r++) board[r].fill('T');
  board[15][3] = 'J';

  const [cleaned, cleared] = clearLines(board);
  assert.equal(cleared, 4);
  assert.equal(cleaned.length, BOARD_ROWS);
  assert.equal(cleaned[BOARD_ROWS - 1][3], 'J');
  for (let r = 0; r < BOARD_ROWS - 1; r++) {
    assert.ok(cleaned[r].every(c => c === 0));
  }
});

test('clearLines reports zero when no row is full', () => {
  const board = createBoard();
  board[19][0] = 'S';
  const [cleaned, cleared] = clearLines(board);
  assert.equal(cleared, 0);
  assert.equal(cleaned[19][0], 'S');
});

test('calcScore follows the classic table scaled by level', () => {
  assert.equal(calcScore(0, 1), 0);
  assert.equal(calcScore(1, 1), 100);
  assert.equal(calcScore(2, 1), 300);
  assert.equal(calcScore(3, 1), 500);
  assert.equal(calcScore(4, 1), 800);
  assert.equal(calcScore(4, 2), 1600);
  assert.equal(calcScore(4, 10), 8000);
});

test('generateBag, spawnPosition, ghostY and tickSpeed behave', () => {
  const bag = generateBag();
  assert.deepEqual([...bag].sort(), [...PIECE_NAMES].sort());

  assert.deepEqual(spawnPosition('I'), { x: 3, y: -1 });
  assert.deepEqual(spawnPosition('O'), { x: 4, y: -1 });

  const board = createBoard();
  assert.equal(ghostY(board, 'O', 4, 0, 0), BOARD_ROWS - 2);

  const column = createBoard();
  column[BOARD_ROWS - 1][4] = 'X';
  assert.equal(ghostY(column, 'O', 3, 0, 0), BOARD_ROWS - 3);

  assert.equal(tickSpeed(1), 800);
  assert.equal(tickSpeed(99), 30);
  assert.ok(isValid(createBoard(), 'T', 3, 0, 0));
  assert.equal(BOARD_COLS, 10);
});
