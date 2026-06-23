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
| `npm start` | Production Express server (serves nothing by default) |
| `npm run lint` (in `client/`) | ESLint 10 flat config |

Install (each package has own `node_modules`):
```
npm install --prefix client && npm install --prefix server
```

## Architecture

- **Game logic**: `client/src/tetris.js` — pure JS, zero React deps. Exports constants (board size, piece shapes, colors, speeds) and pure functions (`isValid`, `lockPiece`, `clearLines`, etc.).
- **State**: `useReducer` in `client/src/App.jsx`. Actions: `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `RESET`.
- **Rendering**: single `App` component with inline `Board`, `Cell`, `NextPiece` sub-components. All CSS in `App.css` + `index.css` — no framework.
- **Background effects**: `BackgroundParticles` + `DataStreams` in `App.jsx`. CSS keyframe animations, `pointer-events: none`, `z-index: 0`. Safe to modify freely.
- **Backend**: 3 endpoints (`GET /api/health`, `GET /api/scores`, `POST /api/scores`). MongoDB optional — server starts without it (logs error, doesn't crash).
- **Leaderboard UI is not yet connected** to the API.

## Key conventions

- ES modules throughout (`import`/`export`).
- No TypeScript — plain `.jsx` / `.js`.
- No test framework installed.
- Board is a 2D array (`0` = empty, piece name string = filled, `'ghost'` = ghost cell).
- `nextType` (single piece) shown in top bar — preview of next piece.
- CSS custom properties for neon colors in `index.css`.
- Root `npm install` is a no-op (no root dependencies; install inside each package).

## Gotchas

- `npm run dev` at root launches both servers via `&`. Kill processes manually to stop.
- Rotation: simple 90° CW matrix rotation with wall collision detection. **No SRS wall kicks** — to add them, modify `isValid` calls in the `ROTATE` reducer case.
- `MOVE` with `dy: 1` that fails collision triggers `lockReduce` — the piece-locking mechanic. Don't change without understanding the flow.
- `fillBag` mutates the bag array in-place (`push`). Always pass a copy if starting fresh.
- `SPEEDS` in `tetris.js:97` defines 15 levels. Index is `level - 1`.
- Pieces spawn at `y: -1` (above visible board). `isValid` allows `ny < 0` cells — only checks board when `ny >= 0`.
- `lockPiece` returns a new board (shallow clone) — reducer never mutates state.
- `StrictMode` wraps `<App>` — effects run twice in dev (tick interval handles cleanup).
- Vite config is minimal (just `@vitejs/plugin-react`). No aliases, no proxy to server.
- `@types/react` + `@types/react-dom` installed but unused (template leftovers).
- Server: `PORT=3001`, `MONGO_URI=mongodb://localhost:27017/tetris`.
- `client/dist/` is gitignored. After build, serve with any static server or wire into Express.
- `.opencode/agents/` defines specialized subagents (`@frontend`, `@backend`) with write/edit/bash access.
