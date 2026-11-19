# NEOTETRIS — Agent Guide

## Structure

Monorepo with two packages. Root `package.json` has only orchestration scripts (no deps).

```
client/     # React 19 + Vite 8 (JSX, no TypeScript)
server/     # Express 4 + Mongoose 8 (ESM)
```

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts **both** dev servers in parallel (`&`, not `&&`) |
| `npm run dev:client` | Vite dev server on `localhost:5173` |
| `npm run dev:server` | Express on `localhost:3001` (uses `node --watch`) |
| `npm run build` | Builds **only** client to `client/dist/` |
| `npm start` | Production Express server — serves `client/dist` (SPA fallback) when it exists, API only otherwise |
| `npm test --prefix client` | `node --test` on `src/*.test.js` — **50 tests** |
| `npm test --prefix server` | `node --test` on `test/*.test.js` — **44 tests** |
| `npm run lint` (in `client/`) | ESLint 10 flat config |

Install (each package has own `node_modules`):
```
npm install --prefix client && npm install --prefix server
```

`npm run dev:client` alone still plays, but the leaderboard needs the Express server on `:3001` (Vite proxies `/api` there).

## Architecture

- **Game primitives**: `client/src/tetris.js` — pure JS, zero React deps. Constants (`BOARD_ROWS`, `BOARD_COLS`, `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`, piece shapes/colors, `SPEEDS`) plus pure helpers (`isValid`, `getShape`, `tryRotate` with SRS kicks, `isResting`, `lockPiece`, `clearLines`, `calcScore`, `generateBag`, `spawnPosition`, `ghostY`, `tickSpeed`).
- **Game state**: `client/src/game.js` — pure state + reducer, zero React. Exports `initialState`, `spawnPiece`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer`. Actions: `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`. It also exposes presentation metadata — `combo` (consecutive clearing locks) and `lastClear: { id, count, rows, colors, perfect }` — but **the rules are unchanged**; the effects layer only reads it.
- **FX layer**: `client/src/fx.js` — wraps the game reducer without touching it. Exports `INITIAL_FX`, `initAll`, `reduceAll`, `fxDone` and derives transient state from each dispatch: `intro`, `flash`, `banner`, `shake`, `wash`, `shock`, `drop`, plus the `FX_DONE` / `FX_SHAKE` actions. This is why effects never call `setState` inside an effect.
- **Audio**: `client/src/sound.js` — WebAudio only, no assets: oscillators + gain envelopes at a low master volume. 12 named sounds (`move`, `rotate`, `lock`, `hold`, `clear1`–`clear4`, `tetris`, `perfect`, `levelup`, `gameover`, `start`, `ui-click`). Mute is persisted in `localStorage` under `neotetris.muted`; `initAudio()` creates/resumes the `AudioContext` lazily on the first gesture.
- **Layout**: `client/src/layout.js` — `WIDE_LAYOUT_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 560px)'`, `useMediaQuery` (via `useSyncExternalStore`) and `useWideLayout`. The single breakpoint is shared by JSX and the `@media` blocks in `App.css`.
- **Input helpers**: `client/src/input.js` — `press(dispatch, action, sound)` is the one path for every on-screen button (a single `click`; unlocks audio, plays the sound, dispatches) and `pressHardDrop(dispatch)` fires `FX_SHAKE` before `HARD_DROP`.
- **API client**: `client/src/api.js` — the only module that talks HTTP. `API_BASE = import.meta.env.VITE_API_URL || ''` (empty = same origin), `fetchScores(limit = 10, { timeout = 5000, signal })`, `submitScore({ name, score, level, lines }, { timeout })`, `fetchHealth()`. Every request is bounded by an abort timeout (408 on timeout) and every row is validated (`parseScore`) — malformed rows are dropped, never rendered. Errors carry `status`, `details` and, on 429, `retryAfter`; `fetchHealth` never throws.
- **Leaderboard helpers**: `client/src/leaderboard.js` — pure functions shared by the API, storage and UI: `normalizeName` (strip control chars, collapse spaces, cap at `MAX_NAME_LENGTH = 20`, fallback `PLAYER`), `compareScores` (score desc, older date first), `mergeScores` (union + dedupe by `id`, remote wins, truncate), `rankOf`, `isRecord`, `formatDate` (`DD/MM`, UTC).
- **Local persistence**: `client/src/storage.js` — safe `localStorage` wrapper, every access in `try/catch` (private mode/blocked storage degrade to in-memory, corrupt JSON is treated as missing). Keys: `neotetris.player` (last name), `neotetris.best` (personal best), `neotetris.scores` (local runs, capped at `MAX_LOCAL_SCORES = 20`). Helpers: `loadName`/`saveName`, `loadBest`/`saveBest`, `loadLocalScores`/`saveLocalScore`/`removeLocalScore`, `clearAll`.
- **Score cache**: `client/src/scoreCache.js` — per-tab in-memory cache of the merged board, `CACHE_TTL_MS = 30000`; `readScoreCache`, `writeScoreCache`, `invalidateScoreCache` (called after a save and by REFRESH/RETRY).
- **Tests**: `client/src/tetris.test.js` (13) + `game.test.js` (22) + `leaderboard.test.js` (15) — `node:test`, no framework. Sibling file next to the module under test.
- **Rendering/wiring**: `client/src/App.jsx` (~375 lines) — `useReducer(reduceAll, null, initAll)`, gravity interval, lock-delay effect, keyboard handler, audio/FX effects, rankings modal state (`rankingsOpen`, `runId`, `highlightId`) and the two layout compositions. All CSS in `App.css` + `index.css` — no framework.
- **Components**: `client/src/components/`
  - `Board.jsx` — `Board` (20 × 10 cell grid + ghost), `Cell`, `ClearFlash` (row flash, border pulse, burst, SINGLE/DOUBLE/TRIPLE/TETRIS!/PERFECT CLEAR label), `BoardStage` (1:2 sizing box).
  - `SidePanel.jsx` — right rail (hold, next ×3, mute, `RANKS` button, key hints, tick speed); also hosts score/level/lines for landscape phones.
  - `ControlsRail.jsx` — left rail D-pad (`◀ ↻ ▶ ▼`, Drop, Pause/Play).
  - `MobileHud.jsx` — compact 6-item HUD: score · lv · lines · hold · next ×3 · mute.
  - `Overlays.jsx` — start, pause and game-over overlays inside `.board-frame`. Game over owns the save flow: name form (`maxLength 20`, last name preloaded), local best + `NEW RECORD` badge, and a `SAVE SCORE` button with `idle | saving | saved | error` states (`SAVED · RANK #N`); offline/rejected runs are stored locally (`SAVED LOCALLY`) and `RETRY` re-submits. `RANKINGS` opens the modal.
  - `Leaderboard.jsx` — accessible `TOP RUNNERS` dialog: `role="dialog"` + `aria-modal`, focus on open, Tab trap, Esc/backdrop close, focus restored; `SERVER`/`LOCAL` source badge, skeleton rows, empty/error states and `RETRY`/`REFRESH`.
  - `Background.jsx` — `BackgroundParticles` + `DataStreams` (decorative, ~20 nodes, `pointer-events: none`, `z-index: 0`).
  - `Fx.jsx` — `SweepFx`, `LineBurst`, `Shockwave`, `LevelWash`, `DropRipple`, `ScoreValue` (count-up, `prefers-reduced-motion` aware).
  - `StatCard.jsx` — one top-bar stat card.
  - `pieces.jsx` — `NextPiece`, `NextQueue`, `SpeakerIcon` / `TrophyIcon` (inline SVG), `MuteButton`, `HoldSlot` (a real `<button>`).
  - `TouchControls.jsx` — compact thumb pad; only mounted in the compact composition.
- **Save → rank flow**: game over → `saveBest` writes the local best → form (name remembered) → `POST /api/scores` → `saveLocalScore(created)` → `GET /api/scores?limit=50` to compute the rank → cache invalidated → `SAVED · RANK #N`. If the POST fails, the run goes to `neotetris.scores` with a `local-…` id and `RANKINGS` shows it under the `LOCAL` badge. Opening the modal during a live run pauses the game (`TOGGLE_PAUSE`).
- **Two compositions**: wide = three columns (controls rail · board · hold/next rail) in a centred `max-width: 1180px` stage, with `top-bar` stats; compact = `.hud` on top, board in the middle, `.dock` thumb pad at the bottom. Landscape phones (`height ≤ 560px`) keep the wide shell but drop `.top-bar` and move the stats into the right rail. Only the active composition is mounted, so there are no hidden-but-focusable buttons.
- **Viewport fit**: `.tetris` is `height: 100%` + `overflow: hidden`, `client/index.html` uses `viewport-fit=cover`, safe-area insets feed the padding, and the board is the only flexible row (1:2 aspect ratio), so the page never scrolls.
- **Backend**: `server/src/app.js` exposes `createApp({ store, corsOrigin, rateLimit, staticDir, logger })` — no `listen()`, so tests mount it on an ephemeral port. Three endpoints: `GET /api/health` (`status`, `db: 'mongo'|'memory'`, `uptime`, `timestamp`), `GET /api/scores?limit=N`, `POST /api/scores`.
- **Storage**: `server/src/store.js` — `createStore()` tries Mongo (3s timeout) and **falls back to an in-memory store** on any failure. `createMemoryStore` / `createMongoStore` share the same interface (`listScores`, `addScore`, `getStatus`, `close`); `clampLimit` bounds `limit` to 1..50.
- **Validation**: `server/src/validation.js` — `validateScorePayload` (strict integers, defaults for missing fields, English errors) + `sanitizeName`. `GET` rejects a non-integer `limit` with 400; `POST` returns 400 with `{ error, details }`.
- **Hardening**: rate limit 30 POST/min per IP (fixed window, `GET` untouched), JSON body capped at 10 kB, unknown `/api/*` → JSON 404, optional SPA static hosting, error handler (400 on bad JSON, 413 on oversized body).
- **Entry**: `server/src/index.js` — thin: env → store → app → listen, plus graceful `SIGINT`/`SIGTERM` shutdown with a 10s force-exit guard.
- **Tests (server)**: `server/test/api.test.js` (15), `store.test.js` (13), `validation.test.js` (16).

## Key conventions

- ES modules throughout (`import`/`export`).
- No TypeScript — plain `.jsx` / `.js`.
- No test framework: both packages expose `npm test` backed by `node:test` + `node:assert`.
- Board is a 2D array (`0` = empty, piece name string = filled, `'ghost'` = ghost cell).
- State shape includes `nextQueue` (3 pieces), `holdType`, `canHold`, `paused`, `lockResets`, `bag`.
- Every score returned/accepted by the API is `{ id, name, score, level, lines, date }` — `_id` / `__v` are never exposed.
- The client is defensive about that contract: `normalizeName` sanitises before every POST, `parseScore` validates every incoming row (bad rows dropped), and API errors carry `status`, `details` and `retryAfter` so the UI can explain the failure.
- The rankings modal is a real dialog: `role="dialog"` + `aria-modal`, labelled by its title, with a Tab focus trap, Esc/backdrop close and focus returned to the opener.
- Local runs are ids prefixed `local-…`; a server row replaces its provisional local copy (same id is removed) so a score never appears twice.
- CSS custom properties for neon colors in `index.css`.
- **No emoji in the UI** — icons are inline SVG (e.g. the speaker in `pieces.jsx`).
- **FX are CSS-only**: keyframes + transforms/opacity, never canvas or rAF loops. Budget: at most 12–22 spans per line burst, ~20 background nodes.
- **Audio is synthesized**: WebAudio oscillators/gain only, no audio files.
- `prefers-reduced-motion: reduce` is honoured: decorative animations are gated behind `no-preference`, score count-up snaps to the final value, and a reduced-motion block disables the heavy effects.
- Touch targets are **≥ 44px** (**40px** in the wide/landscape rails); HUD labels are **≥ 9px**.
- **Zero scroll**: `height: 100%` + `overflow: hidden` on the shell, `viewport-fit=cover`, board sized from the available height.
- Root `npm install` is a no-op (no root dependencies; install inside each package).

## Gotchas

- `npm run dev` at root launches both servers via `&`. Kill processes manually to stop.
- `TICK` **no longer locks**: it only moves the piece down one row when possible. Locking happens through the `LOCK` action, scheduled by the lock-delay effect in `App.jsx` (500 ms, restarting on grounded moves/rotations, max 15 resets). A failed `MOVE` with `dy: 1` (soft drop into the floor) and `HARD_DROP` lock immediately.
- `tryRotate` applies the SRS kick tables with **y inverted** (screen coordinates, `+y` = down). Tables are keyed `from>to` with rotation states 0/1/2/3; `O` skips kicks.
- `takeNext` / `takeFromQueue` are immutable and return `{ type, bag }` / `{ type, queue, bag }`. The old `fillBag` push+idx approach no longer exists.
- The reducer is a **no-op** when `!started || gameOver || paused || !piece` (checked via `canAct`).
- Score is awarded with the **pre-update level** (`calcScore(cleared, state.level)`), then `level` is recomputed from total lines.
- `SPEEDS` in `tetris.js` defines 15 levels. Index is `level - 1` (clamped).
- Pieces spawn at `y: -1` (above visible board). `isValid` allows `ny < 0` cells — only checks board when `ny >= 0`.
- `lockPiece` returns a new board (shallow clone) — reducer never mutates state.
- FX are **derived in the reducer wrapper** (`fx.js`), not in effects: each layer is keyed by its effect id and removed by `fxDone(key)` on `animationend` (game-over desaturation is a CSS class, not a layer). Never add a `setState` inside an effect — react-hooks v7 lint rejects it; derive from state instead.
- The score count-up is **visual only**: `ScoreValue` interpolates the display over ~320ms; the real score lives in game state (the prop is the source of truth and wins on the next change). `prefers-reduced-motion` renders the final value immediately.
- The game keyboard handler does **not** swallow `Enter`/`Space` when the focus is on an interactive element (button/link/`[role="button"]`), otherwise the browser's click-to-activate would never fire. Game keys otherwise claim `preventDefault`, including on the start screen and after game over. At game over `Enter`/`Space` deliberately do **not** restart: restart belongs to `REBOOT` (or Enter on it), so a stray key cannot wipe the save form.
- `m` toggles mute (`MuteButton` mirrors the same state); the `AudioContext` is created/resumed only on the first pointerdown/keydown — never at load. The handler returns early for `INPUT`/`TEXTAREA`/`SELECT`/contenteditable, so typing a name never fires a game key.
- Opening `RANKINGS` during a live, unpaused run dispatches `TOGGLE_PAUSE`; the dialog owns the keyboard while open (the global handler returns early), and Esc closes it rather than toggling pause.
- `localStorage` is always accessed through `storage.js` (`try/catch` inside): private mode or a full quota must never throw into the game. Corrupt JSON is treated as missing; local runs are capped at 20, the panel shows 10.
- The two compositions are mounted **exclusively** (`wide ? <main className="game-area--wide">… : <MobileHud/> + <main/> + <TouchControls/>`), so no hidden controls stay in the focus order. The wide shell is a centred stage with `max-width: 1180px`; landscape phones drop the top bar and put the stats in the right rail.
- `StrictMode` wraps `<App>` — effects run twice in dev (tick interval and lock-delay timers both clean up).
- Vite proxies `/api` → `http://localhost:3001` in dev only (`vite.config.js`); in production Express serves the build, so the empty `API_BASE` is same-origin. For a split deployment set `VITE_API_URL` to the server's absolute URL (no trailing slash) at build time.
- `@types/react` + `@types/react-dom` installed but unused (template leftovers).
- Server env: `PORT=3001`, `MONGO_URI=mongodb://localhost:27017/tetris`, `CORS_ORIGIN=*` — see `server/.env.example` (copy to `.env`, Node does not load it automatically).
- MongoDB is optional: 3s selection timeout, then the in-memory store (scores lost on restart). The server leaderboard therefore lives in RAM without Mongo; local runs (`neotetris.scores`) are the only ones that survive a device reload. Rate limit applies to `POST` only (30/min per IP).
- `client/dist/` is gitignored. After `npm run build`, `npm start` serves it with SPA fallback; without it, only the API is mounted.
- `.opencode/agents/` defines specialized subagents (`@frontend`, `@backend`) with write/edit/bash access.
