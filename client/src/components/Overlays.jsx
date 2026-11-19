import { ScoreValue } from './Fx.jsx';

/**
 * The three full-board overlays. They are absolutely positioned inside
 * `.board-frame`, so they never change the layout when they appear or vanish.
 *
 * The game-over screen is ordered by importance: the score is the largest
 * element on it (the `final-block` carries no border, so it cannot be mistaken
 * for a control), the title sits above it in a smaller size, and REBOOT is the
 * only thing that looks like a button.
 *
 * LEVEL / LINES are deliberately not repeated here: the stat strip (wide), the
 * right rail (landscape) and the mobile HUD are always visible behind the
 * board, so a 10px copy inside a 180-450px-wide overlay added nothing but
 * noise — and clipped on the narrowest boards.
 */
export default function Overlays({ started, paused, gameOver, score, onStart, onResume }) {
  if (gameOver) {
    return (
      <div className="overlay game-over-overlay" role="dialog" aria-label="Game over">
        <h2 className="overlay-title overlay-title--over">System Halted</h2>

        <div className="final-block">
          <span className="final-label">Score</span>
          <ScoreValue className="final-score" value={score} fromValue={0} duration={520} />
        </div>

        <button type="button" className="btn" onClick={onStart} aria-label="Reboot and play again">
          Reboot
        </button>
        <p className="hint">Enter to reboot</p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="overlay start-overlay" role="dialog" aria-label="Start game">
        <h2 className="overlay-title overlay-title--brand">Neotetris</h2>
        <p className="subtitle">// 2084 //</p>
        <button type="button" className="btn" onClick={onStart} aria-label="Initialize game">
          Initialize
        </button>
        <p className="hint">Enter / Space</p>
      </div>
    );
  }

  if (paused) {
    return (
      <div className="overlay pause-overlay" role="dialog" aria-label="Game paused">
        <h2 className="overlay-title">Paused</h2>
        <p className="subtitle">Signal on standby</p>
        <button type="button" className="btn" onClick={onResume} aria-label="Resume game">
          Resume
        </button>
        <p className="hint">P / Esc</p>
      </div>
    );
  }

  return null;
}
