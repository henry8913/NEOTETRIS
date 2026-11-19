import { BOARD_ROWS, BOARD_COLS, COLORS, getShape, ghostY } from '../tetris.js';
import { LineBurst } from './Fx.jsx';

const CLEAR_LABELS = {
  1: 'SINGLE',
  2: 'DOUBLE',
  3: 'TRIPLE',
  4: 'TETRIS!',
};

function glowFor(type) {
  const color = COLORS[type];
  return `0 0 6px ${color}40, 0 0 12px ${color}20, inset 0 0 6px ${color}20`;
}

export function Cell({ type }) {
  if (type === 'ghost') return <div className="cell ghost-cell" />;
  return (
    <div
      className="cell"
      style={type ? { backgroundColor: COLORS[type], boxShadow: glowFor(type) } : undefined}
    />
  );
}

/** Board + active piece + ghost, as a flat cell grid (20 × 10). */
export function Board({ board, piece }) {
  const display = board.map(row => [...row]);

  if (piece) {
    const shape = getShape(piece.type, piece.rotation);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const py = piece.y + r;
        const px = piece.x + c;
        if (py >= 0 && py < BOARD_ROWS && px >= 0 && px < BOARD_COLS) {
          display[py][px] = piece.type;
        }
      }
    }

    const gy = ghostY(board, piece.type, piece.x, piece.y, piece.rotation);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const py = gy + r;
        const px = piece.x + c;
        if (py >= 0 && py < BOARD_ROWS && px >= 0 && px < BOARD_COLS && !display[py][px]) {
          display[py][px] = 'ghost';
        }
      }
    }
  }

  return (
    <div className="board" role="img" aria-label="Tetris board">
      {display.map((row, ri) =>
        row.map((cell, ci) => <Cell key={`${ri}-${ci}`} type={cell} />)
      )}
    </div>
  );
}

/**
 * Short-lived overlay drawn over the rows that were just cleared: a row flash,
 * a neon spark burst, a border pulse and the floating SINGLE / DOUBLE / TRIPLE
 * / TETRIS! / PERFECT CLEAR label. The parent remounts it with a fresh `key`
 * for every clear and removes it on `animationend`.
 */
export function ClearFlash({ count, rows, colors = [], perfect = false, onDone }) {
  const tetris = count >= 4;
  const label = perfect ? 'PERFECT CLEAR' : CLEAR_LABELS[count] || `${count} LINES`;

  return (
    <div
      className="board-fx"
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.animationName === 'fx-text-up') onDone?.();
      }}
    >
      {rows.map((row) => (
        <span
          key={row}
          className="fx-row"
          style={{
            top: `${(row / BOARD_ROWS) * 100}%`,
            height: `${100 / BOARD_ROWS}%`,
          }}
        />
      ))}

      <span
        className={`fx-border${tetris ? ' is-heavy' : ''}${perfect ? ' is-perfect' : ''}`}
      />

      <LineBurst rows={rows} colors={colors} count={count} perfect={perfect} />

      <span
        className={`fx-text${tetris ? ' fx-text--tetris' : ''}${count >= 3 ? ' fx-text--big' : ''}${
          perfect ? ' fx-text--perfect' : ''
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Sizing box of the whole playfield: it owns the 1:2 aspect ratio and hosts the
 * board, the effects and the overlays, so nothing ever grows past the viewport.
 */
export function BoardStage({ board, piece, children }) {
  return (
    <div className="board-frame">
      <Board board={board} piece={piece} />
      {children}
    </div>
  );
}
