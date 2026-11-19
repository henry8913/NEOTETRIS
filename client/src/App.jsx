import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { LOCK_DELAY_MS, MAX_LOCK_RESETS, isResting, tickSpeed } from './tetris.js';
import { initAll, reduceAll, fxDone } from './fx.js';
import { initAudio, isMuted, playSound, setMuted } from './sound.js';
import { press } from './input.js';
import { useWideLayout } from './layout.js';
import Background from './components/Background.jsx';
import { BoardStage, ClearFlash } from './components/Board.jsx';
import { DropRipple, LevelWash, Shockwave, SweepFx } from './components/Fx.jsx';
import StatCard from './components/StatCard.jsx';
import SidePanel from './components/SidePanel.jsx';
import ControlsRail from './components/ControlsRail.jsx';
import MobileHud from './components/MobileHud.jsx';
import TouchControls from './components/TouchControls.jsx';
import Overlays from './components/Overlays.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import './App.css';

const CLEAR_SOUNDS = ['clear1', 'clear2', 'clear3', 'clear4'];

/* Keyboard map: every entry claims preventDefault (no page scroll, ever). */
const KEY_MAP = {
  ArrowLeft: { action: { type: 'MOVE', dx: -1, dy: 0 }, sound: 'move' },
  ArrowRight: { action: { type: 'MOVE', dx: 1, dy: 0 }, sound: 'move' },
  ArrowDown: { action: { type: 'MOVE', dx: 0, dy: 1 }, sound: 'move' },
  ArrowUp: { action: { type: 'ROTATE', dir: 1 }, sound: 'rotate' },
  x: { action: { type: 'ROTATE', dir: 1 }, sound: 'rotate' },
  z: { action: { type: 'ROTATE', dir: -1 }, sound: 'rotate' },
  Shift: { action: { type: 'HOLD' }, sound: 'hold', once: true },
  c: { action: { type: 'HOLD' }, sound: 'hold', once: true },
  p: { action: { type: 'TOGGLE_PAUSE' }, once: true },
  Escape: { action: { type: 'TOGGLE_PAUSE' }, once: true },
};

const GAME_KEYS = new Set([...Object.keys(KEY_MAP), 'Enter', ' ']);

const isTypingTarget = (el) =>
  Boolean(el) &&
  (el.isContentEditable === true ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * A focused control owns Enter/Space: the browser turns the key into a `click`
 * on the button, and stealing it would make every focusable control (HOLD,
 * MUTE, the rail buttons, the overlays) unreachable from the keyboard.
 */
const isInteractiveTarget = (el) =>
  Boolean(el) &&
  (el.isContentEditable === true ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName) ||
    (typeof el.closest === 'function' && el.closest('button, a, [role="button"]') !== null));

export default function App() {
  const [state, dispatch] = useReducer(reduceAll, null, initAll);
  const {
    started, gameOver, paused, board, piece, lockResets, level, lines,
    score, combo, holdType, canHold, nextQueue, lastClear, fx,
  } = state;

  const [muted, setMutedState] = useState(isMuted);
  const history = useRef({ clearId: 0, level: 1, gameOver: false, started: false });
  // Desktop / landscape phones get the three-column shell, everything else the
  // compact one. Only the active composition is mounted (no hidden buttons).
  const wide = useWideLayout();

  // Rankings modal + the run counter that remounts the game-over form.
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [runId, setRunId] = useState(0);
  const [highlightId, setHighlightId] = useState(null);

  const start = useCallback(() => {
    // A fresh Overlays (and therefore a fresh save form) for every run.
    setRunId((id) => id + 1);
    setRankingsOpen(false);
    dispatch({ type: 'START' });
  }, []);
  const resume = useCallback(() => dispatch({ type: 'TOGGLE_PAUSE' }), []);
  const openRankings = useCallback(() => {
    setRankingsOpen(true);
    // Reading the board mid-run must not cost the run: pause the game behind
    // the dialog. The start / game-over screens dispatch nothing.
    if (started && !gameOver && !paused) dispatch({ type: 'TOGGLE_PAUSE' });
  }, [started, gameOver, paused]);
  const closeRankings = useCallback(() => setRankingsOpen(false), []);
  const handleSaved = useCallback((entry) => {
    setHighlightId(entry?.id ?? null);
  }, []);
  const done = useCallback((key) => dispatch(fxDone(key)), []);
  const holdPiece = useCallback(() => press(dispatch, { type: 'HOLD' }, 'hold'), []);
  const mutedToggle = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (!next) {
      initAudio();
      playSound('ui-click');
    }
  }, [muted]);

  // Unlock WebAudio on the first real gesture (never at load time).
  useEffect(() => {
    const unlock = () => initAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Gravity: only runs while the game is live and not paused.
  useEffect(() => {
    if (!started || gameOver || paused) return undefined;
    const id = setInterval(() => dispatch({ type: 'TICK' }), tickSpeed(level));
    return () => clearInterval(id);
  }, [started, gameOver, paused, level]);

  // Lock delay: a grounded piece locks after LOCK_DELAY_MS. Every successful
  // grounded move/rotation restarts the timer (bounded by MAX_LOCK_RESETS);
  // once the budget is spent the lock is immediate.
  useEffect(() => {
    if (!started || gameOver || paused || !piece) return undefined;
    if (!isResting(board, piece)) return undefined;
    if (lockResets >= MAX_LOCK_RESETS) {
      dispatch({ type: 'LOCK' });
      return undefined;
    }
    const id = setTimeout(() => dispatch({ type: 'LOCK' }), LOCK_DELAY_MS);
    return () => clearTimeout(id);
  }, [started, gameOver, paused, board, piece, lockResets]);

  // Audio only: every sound is inferred from a change of the pure game state.
  useEffect(() => {
    const before = history.current;

    if (started && lastClear.id > before.clearId) {
      if (lastClear.count > 0) {
        // Perfect and TETRIS get their own signature, the rest keep the ladder.
        if (lastClear.perfect) playSound('perfect');
        else if (lastClear.count >= 4) playSound('tetris');
        else playSound(CLEAR_SOUNDS[Math.min(lastClear.count, 4) - 1]);
      } else {
        playSound('lock');
      }
    }
    if (started && level > before.level) playSound('levelup');
    if (gameOver && !before.gameOver) playSound('gameover');
    if (started && !before.started) playSound('start');

    history.current = { clearId: lastClear.id, level, gameOver, started };
  }, [started, gameOver, level, lastClear]);

  /*
   * Level intensity for the ambient layer. Written straight to the document
   * element (no state, no render) so the body grid can pick it up too; capped
   * at 10 so high levels never become a strobe. The playfield reads the same
   * value from its inline `--level`.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--level', String(Math.min(Math.max(level, 1), 10)));
    return () => root.style.removeProperty('--level');
  }, [level]);

  const onKeyDown = useCallback((e) => {
    if (isTypingTarget(e.target)) return;
    // While the rankings dialog is open it owns the keyboard: Esc closes it
    // (handled there), and no game key may reach the board behind it.
    if (rankingsOpen) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    initAudio();

    // A focused control keeps Enter/Space: let the browser fire the `click`.
    if ((key === 'Enter' || key === ' ') && isInteractiveTarget(e.target)) return;

    // Claim the game keys first: Space/arrows must never scroll the page, not
    // even on the start screen or after a game over.
    if (GAME_KEYS.has(key)) e.preventDefault();

    if (key === 'm') {
      if (!e.repeat) mutedToggle();
      return;
    }

    if (key === 'Enter' || key === ' ') {
      // Start screen: Enter / Space start the run (through the same callback
      // as the INITIALIZE button, so the run key and the modal agree).
      if (!started) {
        if (!e.repeat) start();
        return;
      }
      // Game over: restarting belongs to REBOOT (or Enter on it). A stray
      // Enter/Space must never wipe the save form the player is filling in.
      if (gameOver) return;
      if (key === ' ' && !e.repeat) {
        dispatch({ type: 'FX_SHAKE', kind: 'light' });
        dispatch({ type: 'HARD_DROP' });
      }
      return;
    }
    if (!started || gameOver) return;

    const hit = KEY_MAP[key];
    if (!hit || (hit.once && e.repeat)) return;
    if (hit.sound) playSound(hit.sound);
    dispatch(hit.action);
  }, [started, gameOver, mutedToggle, rankingsOpen, start]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const endShake = useCallback((e) => {
    if (e.target === e.currentTarget) done('shake');
  }, [done]);

  const idle = !started || gameOver;
  // Hold is a real button in both compositions: disabled while the rules would
  // ignore it (start screen, game over, paused).
  const holdDisabled = idle || paused;

  /* The playfield is identical in both compositions; only its grid cell moves. */
  const stage = (
    <div className="board-wrapper">
      <BoardStage board={board} piece={started ? piece : null}>
        {fx.intro && <SweepFx key={`sweep-${fx.intro.id}`} onDone={() => done('intro')} />}

        {fx.drop && (
          <DropRipple
            key={`drop-${fx.drop.id}`}
            x={fx.drop.x}
            y={fx.drop.y}
            color={fx.drop.color}
            onDone={() => done('drop')}
          />
        )}

        {combo >= 2 && (
          <div
            className="combo-badge"
            key={combo}
            style={{ '--combo': Math.min(combo, 8) }}
            aria-hidden="true"
          >
            <span className="combo-badge__main">×{combo}</span>
            {combo >= 4 && (
              <span className="combo-badge__sub">{combo >= 6 ? 'Unstoppable' : 'On fire'}</span>
            )}
          </div>
        )}

        {fx.flash && (
          <ClearFlash
            key={fx.flash.id}
            count={fx.flash.count}
            rows={fx.flash.rows}
            colors={fx.flash.colors}
            perfect={fx.flash.perfect}
            onDone={() => done('flash')}
          />
        )}

        <Overlays
          key={`run-${runId}`}
          started={started}
          paused={paused}
          gameOver={gameOver}
          score={score}
          level={level}
          lines={lines}
          onStart={start}
          onResume={resume}
          onRankings={openRankings}
          onSaved={handleSaved}
        />
      </BoardStage>
    </div>
  );

  return (
    <div
      className={`tetris${fx.shake ? ` shake-${fx.shake.kind}` : ''}${fx.intro ? ' is-intro' : ''}${
        gameOver ? ' is-over' : ''
      }`}
      style={{ '--level': Math.min(Math.max(level, 1), 10) }}
      onAnimationEnd={endShake}
    >
      <Background />

      {wide ? (
        <main className="game-area game-area--wide">
          <header className="top-bar">
            <StatCard label="Score" value={score} live animated />
            <StatCard label="Level" value={level} />
            <StatCard label="Lines" value={lines} />
          </header>

          <div className="rail rail-left">
            <ControlsRail dispatch={dispatch} disabled={idle} paused={paused} />
          </div>

          {stage}

          <div className="rail rail-right">
            <SidePanel
              holdType={holdType}
              canHold={canHold}
              nextQueue={nextQueue}
              muted={muted}
              score={score}
              level={level}
              lines={lines}
              onToggleMute={mutedToggle}
              onHold={holdPiece}
              onRankings={openRankings}
              disabled={holdDisabled}
              speedMs={tickSpeed(level)}
            />
          </div>
        </main>
      ) : (
        <>
          <MobileHud
            score={score}
            level={level}
            lines={lines}
            holdType={holdType}
            canHold={canHold}
            nextQueue={nextQueue}
            muted={muted}
            onToggleMute={mutedToggle}
            onHold={holdPiece}
            disabled={holdDisabled}
          />

          <main className="game-area">{stage}</main>

          <footer className="dock">
            <TouchControls dispatch={dispatch} disabled={idle} paused={paused} />
          </footer>
        </>
      )}

      {fx.banner && (
        <div
          className="level-banner"
          key={fx.banner.id}
          aria-hidden="true"
          onAnimationEnd={() => done('banner')}
        >
          Level {fx.banner.level}
        </div>
      )}

      {fx.wash && <LevelWash key={`wash-${fx.wash.id}`} onDone={() => done('wash')} />}

      {fx.shock && (
        <Shockwave
          key={`shock-${fx.shock.id}`}
          perfect={fx.shock.perfect}
          onDone={() => done('shock')}
        />
      )}

      {fx.intro && (
        <span key={`flash-${fx.intro.id}`} className="fx-start" aria-hidden="true" />
      )}

      <Leaderboard open={rankingsOpen} onClose={closeRankings} highlightId={highlightId} />
    </div>
  );
}
