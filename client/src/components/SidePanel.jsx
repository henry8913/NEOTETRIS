import { HoldSlot, MuteButton, NextQueue } from './pieces.jsx';
import StatCard from './StatCard.jsx';

const HINTS = [
  ['← →', 'Move'],
  ['↑ / X', 'Rotate'],
  ['↓', 'Soft drop'],
  ['Space', 'Hard drop'],
  ['C', 'Hold'],
  ['P', 'Pause'],
  ['M', 'Mute'],
];

/**
 * Right rail (desktop / landscape): hold, the three next pieces, sound.
 * Everything is a fixed-width card in one column, so the rail is exactly as
 * wide as the control rail on the other side and the board stays dead centre.
 *
 * `.rail-stats` is rendered on every wide screen but only *displayed* on
 * landscape phones, where the desktop stat strip is dropped and these three
 * cards take its place at the top of the rail.
 */
export default function SidePanel({
  holdType,
  canHold,
  nextQueue,
  muted,
  score,
  level,
  lines,
  onToggleMute,
  onHold,
  disabled = false,
  speedMs,
}) {
  return (
    <aside className="side-panel" aria-label="Hold, next pieces and sound">
      <div className="brand" aria-hidden="true">
        NEOTETRIS
        <span>// 2084</span>
      </div>

      {/* Landscape only (≤ 560px tall): SCORE · LEVEL · LINES, top to bottom. */}
      <div className="rail-stats">
        <StatCard label="Score" value={score} live animated />
        <StatCard label="Level" value={level} />
        <StatCard label="Lines" value={lines} />
      </div>

      <HoldSlot
        holdType={holdType}
        canHold={canHold}
        onHold={onHold}
        disabled={disabled}
        className="panel-card"
      />

      <div className="panel-card next-slot">
        <span className="panel-label">Next</span>
        <NextQueue queue={nextQueue} />
      </div>

      <MuteButton muted={muted} onToggle={onToggleMute} />

      <div className="panel-hints" aria-hidden="true">
        {HINTS.map(([keys, action]) => (
          <span key={action} className="hint-row">
            <b>{keys}</b>
            <i>{action}</i>
          </span>
        ))}
        <span className="panel-speed">Tick {speedMs}ms</span>
      </div>
    </aside>
  );
}
