import { press, pressHardDrop } from '../input.js';

/** Every button is a real `<button>`: mouse, finger, keyboard and AT all work. */
const MOVE_LEFT = { type: 'MOVE', dx: -1, dy: 0 };
const MOVE_RIGHT = { type: 'MOVE', dx: 1, dy: 0 };
const SOFT_DROP = { type: 'MOVE', dx: 0, dy: 1 };
const ROTATE = { type: 'ROTATE', dir: 1 };
const PAUSE = { type: 'TOGGLE_PAUSE' };

/**
 * Left rail (desktop / landscape): the D-pad plus the keyboard hint. The pause
 * button spells out PAUSE / PLAY, so it can never be confused with "move right".
 */
export default function ControlsRail({ dispatch, disabled = false, paused = false }) {
  const locked = disabled || paused;

  return (
    <section className="rail-card controls-rail" aria-label="On-screen controls">
      <span className="panel-label">Controls</span>

      <div className="dpad">
        <button
          type="button"
          className="ctrl-btn area-left"
          aria-label="Move left"
          disabled={locked}
          onClick={() => press(dispatch, MOVE_LEFT, 'move')}
        >
          ◀
        </button>
        <button
          type="button"
          className="ctrl-btn area-rotate"
          aria-label="Rotate piece"
          disabled={locked}
          onClick={() => press(dispatch, ROTATE, 'rotate')}
        >
          ↻
        </button>
        <button
          type="button"
          className="ctrl-btn area-right"
          aria-label="Move right"
          disabled={locked}
          onClick={() => press(dispatch, MOVE_RIGHT, 'move')}
        >
          ▶
        </button>
        <button
          type="button"
          className="ctrl-btn area-down"
          aria-label="Soft drop"
          disabled={locked}
          onClick={() => press(dispatch, SOFT_DROP, 'move')}
        >
          ▼
        </button>
        <button
          type="button"
          className="ctrl-btn area-drop accent-magenta is-text"
          aria-label="Hard drop"
          disabled={locked}
          onClick={() => pressHardDrop(dispatch)}
        >
          Drop
        </button>
        <button
          type="button"
          className={`ctrl-btn area-pause is-text ${paused ? 'is-play' : 'is-pause'}`}
          aria-label={paused ? 'Resume game' : 'Pause game'}
          disabled={disabled}
          onClick={() => press(dispatch, PAUSE)}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>

      <p className="rail-hint">
        <span>← → move · ↑ rotate</span>
        <span>↓ soft · Space drop</span>
        <span>C hold · P pause</span>
      </p>
    </section>
  );
}
