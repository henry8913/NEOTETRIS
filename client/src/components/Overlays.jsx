import { useEffect, useRef, useState } from 'react';
import { ScoreValue } from './Fx.jsx';
import { fetchScores, submitScore } from '../api.js';
import { isRecord, mergeScores, normalizeName, rankOf } from '../leaderboard.js';
import {
  loadBest,
  loadLocalScores,
  loadName,
  removeLocalScore,
  saveBest,
  saveLocalScore,
  saveName,
} from '../storage.js';
import { invalidateScoreCache } from '../scoreCache.js';

/**
 * The three full-board overlays. They are absolutely positioned inside
 * `.board-frame`, so they never change the layout when they appear or vanish.
 *
 * The game-over screen is ordered by importance: the score is the largest
 * element on it (the `final-block` carries no border, so it cannot be mistaken
 * for a control), then the record badge / local best, then the save form, and
 * only at the bottom the two controls (RANKINGS and REBOOT).
 *
 * LEVEL / LINES are deliberately not repeated here: the stat strip (wide), the
 * right rail (landscape) and the mobile HUD are always visible behind the
 * board, so a 10px copy inside a 180-450px-wide overlay added nothing but
 * noise — and clipped on the narrowest boards.
 *
 * Save flow:
 *   idle → saving → saved        (server accepted it)
 *                ↘ error         (offline / rate limit: the run is stored
 *                                locally, RETRY goes back to the server)
 * The form state lives here and is reset by remounting the component on every
 * START (App passes a run key), so a new run can never inherit the previous
 * "saved" state.
 */

function describeError(error) {
  if (error?.status === 429) {
    const after = error.retryAfter ? ` Retry in ${error.retryAfter}s.` : '';
    return `Server busy (rate limit).${after}`;
  }
  if (error?.status === 400) return error.message || 'The server rejected this score.';
  if (error?.status === 408) return 'The server timed out.';
  if (error?.status) return `Server error (${error.status}).`;
  return 'Network unreachable.';
}

export default function Overlays({
  started,
  paused,
  gameOver,
  score,
  level,
  lines,
  onStart,
  onResume,
  onRankings,
  onSaved,
}) {
  const [name, setName] = useState(() => loadName());
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [saveRank, setSaveRank] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  // The best carries over from the previous run: Overlays is remounted on START.
  const [best] = useState(() => loadBest());

  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const provisionalRef = useRef(null);

  const record = isRecord(score, best);
  const bestScore = Math.max(best?.score ?? 0, score);

  // Persist the new best as soon as the run ends — before the form is used.
  useEffect(() => {
    if (!gameOver) return;
    if (isRecord(score, loadBest())) saveBest({ score, level, lines });
  }, [gameOver, score, level, lines]);

  // Autofocus only on the game-over form, never on the start screen.
  useEffect(() => {
    if (gameOver) inputRef.current?.focus();
  }, [gameOver]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (saveStatus === 'saving' || saveStatus === 'saved') return;

    busyRef.current = true;
    const clean = normalizeName(name);
    setName(clean);
    saveName(clean);
    setSaveStatus('saving');
    setSaveError('');

    try {
      const created = await submitScore({ name: clean, score, level, lines });

      // A provisional offline copy was replaced by the real row: retire it so
      // the local list (and the merged board) never shows the run twice.
      if (provisionalRef.current) {
        removeLocalScore(provisionalRef.current);
        provisionalRef.current = null;
      }
      saveLocalScore(created);

      let rank = null;
      try {
        const remote = await fetchScores(50);
        rank = rankOf(created, mergeScores(remote, loadLocalScores(), 50));
      } catch {
        rank = rankOf(created, loadLocalScores());
      }

      invalidateScoreCache();
      setSaveRank(rank);
      setLocalOnly(false);
      setSaveStatus('saved');
      onSaved?.(created);
    } catch (error) {
      // Offline / rate-limited / rejected: keep the run on this device.
      if (!provisionalRef.current) {
        const entry = saveLocalScore({
          name: clean,
          score,
          level,
          lines,
          date: new Date().toISOString(),
        });
        if (entry) {
          provisionalRef.current = entry.id;
          onSaved?.(entry);
        }
      }
      invalidateScoreCache();
      setLocalOnly(true);
      setSaveError(describeError(error));
      setSaveStatus('error');
    } finally {
      busyRef.current = false;
    }
  };

  if (gameOver) {
    const locked = saveStatus === 'saving' || saveStatus === 'saved';
    const note =
      saveStatus === 'saving'
        ? 'Contacting the leaderboard…'
        : saveStatus === 'saved'
          ? saveRank
            ? `Saved · rank #${saveRank}`
            : 'Saved'
          : saveStatus === 'error'
            ? `Saved locally · ${saveError}`
            : '';

    return (
      <div className="overlay game-over-overlay" role="dialog" aria-label="Game over">
        <h2 className="overlay-title overlay-title--over">System Halted</h2>

        <div className="final-block">
          <span className="final-label">Score</span>
          <ScoreValue className="final-score" value={score} fromValue={0} duration={520} />
        </div>

        <div className="over-overview">
          {record && <span className="record-badge">New Record</span>}
          <span className="best-line">
            Best <b>{bestScore}</b>
          </span>
        </div>

        <form className="save-form" onSubmit={handleSubmit} noValidate>
          <input
            id="save-name"
            ref={inputRef}
            className="save-input"
            type="text"
            name="nickname"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            inputMode="text"
            spellCheck="false"
            placeholder="Pilot name"
            aria-label="Player name"
            disabled={locked}
            onChange={(event) => setName(event.target.value)}
          />
          {saveStatus === 'error' ? (
            <button type="submit" className="btn btn--small btn--warn">
              Retry
            </button>
          ) : (
            <button type="submit" className="btn btn--small" disabled={locked}>
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save Score'}
            </button>
          )}
        </form>

        <p className={`save-note${localOnly ? ' is-local' : ''}`} role="status" aria-live="polite">
          {note}
        </p>

        <div className="overlay-actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onRankings}>
            Rankings
          </button>
          <button type="button" className="btn" onClick={onStart} aria-label="Reboot and play again">
            Reboot
          </button>
        </div>
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
        <button type="button" className="btn btn--ghost btn--small" onClick={onRankings}>
          Rankings
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
