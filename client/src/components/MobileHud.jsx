import { HoldSlot, MuteButton, NextQueue } from './pieces.jsx';
import { ScoreValue } from './Fx.jsx';

/** One compact stat: 9px label, 15-17px value — never the old 5-7px type. */
function HudStat({ label, value, live = false, animated = false, className = '' }) {
  return (
    <div className={`hud-stat ${className}`}>
      <span className="hud-label">{label}</span>
      {animated ? (
        <ScoreValue className="hud-value" value={value} live={live} />
      ) : (
        <span
          className="hud-value"
          aria-live={live ? 'polite' : undefined}
          aria-atomic={live ? 'true' : undefined}
        >
          {value}
        </span>
      )}
    </div>
  );
}

/**
 * Compact HUD: all six readouts on a single ~52px line
 * (score · level · lines · hold · next ×3 · mute).
 */
export default function MobileHud({
  score,
  level,
  lines,
  holdType,
  canHold,
  nextQueue,
  muted,
  onToggleMute,
  onHold,
  disabled = false,
}) {
  return (
    <header className="hud" aria-label="Game status">
      <HudStat className="hud-score" label="Score" value={score} live animated />
      <HudStat className="hud-level" label="Lv" value={level} />
      <HudStat className="hud-lines" label="Lines" value={lines} />

      <HoldSlot
        holdType={holdType}
        canHold={canHold}
        onHold={onHold}
        disabled={disabled}
        className="hud-hold"
      />

      <div className="hud-next">
        <span className="hud-label">Next</span>
        <NextQueue queue={nextQueue} />
      </div>

      <MuteButton muted={muted} onToggle={onToggleMute} className="hud-mute" />
    </header>
  );
}
