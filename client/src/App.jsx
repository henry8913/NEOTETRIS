import { useReducer, useEffect, useCallback, useRef } from 'react';
import {
  BOARD_ROWS, BOARD_COLS, createBoard, isValid, lockPiece,
  clearLines, calcScore, generateBag, spawnPosition,
  ghostY, tickSpeed, getShape, COLORS,
} from './tetris';
import './App.css';

function fillBag(bag, idx) {
  while (bag.length <= idx + 7) bag.push(...generateBag());
  return bag;
}

function spawn(bag, idx) {
  const type = bag[idx % bag.length];
  return { type, ...spawnPosition(type), rotation: 0 };
}

function initialState() {
  const bag = fillBag([...generateBag()], 0);
  return {
    board: createBoard(),
    piece: spawn(bag, 0),
    nextType: bag[1],
    bag,
    idx: 1,
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    started: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'START': {
      const bag = fillBag([...generateBag()], 0);
      return {
        board: createBoard(),
        piece: spawn(bag, 0),
        nextType: bag[1],
        bag, idx: 1,
        score: 0, level: 1, lines: 0,
        gameOver: false, started: true,
      };
    }
    case 'MOVE': {
      if (!state.started || state.gameOver || !state.piece) return state;
      const { dx, dy } = action;
      let { type, x, y, rotation } = state.piece;
      let nx = x + dx, ny = y + dy;
      if (isValid(state.board, type, nx, ny, rotation)) {
        return { ...state, piece: { ...state.piece, x: nx, y: ny } };
      }
      if (dy === 1) return lockReduce(state);
      return state;
    }
    case 'ROTATE': {
      if (!state.started || state.gameOver || !state.piece) return state;
      const { type, x, y, rotation } = state.piece;
      const nr = (rotation + 1) % 4;
      if (isValid(state.board, type, x, y, nr)) {
        return { ...state, piece: { ...state.piece, rotation: nr } };
      }
      return state;
    }
    case 'HARD_DROP': {
      if (!state.started || state.gameOver || !state.piece) return state;
      const { type, x, y, rotation } = state.piece;
      const gy = ghostY(state.board, type, x, y, rotation);
      const dropped = { ...state.piece, y: gy };
      return lockReduce({ ...state, piece: dropped });
    }
    case 'TICK': {
      if (!state.started || state.gameOver || !state.piece) return state;
      const { type, x, y, rotation } = state.piece;
      if (isValid(state.board, type, x, y + 1, rotation)) {
        return { ...state, piece: { ...state.piece, y: y + 1 } };
      }
      return lockReduce(state);
    }
    case 'RESET':
      return initialState();
    default:
      return state;
  }
}

function lockReduce(state) {
  const { board, piece, bag, idx, score, level, lines } = state;
  let b = lockPiece(board, piece.type, piece.x, piece.y, piece.rotation);
  const [cleaned, cleared] = clearLines(b);
  b = cleaned;

  const newLines = lines + cleared;
  const newLevel = Math.floor(newLines / 10) + 1;
  const newScore = score + calcScore(cleared, level);

  const nextIdx = idx + 1;
  const newBag = fillBag([...bag], nextIdx);
  const nextPiece = spawn(newBag, idx);

  if (!isValid(b, nextPiece.type, nextPiece.x, nextPiece.y, nextPiece.rotation)) {
    return { ...state, board: b, piece: null, score: newScore, level: newLevel, lines: newLines, gameOver: true };
  }

  return {
    ...state,
    board: b,
    piece: nextPiece,
    nextType: newBag[nextIdx],
    bag: newBag,
    idx: nextIdx,
    score: newScore,
    level: newLevel,
    lines: newLines,
  };
}

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

function NextPiece({ type }) {
  if (!type) return null;
  const shape = getShape(type, 0);
  const size = shape.length;
  return (
    <div className="next-piece" style={{ gridTemplateColumns: `repeat(${size}, 11px)` }}>
      {shape.map((row, ri) =>
        row.map((cell, ci) => (
          <div
            key={`${ri}-${ci}`}
            className="preview-cell"
            style={cell ? { backgroundColor: COLORS[type] } : {}}
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
  const tickRef = useRef(null);

  const speed = state.started && !state.gameOver ? tickSpeed(state.level) : null;

  useEffect(() => {
    if (speed === null) {
      clearInterval(tickRef.current);
      return;
    }
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => dispatch({ type: 'TICK' }), speed);
    return () => clearInterval(tickRef.current);
  }, [speed]);

  useEffect(() => {
    if (state.gameOver) clearInterval(tickRef.current);
  }, [state.gameOver]);

  const onKeyDown = useCallback((e) => {
    if (!state.started) {
      if (e.key === 'Enter') dispatch({ type: 'START' });
      return;
    }
    if (state.gameOver) {
      if (e.key === 'Enter') dispatch({ type: 'START' });
      return;
    }
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); dispatch({ type: 'MOVE', dx: -1, dy: 0 }); break;
      case 'ArrowRight': e.preventDefault(); dispatch({ type: 'MOVE', dx: 1, dy: 0 }); break;
      case 'ArrowDown': e.preventDefault(); dispatch({ type: 'MOVE', dx: 0, dy: 1 }); break;
      case 'ArrowUp': e.preventDefault(); dispatch({ type: 'ROTATE' }); break;
      case ' ': e.preventDefault(); dispatch({ type: 'HARD_DROP' }); break;
    }
  }, [state.started, state.gameOver]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const act = useCallback((type, payload) => () => dispatch({ type, ...payload }), []);
  const tap = useCallback((type, payload) => (e) => {
    e.preventDefault();
    dispatch({ type, ...payload });
  }, []);

  const level = state.level;
  const speedMs = tickSpeed(level);

  return (
    <div className="tetris">
      <DataStreams />
      <BackgroundParticles />
      <header className="top-bar">
        <div className="stat"><span className="stat-label">Score</span><span className="stat-value">{state.score}</span></div>
        <div className="stat"><span className="stat-label">Level</span><span className="stat-value">{state.level}</span></div>
        <div className="stat"><span className="stat-label">Lines</span><span className="stat-value">{state.lines}</span></div>
        <div className="stat next-stat">
          <span className="stat-label">Next</span>
          <NextPiece type={state.nextType} />
        </div>
      </header>

      <div className="game-area">
        <div className="board-wrapper">
          {!state.started && (
            <div className="overlay">
              <h2>NEOTETRIS</h2>
              <p className="subtitle">// 2084 //</p>
              <button className="btn" onClick={act('START')}>Initialize</button>
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
              <button className="btn" onClick={act('START')}>Reboot</button>
            </div>
          )}
          <Board board={state.board} piece={state.piece} />
        </div>
      </div>

      {state.started && !state.gameOver && (
        <div className="controls">
          <div className="ctrl-row">
            <button className="ctrl-btn" onTouchStart={tap('MOVE', { dx: -1, dy: 0 })} onMouseDown={act('MOVE', { dx: -1, dy: 0 })}>◀</button>
            <button className="ctrl-btn" onTouchStart={tap('ROTATE')} onMouseDown={act('ROTATE')}>↻</button>
            <button className="ctrl-btn" onTouchStart={tap('MOVE', { dx: 1, dy: 0 })} onMouseDown={act('MOVE', { dx: 1, dy: 0 })}>▶</button>
          </div>
          <div className="ctrl-row">
            <button className="ctrl-btn" onTouchStart={tap('MOVE', { dx: 0, dy: 1 })} onMouseDown={act('MOVE', { dx: 0, dy: 1 })}>▼</button>
            <button className="ctrl-btn ctrl-wide" onTouchStart={tap('HARD_DROP')} onMouseDown={act('HARD_DROP')}>DROP</button>
          </div>
        </div>
      )}

      {state.started && (
        <div className="speed-indicator">
          Speed: {speedMs}ms | Level {state.level}
        </div>
      )}
    </div>
  );
}
