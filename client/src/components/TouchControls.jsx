import { press, pressHardDrop } from '../input.js';

/**
 * Thumb pad, rendered only when the compact layout is active (never mounted on
 * desktop, so there is not a single invisible/focusable button in the tree).
 *
 * One row of six 44px+ targets on mobile portrait — no second row, no scrolling.
 */
export default function TouchControls({ dispatch, disabled = false, paused = false }) {
  const locked = disabled || paused;

  return (
    <div className="controls" role="group" aria-label="Touch controls">
      <button
        type="button"
        className="ctrl-btn"
        aria-label="Move left"
        disabled={locked}
        onClick={() => press(dispatch, { type: 'MOVE', dx: -1, dy: 0 }, 'move')}
      >
        ◀
      </button>
      <button
        type="button"
        className="ctrl-btn"
        aria-label="Rotate piece"
        disabled={locked}
        onClick={() => press(dispatch, { type: 'ROTATE', dir: 1 }, 'rotate')}
      >
        ↻
      </button>
      <button
        type="button"
        className="ctrl-btn"
        aria-label="Move right"
        disabled={locked}
        onClick={() => press(dispatch, { type: 'MOVE', dx: 1, dy: 0 }, 'move')}
      >
        ▶
      </button>
      <button
        type="button"
        className="ctrl-btn"
        aria-label="Soft drop"
        disabled={locked}
        onClick={() => press(dispatch, { type: 'MOVE', dx: 0, dy: 1 }, 'move')}
      >
        ▼
      </button>
      <button
        type="button"
        className="ctrl-btn accent-magenta is-text"
        aria-label="Hard drop"
        disabled={locked}
        onClick={() => pressHardDrop(dispatch)}
      >
        Drop
      </button>
      <button
        type="button"
        className={`ctrl-btn is-text ${paused ? 'is-play' : 'is-pause'}`}
        aria-label={paused ? 'Resume game' : 'Pause game'}
        disabled={disabled}
        onClick={() => press(dispatch, { type: 'TOGGLE_PAUSE' })}
      >
        {paused ? 'Play' : 'Pause'}
      </button>
    </div>
  );
}
