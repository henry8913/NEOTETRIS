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
import {
  patchSaveSession,
  readSaveSession,
  subscribeSaveSession,
} from '../saveSession.js';
import { revealInView } from '../visualViewport.js';

/**
 * The three full-board overlays. They are absolutely positioned inside
 * `.board-frame`, so they never change the layout when they appear or vanish.
 *
 * The game-over screen is ordered by importance: the score is the largest
 * element on it (the `final-block` carries no border, so it cannot be mistaken
 * for a control), then the record badge / local best, then the save form, and
 * only at the bottom the two controls (RANKINGS and PLAY AGAIN once the save is
 * confirmed; REBOOT in the zero-score / error states).
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
 * Remount safety: this component is what changes when the layout flips, and the
 * layout *does* flip mid-save (a resize, a rotation, and on iOS the on-screen
 * keyboard shrinking the viewport before `layout.js` grew the width guard). The
 * same element is rendered inside two different `<main>` shells, so React
 * unmounted the whole stage and rebuilt it with a fresh `Overlays` — idle
 * status, empty key, no save. Every piece of save state therefore lives in
 * `saveSession.js`, keyed by `runId`: seeded on mount, written before each
 * `setState`, and a response that lands after unmount is still recorded. A run
 * whose store entry says `saved` renders the terminal SCORE SAVED face
 * immediately, and `pendingOpen` makes the rankings open exactly once — by the
 * instance that is mounted when the response arrives, whichever that is.
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
  runId = 0,
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
  // Snapshot of this run's save state, read once: it seeds every piece of state
  // and every ref below, so a remount mid-save comes back exactly where the
  // previous instance was (frozen name, same idempotency key, same status).
  const [stored] = useState(() => readSaveSession(runId));
  const [name, setName] = useState(() => stored.name || normalizeName(loadName()));
  const [saveStatus, setSaveStatus] = useState(stored.status); // idle | saving | saved | error
  const [attempted, setAttempted] = useState(stored.attempted);
  const [saveRank, setSaveRank] = useState(stored.rank);
  const [saveError, setSaveError] = useState(stored.error);
  const [localOnly, setLocalOnly] = useState(stored.status === 'error');
  const [savedName, setSavedName] = useState(stored.name);
  // The best carries over from the previous run: Overlays is remounted on START.
  const [best] = useState(() => loadBest());

  const inputRef = useRef(null);
  const busyRef = useRef(stored.status === 'saving');
  const provisionalRef = useRef(null);
  // Terminal latch + the one idempotency key of this run. Both survive every
  // re-render *and* a remount (they are seeded from the store); a new run gets a
  // new `runId`, which is what clears them.
  const savedRef = useRef(stored.status === 'saved');
  const keyRef = useRef(stored.key);
  // The name is frozen on the first submit attempt; every later attempt (RETRY
  // included) sends this exact string, never whatever the field says.
  const lockedNameRef = useRef(stored.attempted ? stored.name : '');
  // REBOOT can be pressed while a POST is still in flight: from then on the
  // component is gone and must not touch a new run's props (the store write
  // still happens: the row is on the server either way).
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /*
   * Follow the store: a POST started by a previous instance (unmounted by a
   * layout flip) resolves and records `saved`/`error` there, and this mounted
   * instance has to render the outcome instead of sitting on "Contacting the
   * leaderboard…" forever. Patches we made ourselves re-apply identical values,
   * which React bails out of, so this costs no extra render.
   */
  useEffect(
    () =>
      subscribeSaveSession(runId, (next) => {
        setSaveStatus(next.status);
        setSaveError(next.error);
        if (next.attempted) setAttempted(true);
        if (next.name) {
          setSavedName(next.name);
          lockedNameRef.current = next.name;
        }
        if (next.rank !== null) setSaveRank(next.rank);
        setLocalOnly(next.status === 'error');
      }),
    [runId],
  );

  /*
   * `pendingOpen` is the one-shot "the save is confirmed, show the board" flag.
   * It is written by the submitting instance and consumed here, by whichever
   * instance is mounted when it appears — so the rankings open exactly once,
   * even when the response outlived the component that sent it. Clearing it
   * before calling the props is what makes a second run of this effect (or a
   * later remount) a no-op.
   */
  useEffect(() => {
    const session = readSaveSession(runId);
    if (session.status !== 'saved' || !session.pendingOpen) return;
    patchSaveSession(runId, { pendingOpen: false });
    onSaved?.(session.savedEntry ?? null);
    onRankings?.();
  }, [runId, saveStatus, onSaved, onRankings]);

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
    // RETRY *and* by a later instance after a remount: a POST that timed out
    // after the insert must replay, not duplicate.
    if (!keyRef.current) {
      keyRef.current = makeRunKey();
      patchSaveSession(runId, { key: keyRef.current });
    }

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
    // Store before state: if the layout flips right now and React swaps the
    // whole stage out, the next instance must come back to a frozen name, the
    // same key and the same "in flight" status.
    patchSaveSession(runId, {
      status: 'saving',
      name: clean,
      key: keyRef.current,
      attempted: true,
      error: '',
      pendingOpen: false,
    });

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
      // Written before the `aliveRef` check: the row is on the server whether or
      // not this component still exists. `pendingOpen` is consumed by whichever
      // instance is mounted when it lands (the effect above), so the
      // confirmation face and the rankings appear exactly once — never a second
      // form and never a second POST.
      patchSaveSession(runId, {
        status: 'saved',
        name: clean,
        rank,
        savedEntry: created,
        attempted: true,
        error: '',
        pendingOpen: true,
      });
    } catch (error) {
      const message = describeError(error);
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
      setSaveError(message);
      setSaveStatus('error');
      patchSaveSession(runId, {
        status: 'error',
        name: clean,
        error: message,
        attempted: true,
        pendingOpen: false,
      });
    } finally {
      busyRef.current = false;
      // Re-assert the frozen name for a response that outlived this instance
      // (the terminal status was already written above).
      patchSaveSession(runId, { attempted: true, name: lockedNameRef.current });
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
        <h2 className="overlay-title overlay-title--over">
          {saved ? 'Score saved' : 'System Halted'}
        </h2>

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
           * ways out are RANKINGS and PLAY AGAIN (a new run remounts Overlays, so
           * the form comes back clean).
           */
          <div className="save-confirm save-confirm--saved" role="status" aria-live="polite">
            <span className="save-confirm__line">
              Saved as <b className="save-confirm__name">{savedName}</b>
            </span>
            <span className="save-confirm__rank save-confirm__rank--hero">
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
              // The card scrolls (the keyboard shrinks it): make sure the field
              // and SAVE stay above the keyboard, never the page.
              onFocus={(event) => revealInView(event.currentTarget)}
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
          <button
            type="button"
            className="btn"
            onClick={onStart}
            aria-label={saved ? 'Play again' : 'Reboot and play again'}
          >
            {saved ? 'Play again' : 'Reboot'}
          </button>
        </div>

        {/*
         * Same micro-tag as the start screen, at the bottom of the card: the
         * build is what a user quotes when reporting a problem, and this is
         * the screen they are looking at when it happens. A caption, never a
         * competitor for the score or the buttons above it.
         */}
        {build && <p className="build-tag build-tag--over">build {build}</p>}
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
