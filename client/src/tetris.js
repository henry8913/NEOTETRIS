export const BOARD_ROWS = 20;
export const BOARD_COLS = 10;

/** Grace period before a grounded piece locks. */
export const LOCK_DELAY_MS = 500;
/** Maximum number of lock-delay resets per piece. */
export const MAX_LOCK_RESETS = 15;
/** Number of pieces shown in the preview queue. */
export const NEXT_QUEUE_SIZE = 3;

const PIECE_SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

export const PIECE_NAMES = ['I','O','T','S','Z','J','L'];

export const COLORS = {
  I: '#00f0f0', O: '#f0f000', T: '#a000f0',
  S: '#00f000', Z: '#f00000', J: '#0000f0', L: '#f0a000',
};

/*
 * SRS wall kicks.
 *
 * The canonical SRS tables are written with y pointing up; the game board uses
 * screen coordinates (y pointing down), so every y below is the negated
 * canonical value (`+y` = one cell down, `-y` = one cell up). That keeps the
 * floor/ceiling kicks on the side they belong to.
 *
 * Keys are `from>to` rotation states (0 = spawn, 1 = R, 2 = 180, 3 = L).
 */
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function createBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(0));
}

function rotateMatrix(m) {
  const N = m.length;
  const r = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      r[j][N - 1 - i] = m[i][j];
  return r;
}

export function getShape(type, rotation = 0) {
  let s = PIECE_SHAPES[type];
  for (let i = 0; i < rotation; i++) s = rotateMatrix(s);
  return s;
}

export function isValid(board, type, x, y, rotation) {
  const shape = getShape(type, rotation);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = x + c, ny = y + r;
      if (nx < 0 || nx >= BOARD_COLS || ny >= BOARD_ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

/**
 * Tries to rotate `piece` by 90° (dir = 1) or -90° (dir = -1), walking the SRS
 * kick table until a position fits. Returns `{ x, y, rotation }` or `null`.
 * The given piece is never mutated.
 */
export function tryRotate(board, piece, dir = 1) {
  if (!piece) return null;
  const { type, x, y } = piece;
  const from = ((piece.rotation % 4) + 4) % 4;
  const to = (from + (dir > 0 ? 1 : 3)) % 4;

  // O is rotationally symmetric: no kick tests needed.
  if (type === 'O') return { x, y, rotation: to };

  const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[`${from}>${to}`] || [[0, 0]];
  for (const [kx, ky] of kicks) {
    const nx = x + kx;
    const ny = y + ky;
    if (isValid(board, type, nx, ny, to)) return { x: nx, y: ny, rotation: to };
  }
  return null;
}

/** True when the piece cannot move one cell down. */
export function isResting(board, piece) {
  if (!piece) return false;
  return !isValid(board, piece.type, piece.x, piece.y + 1, piece.rotation);
}

export function lockPiece(board, type, x, y, rotation) {
  const b = board.map(row => [...row]);
  const shape = getShape(type, rotation);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const ny = y + r, nx = x + c;
        if (ny >= 0 && ny < BOARD_ROWS && nx >= 0 && nx < BOARD_COLS)
          b[ny][nx] = type;
      }
  return b;
}

export function clearLines(board) {
  const kept = board.filter(row => row.some(c => c === 0));
  const cleared = BOARD_ROWS - kept.length;
  while (kept.length < BOARD_ROWS) kept.unshift(Array(BOARD_COLS).fill(0));
  return [kept, cleared];
}

export function calcScore(linesCleared, level) {
  return ([0, 100, 300, 500, 800][linesCleared] || 0) * level;
}

export function generateBag() {
  const a = [...PIECE_NAMES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function spawnPosition(type) {
  const shape = getShape(type, 0);
  return { x: Math.floor((BOARD_COLS - shape[0].length) / 2), y: -1 };
}

export function ghostY(board, type, x, y, rotation) {
  let gy = y;
  while (isValid(board, type, x, gy + 1, rotation)) gy++;
  return gy;
}

const SPEEDS = [800, 720, 630, 550, 470, 380, 300, 220, 140, 100, 80, 60, 50, 40, 30];
export function tickSpeed(level) {
  return SPEEDS[Math.min(level - 1, SPEEDS.length - 1)];
}
