import { useReducer, useEffect, useCallback } from 'react';
import {
  BOARD_ROWS, BOARD_COLS, COLORS, LOCK_DELAY_MS, MAX_LOCK_RESETS,
  getShape, ghostY, isResting, tickSpeed,
} from './tetris.js';
import { initialState, reducer } from './game.js';
import './App.css';

function Cell({ type }) {
  if (type === 'ghost') {
    return <div className="cell ghost-cell" />;
  }
  const glow = type
    ? `0 0 6px ${COLORS[type]}40, 0 0 12px ${COLORS[type]}20, inset 0 0 6px ${COLORS[type]}20`
    : '';
  return (
    <div
      className="cell"
      style={type ? { backgroundColor: COLORS[type], boxShadow: glow } : {}}
    />
  );
}

function Board({ board, piece }) {
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
    const ghostShape = getShape(piece.type, piece.rotation);
    for (let r = 0; r < ghostShape.length; r++) {
      for (let c = 0; c < ghostShape[r].length; c++) {
        if (!ghostShape[r][c]) continue;
        const py = gy + r, px = piece.x + c;
        if (py >= 0 && py < BOARD_ROWS && px >= 0 && px < BOARD_COLS) {
          if (!display[py][px]) display[py][px] = 'ghost';
        }
      }
    }
  }

  return (
    <div className="board">
      {display.map((row, ri) =>
        row.map((cell, ci) => <Cell key={`${ri}-${ci}`} type={cell} />)
      )}
    </div>
  );
}

function NextPiece({ type, size = 11, dimmed = false }) {
  if (!type) return null;
  const shape = getShape(type, 0);
  const cell = `${size}px`;
  return (
    <div
      className={`next-piece${dimmed ? ' dimmed' : ''}`}
      style={{ '--cell': cell, gridTemplateColumns: `repeat(${shape.length}, ${cell})` }}
    >
      {shape.map((row, ri) =>
        row.map((c, ci) => (
          <div
            key={`${ri}-${ci}`}
            className="preview-cell"
            style={c ? { backgroundColor: COLORS[type] } : {}}
          />
        ))
      )}
    </div>
  );
}

const NEON_COLORS = [
  'var(--neon-cyan)',
  'var(--neon-magenta)',
  'var(--neon-green)',
  'var(--neon-yellow)',
  'var(--neon-purple)',
];

function createParticles() {
  return Array.from({ length: 22 }, (_, i) => ({
    id: i,
    x: `${Math.random() * 100}%`,
    delay: `${Math.random() * 12}s`,
    duration: `${10 + Math.random() * 14}s`,
    size: `${2 + Math.random() * 2.5}px`,
    color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
    drift: `${-30 + Math.random() * 60}px`,
  }));
}

function createStreams() {
  const positions = [1, 3.5, 96.5, 99];
  return positions.map((left, i) => ({
    id: i,
    left: `${left}%`,
    delay: `${i * 2.5}s`,
    duration: `${2.5 + Math.random() * 2}s`,
  }));
}

const PARTICLES = createParticles();
const STREAMS = createStreams();

function BackgroundParticles() {
  return (
    <div className="bg-particles" aria-hidden="true">
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            '--x': p.x,
            '--delay': p.delay,
            '--duration': p.duration,
            '--size': p.size,
            '--color': p.color,
            '--drift': p.drift,
          }}
        />
      ))}
    </div>
  );
}

function DataStreams() {
  return (
    <div className="data-streams" aria-hidden="true">
      {STREAMS.map((s) => (
        <div
          key={s.id}
          className="data-stream"
          style={{
            '--left': s.left,
            '--delay': s.delay,
            '--duration': s.duration,
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, initialState);
  const { started, gameOver, paused, board, piece, lockResets, level } = state;

  // Gravity: only runs while the game is live and not paused.
  useEffect(() => {
    if (!started || gameOver || paused) return undefined;
    const id = setInterval(() => dispatch({ type: 'TICK' }), tickSpeed(level));
    return () => clearInterval(id);
  }, [started, gameOver, paused, level]);

  // Lock delay: a grounded piece locks after LOCK_DELAY_MS. Every successful
  // move/rotation of a grounded piece restarts the timer (bounded by
  // MAX_LOCK_RESETS); once the budget is spent the lock is immediate.
  useEffect(() => {
    if (!started || gameOver || paused || !piece) return undefined;
    if (!isResting(board, piece)) return undefined;
    if (lockResets >= MAX_LOCK_RESETS) {
      dispatch({ type: 'LOCK' });
      return undefined;
    }
    const id = setTimeout(() => dispatch({ type: 'LOCK' }), LOCK_DELAY_MS);
    return () => clearTimeout(id);
  }, [started, gameOver, paused, board, piece, lockResets]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (!started || gameOver) {
        e.preventDefault();
        dispatch({ type: 'START' });
      }
      return;
    }
    if (!started || gameOver) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        dispatch({ type: 'MOVE', dx: -1, dy: 0 });
        break;
      case 'ArrowRight':
        e.preventDefault();
        dispatch({ type: 'MOVE', dx: 1, dy: 0 });
        break;
      case 'ArrowDown':
        e.preventDefault();
        dispatch({ type: 'MOVE', dx: 0, dy: 1 });
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        e.preventDefault();
        dispatch({ type: 'ROTATE', dir: 1 });
        break;
      case 'z':
      case 'Z':
        e.preventDefault();
        dispatch({ type: 'ROTATE', dir: -1 });
        break;
      case ' ':
        e.preventDefault();
        dispatch({ type: 'HARD_DROP' });
        break;
      case 'Shift':
      case 'c':
      case 'C':
        if (e.repeat) return;
        e.preventDefault();
        dispatch({ type: 'HOLD' });
        break;
      case 'p':
      case 'P':
      case 'Escape':
        if (e.repeat) return;
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PAUSE' });
        break;
      default:
        break;
    }
  }, [started, gameOver]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Single pointer path: onTouchStart + onMouseDown fired twice on some
  // devices, onPointerDown fires once.
  const press = (action) => (e) => {
    e.preventDefault();
    dispatch(action);
  };

  const speedMs = tickSpeed(level);

  return (
    <div className="tetris">
      <DataStreams />
      <BackgroundParticles />
      <header className="top-bar">
        <div className="stat"><span className="stat-label">Score</span><span className="stat-value">{state.score}</span></div>
        <div className="stat"><span className="stat-label">Level</span><span className="stat-value">{state.level}</span></div>
        <div className="stat"><span className="stat-label">Lines</span><span className="stat-value">{state.lines}</span></div>
        <div className="stat hold-stat">
          <span className="stat-label">Hold</span>
          {state.holdType
            ? <NextPiece type={state.holdType} dimmed={!state.canHold} />
            : <span className="hold-empty" />}
        </div>
        <div className="stat next-stat">
          <span className="stat-label">Next</span>
          <div className="next-queue">
            {state.nextQueue.map((type, i) => (
              <NextPiece key={i} type={type} size={i === 0 ? 9 : 7} />
            ))}
          </div>
        </div>
      </header>

      <div className="game-area">
        <div className="board-wrapper">
          {!state.started && (
            <div className="overlay">
              <h2>NEOTETRIS</h2>
              <p className="subtitle">// 2084 //</p>
              <button className="btn" onClick={() => dispatch({ type: 'START' })}>Initialize</button>
            </div>
          )}
          {state.gameOver && (
            <div className="overlay game-over-overlay">
              <h2>System Halted</h2>
              <p className="final-score">{state.score}</p>
              <div className="game-over-stats">
                <div className="game-over-stat">
                  <span className="stat-label">Level</span>
                  <span className="stat-value">{state.level}</span>
                </div>
                <div className="game-over-stat">
                  <span className="stat-label">Lines</span>
                  <span className="stat-value">{state.lines}</span>
                </div>
              </div>
              <button className="btn" onClick={() => dispatch({ type: 'START' })}>Reboot</button>
            </div>
          )}
          {state.started && !state.gameOver && paused && (
            <div className="overlay pause-overlay">
              <h2>Paused</h2>
              <p className="subtitle">Press P to resume</p>
              <button className="btn" onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}>Resume</button>
            </div>
          )}
          <Board board={board} piece={piece} />
        </div>
      </div>

      {started && !gameOver && (
        <div className="controls">
          <div className="ctrl-row">
            <button className="ctrl-btn" aria-label="Move left" onPointerDown={press({ type: 'MOVE', dx: -1, dy: 0 })}>◀</button>
            <button className="ctrl-btn" aria-label="Rotate" onPointerDown={press({ type: 'ROTATE', dir: 1 })}>↻</button>
            <button className="ctrl-btn" aria-label="Move right" onPointerDown={press({ type: 'MOVE', dx: 1, dy: 0 })}>▶</button>
            <button className="ctrl-btn ctrl-hold" aria-label="Hold piece" onPointerDown={press({ type: 'HOLD' })}>HOLD</button>
          </div>
          <div className="ctrl-row">
            <button className="ctrl-btn" aria-label={paused ? 'Resume' : 'Pause'} onPointerDown={press({ type: 'TOGGLE_PAUSE' })}>{paused ? '▶' : '❚❚'}</button>
            <button className="ctrl-btn" aria-label="Soft drop" onPointerDown={press({ type: 'MOVE', dx: 0, dy: 1 })}>▼</button>
            <button className="ctrl-btn ctrl-wide" aria-label="Hard drop" onPointerDown={press({ type: 'HARD_DROP' })}>DROP</button>
          </div>
        </div>
      )}

      {started && (
        <div className="speed-indicator">
          Speed: {speedMs}ms | Level {level}
        </div>
      )}
    </div>
  );
}
