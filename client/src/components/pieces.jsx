import { COLORS, getShape } from '../tetris.js';

/**
 * Shared HUD building blocks: the piece previews, the hold slot (a real button)
 * and the mute toggle (an inline SVG speaker, no emoji anywhere in the UI).
 */

/** Miniature piece preview, sized by the `--cell` CSS variable. */
export function NextPiece({ type, lead = false }) {
  if (!type) return <span className="piece-empty" />;
  const shape = getShape(type, 0);

  return (
    <div
      className={`next-piece${lead ? ' is-lead' : ''}`}
      style={{ gridTemplateColumns: `repeat(${shape.length}, var(--cell))` }}
      aria-hidden="true"
    >
      {shape.map((row, ri) =>
        row.map((c, ci) => (
          <span
            key={`${ri}-${ci}`}
            className="preview-cell"
            style={c ? { backgroundColor: COLORS[type], boxShadow: `0 0 5px ${COLORS[type]}80` } : undefined}
          />
        ))
      )}
    </div>
  );
}

/** The three upcoming pieces, side by side. */
export function NextQueue({ queue }) {
  return (
    <div className="next-queue">
      {queue.map((type, i) => (
        <NextPiece key={`${i}-${type}`} type={type} lead={i === 0} />
      ))}
    </div>
  );
}

/** Monochrome speaker, 20px, inherits `currentColor`. */
export function SpeakerIcon({ muted }) {
  return (
    <svg
      className="speaker-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 9h3.2L11.5 5.3v13.4L6.7 15H3.5z"
        fill="currentColor"
        stroke="none"
      />
      {muted ? (
        <path
          d="M15.4 9.4l4.2 5.2M19.6 9.4l-4.2 5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M14.9 8.6a4.9 4.9 0 0 1 0 6.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M17.6 6.1a8.4 8.4 0 0 1 0 11.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** Mute / unmute. `aria-pressed` mirrors the persisted audio state. */
export function MuteButton({ muted, onToggle, className = '' }) {
  return (
    <button
      type="button"
      className={`mute-btn${className ? ` ${className}` : ''}`}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute game sound' : 'Mute game sound'}
      onClick={onToggle}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}

/**
 * Hold slot, usable with mouse, finger and keyboard.
 *
 * When the swap is spent the piece stays fully coloured (only dimmed a little)
 * and the badge switches from READY to USED: the old dashed grey box read as
 * "empty" and hid the piece that is actually waiting there.
 */
export function HoldSlot({ holdType, canHold, onHold, disabled = false, className = '' }) {
  const used = !canHold;

  return (
    <button
      type="button"
      className={`hold-slot ${used && holdType ? 'is-used' : 'is-ready'}${className ? ` ${className}` : ''}`}
      onClick={onHold}
      disabled={disabled || !canHold}
      aria-label={
        holdType
          ? `Hold slot: ${holdType}${used ? ', used until the next lock' : ', ready'}`
          : 'Hold slot: empty, press to store the current piece'
      }
    >
      <span className="hold-label">Hold</span>
      {holdType ? <NextPiece type={holdType} lead /> : <span className="hold-empty" />}
      <span className={`hold-badge${used ? ' is-used' : ''}`}>
        <span className="hold-dot" aria-hidden="true" />
        {used ? 'Used' : 'Ready'}
      </span>
    </button>
  );
}
