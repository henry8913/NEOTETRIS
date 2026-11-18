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
| `npm test --prefix client` | `node --test` on `src/*.test.js` — **28 tests** |
| `npm test --prefix server` | `node --test` on `test/*.test.js` — **44 tests** |
| `npm run lint` (in `client/`) | ESLint 10 flat config |

Install (each package has own `node_modules`):
```
npm install --prefix client && npm install --prefix server
```

## Architecture

- **Game primitives**: `client/src/tetris.js` — pure JS, zero React deps. Constants (`BOARD_ROWS`, `BOARD_COLS`, `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`, piece shapes/colors, `SPEEDS`) plus pure helpers (`isValid`, `getShape`, `tryRotate` with SRS kicks, `isResting`, `lockPiece`, `clearLines`, `calcScore`, `generateBag`, `spawnPosition`, `ghostY`, `tickSpeed`).
- **Game state**: `client/src/game.js` — pure state + reducer, zero React. Exports `initialState`, `spawnPiece`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer`. Actions: `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`.
- **Tests**: `client/src/tetris.test.js` (13) + `client/src/game.test.js` (15) — `node:test`, no framework. Sibling file next to the module under test.
- **Rendering/wiring**: `client/src/App.jsx` (~335 lines) — `useReducer(reducer, initialState)`, gravity interval, lock-delay effect, keyboard + pointer handlers, and inline `Board` / `Cell` / `NextPiece` sub-components. All CSS in `App.css` + `index.css` — no framework.
- **Background effects**: `BackgroundParticles` + `DataStreams` in `App.jsx`. CSS keyframe animations, `pointer-events: none`, `z-index: 0`. Safe to modify freely.
- **Backend**: `server/src/app.js` exposes `createApp({ store, corsOrigin, rateLimit, staticDir, logger })` — no `listen()`, so tests mount it on an ephemeral port. Three endpoints: `GET /api/health` (`status`, `db: 'mongo'|'memory'`, `uptime`, `timestamp`), `GET /api/scores?limit=N`, `POST /api/scores`.
- **Storage**: `server/src/store.js` — `createStore()` tries Mongo (3s timeout) and **falls back to an in-memory store** on any failure. `createMemoryStore` / `createMongoStore` share the same interface (`listScores`, `addScore`, `getStatus`, `close`); `clampLimit` bounds `limit` to 1..50.
- **Validation**: `server/src/validation.js` — `validateScorePayload` (strict integers, defaults for missing fields, English errors) + `sanitizeName`. `GET` rejects a non-integer `limit` with 400; `POST` returns 400 with `{ error, details }`.
- **Hardening**: rate limit 30 POST/min per IP (fixed window, `GET` untouched), JSON body capped at 10 kB, unknown `/api/*` → JSON 404, optional SPA static hosting, error handler (400 on bad JSON, 413 on oversized body).
- **Entry**: `server/src/index.js` — thin: env → store → app → listen, plus graceful `SIGINT`/`SIGTERM` shutdown with a 10s force-exit guard.
- **Tests (server)**: `server/test/api.test.js` (15), `store.test.js` (13), `validation.test.js` (16).
- **Leaderboard UI is not yet connected** to the API.

## Key conventions

- ES modules throughout (`import`/`export`).
- No TypeScript — plain `.jsx` / `.js`.
- No test framework: both packages expose `npm test` backed by `node:test` + `node:assert`.
- Board is a 2D array (`0` = empty, piece name string = filled, `'ghost'` = ghost cell).
- State shape includes `nextQueue` (3 pieces), `holdType`, `canHold`, `paused`, `lockResets`, `bag`.
- Every score returned/accepted by the API is `{ id, name, score, level, lines, date }` — `_id` / `__v` are never exposed.
- CSS custom properties for neon colors in `index.css`.
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
- `StrictMode` wraps `<App>` — effects run twice in dev (tick interval and lock-delay timers both clean up).
- Vite config is minimal (just `@vitejs/plugin-react`). **No proxy for `/api`** — the client must use an absolute URL or add the proxy.
- `@types/react` + `@types/react-dom` installed but unused (template leftovers).
- Server env: `PORT=3001`, `MONGO_URI=mongodb://localhost:27017/tetris`, `CORS_ORIGIN=*` — see `server/.env.example` (copy to `.env`, Node does not load it automatically).
- MongoDB is optional: 3s selection timeout, then the in-memory store (scores lost on restart). Rate limit applies to `POST` only.
- `client/dist/` is gitignored. After `npm run build`, `npm start` serves it with SPA fallback; without it, only the API is mounted.
- `.opencode/agents/` defines specialized subagents (`@frontend`, `@backend`) with write/edit/bash access.
