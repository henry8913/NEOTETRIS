# NEOTETRIS — Agent Guide

## Structure

Monorepo with two packages. Root `package.json` has workspace scripts; each package has its own `package.json` and `node_modules`.

```
client/     # React 19 + Vite 8 (JSX, no TypeScript)
server/     # Express 4 + Mongoose 8 (ESM, both packages)
```

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts **both** dev servers in parallel (uses `&`, not `&&`) |
| `npm run dev:client` | Vite dev server on `localhost:5173` |
| `npm run dev:server` | Express on `localhost:3001` (uses `node --watch`, no nodemon) |
| `npm run build` | Builds **only** client to `client/dist/` |
| `npm start` | Starts production server (Express only, serves nothing by default) |
| `npm run lint` (in `client/`) | ESLint flat config (ESLint 10) |

Install: `npm install && cd client && npm install && cd ../server && npm install`.

## Architecture

- **Game logic** lives in `client/src/tetris.js` — pure JS, zero React deps. All constants (board size, piece shapes, colors, speeds) and pure functions (`isValid`, `lockPiece`, `clearLines`, etc.) are exported from there.
- **UI state** uses `useReducer` in `client/src/App.jsx`. No Redux/Zustand. Actions: `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `RESET`.
- **Rendering**: one `App` component with inline `Board`, `Cell`, `NextPiece` sub-components. All styles in `App.css` + `index.css` — no CSS framework.
- **Backend** has 3 endpoints (`GET /api/health`, `GET /api/scores`, `POST /api/scores`). MongoDB is optional — server starts without it (logs error but doesn't crash).
- **Leaderboard UI is not yet connected** to the API (roadmap item).

## Key conventions

- ES modules throughout — all imports/exports use `import`/`export`.
- No TypeScript — plain `.jsx` / `.js`.
- No tests — no test framework installed.
- Game board is a 2D array (`0` = empty cell, piece name string = filled, `'ghost'` = ghost cell).
- State has `nextQueue` (array of 3 piece types) shown below the board — replaces the old single `nextType`.
- CSS uses CSS custom properties for neon colors in `index.css`.

## Gotchas

- The root `npm run dev` launches both servers via `&` (background). To stop both, you may need to kill processes manually.
- Rotation is simple 90° CW matrix rotation with wall collision detection. **No SRS wall kicks** yet — if you add them, modify `isValid` calls in the `ROTATE` reducer case.
- Every `MOVE` with `dy: 1` that fails collision triggers `lockReduce` — this is the piece-locking mechanic. Don't change this without understanding the flow.
- The `fillBag` function mutates the bag array in-place (appends). Always pass a copy if starting fresh.
- `SPEEDS` array in `tetris.js:97` defines 15 levels. Index is `level - 1`.
- Server port is `process.env.PORT || 3001`. MongoDB URI is `process.env.MONGO_URI || 'mongodb://localhost:27017/tetris'`.
- `client/dist/` is gitignored. After build, serve it with any static server or wire it into Express.
