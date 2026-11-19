import { useRef } from 'react';
import Joystick from './Joystick.jsx';
import { press, pressHardDrop } from '../input.js';

/**
 * One action-pad key. Touches fire on `pointerdown`, never on `click`: when a
 * second finger joins the gesture (stick + DROP, the core two-thumb move) the
 * browser stops synthesising `click` for that touch, so a click-only pad would
 * silently ignore it. Keyboard and assistive-tech activation still arrive as a
 * `click` with `detail === 0` (no pointer), and that is the only click path
 * that runs the action.
 */
function ActionButton({ className, label, ariaLabel, disabled, onActivate }) {
  const pointerAt = useRef(0);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Own the gesture: no compatibility mouse events, no scroll, no zoom.
    e.preventDefault();
    pointerAt.current = e.timeStamp;
    e.currentTarget.dataset.pressed = 'true';
    onActivate();
  };

  const release = (e) => {
    delete e.currentTarget.dataset.pressed;
  };

  const onClick = (e) => {
    release(e);
    // Pointer activation already happened on pointerdown (and a synthesised
    // click may or may not follow). Only keyboard / AT clicks have detail 0.
    if (e.detail !== 0) return;
    if (e.timeStamp - pointerAt.current < 1000) return;
    onActivate();
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Compact touch layer: a translucent overlay drawn *on* the playfield, never a
 * row under it — the board keeps the whole phone height (Starfire behaviour).
 *
 * The layer itself is `pointer-events: none`, so the board stays dead to taps
 * outside the two hit boxes; only `.joy-zone` (bottom-left) and `.action-pad`
 * (bottom-right) take pointers. It is mounted inside `BoardStage`, below the
 * start / pause / game-over overlays (z-index 5 vs 10), and never mounted in the
 * wide composition, so the focus order never grows a hidden control.
 *
 * The action pad stays first in the DOM (tab order) even though it is painted
 * on the right; the stick is a pure pointer surface with no focusable child.
 */
export default function TouchControls({ dispatch, disabled = false, paused = false }) {
  const locked = disabled || paused;

  return (
    <div className="touch-layer">
      <div className="action-pad" role="group" aria-label="Action buttons">
        <ActionButton
          className="action-btn action-btn--drop"
          label="Drop"
          ariaLabel="Hard drop"
          disabled={locked}
          onActivate={() => pressHardDrop(dispatch)}
        />
        <ActionButton
          className="action-btn"
          label="Hold"
          ariaLabel="Hold piece"
          disabled={locked}
          onActivate={() => press(dispatch, { type: 'HOLD' }, 'hold')}
        />
        <ActionButton
          className={`action-btn action-btn--pause ${paused ? 'is-play' : 'is-pause'}`}
          label={paused ? 'Play' : 'Pause'}
          ariaLabel={paused ? 'Resume game' : 'Pause game'}
          disabled={disabled}
          onActivate={() => press(dispatch, { type: 'TOGGLE_PAUSE' })}
        />
      </div>

      <Joystick dispatch={dispatch} locked={locked} />
    </div>
  );
}
