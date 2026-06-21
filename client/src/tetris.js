export const BOARD_ROWS = 20;
export const BOARD_COLS = 10;

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
