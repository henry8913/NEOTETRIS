import { useEffect, useRef, useState } from 'react';
import { ScoreValue } from './Fx.jsx';
import { fetchScores, submitScore } from '../api.js';
import { isRecord, normalizeName, rankOf, shouldOfferSave } from '../leaderboard.js';
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
import { makeRunKey } from '../runKey.js';

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
 *   idle → saving → saved        (the server accepted it — terminal)
 *                ↘ error         (offline / rate limit: the run is stored
 *                                locally, RETRY goes back to the server)
 * A confirmed save replaces the form with a read-only confirmation and opens
 * the rankings modal, so one run is saved exactly once; REBOOT is the only way
 * back to a form (the component is remounted per run by App's `key`).
 *
 * Name lock: the first `handleSubmit` freezes the name for the rest of the run,
 * whether the POST succeeds or fails. On mobile the 5s default timeout used to
 * land a slow POST in the `error` branch with an editable field, and a second
 * tap saved a renamed run under a new key — i.e. two rows on the global board
 * from one run. From `attempted` on, the input is `disabled` + `readOnly`, the
 * submit path reads the frozen name from `lockedNameRef`, and in the error
 * state RETRY is the only actionable control (same name, same key).
 *
 * The on-screen keyboard is dismissed at the start of every submit
 * (`document.activeElement.blur()`): iOS can keep it over the button and
 * swallow the confirmation that replaced the form.
 *
 * Every attempt carries the same idempotency key (`runKey.js`): a POST that
 * timed out after the insert answers with the existing row instead of adding a
 * second one.
 *
 * Zero-score rule: a run that ends on 0 is not offered for saving at all. The
 * game-over screen renders a read-only "nothing to save" block instead of the
 * form, so there is no input to focus, no submit path, no POST, no
 * `saveLocalScore`, no `NEW RECORD` badge (and `saveBest` refuses 0 as well)
 * and no automatic rankings — there is nothing new to highlight. RANKINGS and
 * REBOOT stay available. The server deliberately stays permissive
 * (`score >= 0` is accepted, for API compatibility): the rule is a client-side
 * product decision kept in `shouldOfferSave` (`leaderboard.js`).
 *
 * The remembered name is seeded through the same `normalizeName` as the submit
 * path, so a legacy `neotetris.player` value ("PLAYER ", double spaces,
 * control characters) never shows up in the field the way it was stored.
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
  build = '',
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
  const [name, setName] = useState(() => normalizeName(loadName()));
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [attempted, setAttempted] = useState(false);
  const [saveRank, setSaveRank] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [savedName, setSavedName] = useState('');
  // The best carries over from the previous run: Overlays is remounted on START.
  const [best] = useState(() => loadBest());

  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const provisionalRef = useRef(null);
  // Terminal latch + the one idempotency key of this run. Both survive every
  // re-render, and a remount (REBOOT) is what clears them.
  const savedRef = useRef(false);
  const keyRef = useRef('');
  // The name is frozen on the first submit attempt; every later attempt (RETRY
  // included) sends this exact string, never whatever the field says.
  const lockedNameRef = useRef('');
  // REBOOT can be pressed while a POST is still in flight: from then on the
  // component is gone and must not open the modal over the new run.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // A zero-score run has nothing to save, so none of the save machinery
  // (best, badge, form, autofocus, submit) is allowed to run for it.
  const saveable = shouldOfferSave(score);
  const record = saveable && isRecord(score, best);
  const bestScore = Math.max(best?.score ?? 0, score);

  // Persist the new best as soon as the run ends — before the form is used.
  useEffect(() => {
    if (!gameOver || !saveable) return;
    if (isRecord(score, loadBest())) saveBest({ score, level, lines });
  }, [gameOver, saveable, score, level, lines]);

  // Autofocus only on the game-over form, never on the start screen, and never
  // at all when the form is not rendered (zero-score run).
  useEffect(() => {
    if (gameOver && saveable) inputRef.current?.focus();
  }, [gameOver, saveable]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Defense in depth: the form is not mounted for a zero-score run, so this
    // can only be reached by a stale synthetic submit.
    if (!saveable) return;
    // `saved` is terminal for the run: the form is not rendered any more, but
    // a queued submit (double Enter, a synthesised click on the old button)
    // must still be a no-op. `busyRef` covers the in-flight window.
    if (savedRef.current || busyRef.current) return;
    if (saveStatus === 'saving' || saveStatus === 'saved') return;

    // One key for the whole run, minted on the first attempt and reused by
    // RETRY: a POST that timed out after the insert must replay, not duplicate.
    if (!keyRef.current) keyRef.current = makeRunKey();

    // Defence in depth against a slow mobile POST: dismiss the on-screen
    // keyboard (iOS can keep it over the confirmation) and freeze the name for
    // the rest of the run, before the request even starts. A failed attempt
    // leaves `attempted` true, so the field never becomes editable again.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && typeof active.blur === 'function') active.blur();

    busyRef.current = true;
    const clean = lockedNameRef.current || normalizeName(name);
    lockedNameRef.current = clean;
    setName(clean);
    saveName(clean);
    setAttempted(true);
    setSaveStatus('saving');
    setSaveError('');

    try {
      const created = await submitScore({
        name: clean,
        score,
        level,
        lines,
        key: keyRef.current,
      });

      // A provisional offline copy was replaced by the real row: retire it so
      // the local list (and the merged board) never shows the run twice.
      if (provisionalRef.current) {
        removeLocalScore(provisionalRef.current);
        provisionalRef.current = null;
      }
      saveLocalScore(created);

      let rank = null;
      try {
        // The shared board is the server one: the rank shown to the player
        // always refers to it, never to a board of this device's own runs.
        const remote = await fetchScores(50);
        rank = rankOf(created, remote);
      } catch {
        rank = rankOf(created, loadLocalScores());
      }

      invalidateScoreCache();
      savedRef.current = true;
      setSavedName(clean);
      setSaveRank(rank);
      setLocalOnly(false);
      setSaveStatus('saved');
      // Unmounted mid-flight (REBOOT): the row is on the server and in the
      // local list, but there is no form left to confirm it on.
      if (!aliveRef.current) return;
      // Order matters: the highlight is set first, then the dialog opens, so
      // the new row is already marked when the modal appears. The run is over,
      // so nothing gets paused.
      onSaved?.(created);
      onRankings?.();
    } catch (error) {
      // Offline / rate-limited / rejected: keep the run on this device, say so
      // and stay put. The one-shot rule only applies to a confirmed save.
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
          if (aliveRef.current) onSaved?.(entry);
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
    // `attempted` is sticky: from the first submit on, the name can never be
    // edited again in this run — success or failure, the field is frozen.
    const locked = attempted || saveStatus === 'saving' || saveStatus === 'saved';
    // A confirmed save is terminal: no input, no submit, no way back to idle.
    const saved = saveStatus === 'saved';
    const note =
      saveStatus === 'saving'
        ? 'Contacting the leaderboard…'
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

        {!saveable ? (
          /*
           * Zero-score run: no form, no input, nothing focusable and no
           * navigation. A short read-only line explains why; RANKINGS and
           * REBOOT below stay available.
           */
          <div className="save-empty" role="status">
            <span className="save-empty__line">No score to save</span>
            <span className="save-empty__hint">Play again to get on the board</span>
          </div>
        ) : saved ? (
          /*
           * Read-only confirmation. It replaces the form for this run: the only
           * ways out are RANKINGS and REBOOT (a new run remounts Overlays, so
           * the form comes back clean).
           */
          <div className="save-confirm" role="status" aria-live="polite">
            <span className="save-confirm__line">
              Saved as <b className="save-confirm__name">{savedName}</b>
            </span>
            <span className="save-confirm__rank">
              {saveRank ? `Rank #${saveRank}` : 'On the board'}
            </span>
          </div>
        ) : (
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
              enterKeyHint="send"
              spellCheck="false"
              placeholder="Pilot name"
              aria-label="Player name"
              aria-readonly={locked}
              disabled={locked}
              readOnly={locked}
              onChange={(event) => setName(event.target.value)}
            />
            {saveStatus === 'error' ? (
              <button type="submit" className="btn btn--small btn--warn">
                Retry
              </button>
            ) : (
              <button type="submit" className="btn btn--small" disabled={locked}>
                {saveStatus === 'saving' ? 'Saving…' : 'Save Score'}
              </button>
            )}
          </form>
        )}

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
        {build && <p className="build-tag">build {build}</p>}
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
