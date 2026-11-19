import { useEffect, useRef, useState } from 'react';
import { BOARD_ROWS, COLORS } from '../tetris.js';
import { useMediaQuery } from '../layout.js';

/**
 * Transient visual effects. Every component here is mounted only while its
 * effect is active (the parent keys it on the effect id) and unmounts itself
 * from `animationend`, so nothing keeps running in the background.
 *
 * Budget: a line clear adds ≤ 24 short-lived spans, the entry adds 2
 * (flash + sweep), a level-up 1 wash, a TETRIS 1 ring, a hard drop 1 ripple.
 * No canvas, no timers, no requestAnimationFrame loop except the ~320ms
 * score count-up.
 */

/** Deterministic pseudo-random in [0,1) — same layout on every render. */
function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Entry sweep: one diagonal light band crossing the playfield (~450ms).
 * Rendered inside the already-clipped `.board-fx` layer of the board.
 */
export function SweepFx({ onDone }) {
  return (
    <div className="board-fx" aria-hidden="true">
      <span className="fx-sweep" onAnimationEnd={onDone} />
    </div>
  );
}

/** Neon sparks thrown out of the rows that were just cleared. */
export function LineBurst({ rows = [], colors = [], count = 0, perfect = false }) {
  const total = perfect ? 22 : count >= 4 ? 16 : 12;
  const sparks = Array.from({ length: total }, (_, i) => {
    const row = rows.length ? rows[i % rows.length] : BOARD_ROWS - 2;
    const type = colors.length ? colors[i % colors.length] : null;
    const a = rand(i + 1);
    const b = rand(i + 11);
    const c = rand(i + 23);

    return {
      id: i,
      x: 4 + a * 92,
      y: ((row + 0.5) / BOARD_ROWS) * 100,
      dx: (b - 0.5) * (perfect ? 150 : 110),
      dy: -(5 + c * (perfect ? 46 : 32)),
      size: 1 + c * 1.4,
      delay: Math.round(a * 40),
      duration: Math.round(340 + b * 60),
      color: type ? COLORS[type] : i % 3 === 0 ? 'var(--neon-magenta)' : 'var(--neon-cyan)',
    };
  });

  return (
    <span className="fx-burst">
      {sparks.map((p) => (
        <span
          key={p.id}
          className="fx-spark"
          style={{
            '--x': `${p.x}%`,
            '--y': `${p.y}%`,
            '--dx': `${p.dx}cqw`,
            '--dy': `${p.dy}cqw`,
            '--s': `${p.size}cqw`,
            '--c': p.color,
            '--delay': `${p.delay}ms`,
            '--dur': `${p.duration}ms`,
          }}
        />
      ))}
    </span>
  );
}

/** Full-screen ring for a TETRIS (and a brighter one for a perfect clear). */
export function Shockwave({ perfect = false, onDone }) {
  return (
    <div className="fx-shock" aria-hidden="true">
      <span
        className={`fx-shock__ring${perfect ? ' is-perfect' : ''}`}
        onAnimationEnd={onDone}
      />
    </div>
  );
}

/** Colour wash spreading from the centre on a level-up. */
export function LevelWash({ onDone }) {
  return <span className="fx-wash" aria-hidden="true" onAnimationEnd={onDone} />;
}

/** Small circular wave where a hard-dropped piece landed (250ms). */
export function DropRipple({ x, y, color, onDone }) {
  return (
    <div className="board-fx" aria-hidden="true">
      <span
        className="fx-drop"
        style={{ '--x': `${x}%`, '--y': `${y}%`, '--c': COLORS[color] ?? 'var(--neon-cyan)' }}
        onAnimationEnd={onDone}
      />
    </div>
  );
}

/**
 * Score readout that counts up to the real value in ~320ms and pulses on
 * every increase. The prop is always the source of truth: the animated value
 * is only a display interpolation and is replaced the moment `value` changes
 * again (so a fast combo never queues stale numbers).
 *
 * `fromValue` (used by the game-over screen) makes the number climb from that
 * starting point on mount instead of waiting for a change.
 */
export function ScoreValue({
  value,
  fromValue,
  duration = 320,
  className = '',
  live = false,
}) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  // `fromValue` only seeds the first render (game over climbs from 0).
  const [shown, setShown] = useState(() => fromValue ?? value);
  const shownRef = useRef(fromValue ?? value);

  /*
   * The ref — not a "last target" ref — is the only state the animation needs:
   * it always holds what is currently on screen. Deriving `start` from it makes
   * the effect idempotent, which is what keeps StrictMode's mount → cleanup →
   * mount cycle working (a target-based guard would see `value` already
   * "handled" on the second run and leave the number stuck at 0).
   * `cancelled` also stops a frame that was already scheduled from writing a
   * stale value after the cleanup.
   *
   * Reduced motion uses the same loop with a zero-length timeline: the render
   * already reads `value` directly (no count-up), and the single frame keeps
   * `shown`/`shownRef` in sync so toggling the preference back off can never
   * resurrect an old number. (A synchronous `setShown` here would cascade
   * renders and is rejected by `react-hooks/set-state-in-effect`.)
   */
  useEffect(() => {
    const start = shownRef.current;
    const delta = value - start;
    if (delta === 0) return undefined;

    const total = reduce ? 0 : duration;
    let cancelled = false;
    let frame = 0;
    const t0 = performance.now();

    const step = (now) => {
      if (cancelled) return;
      const p = total > 0 ? Math.min(1, (now - t0) / total) : 1;
      const eased = 1 - (1 - p) ** 2.4;
      const next = p >= 1 ? value : Math.round(start + delta * eased);
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [value, duration, reduce]);

  return (
    <span className={`score-num${className ? ` ${className}` : ''}`}>
      <span className="score-num__pulse" key={value} aria-hidden="true">
        {reduce ? value : shown}
      </span>
      {live && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {value}
        </span>
      )}
    </span>
  );
}
