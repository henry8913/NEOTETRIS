# NEOTETRIS — Client

The browser side of NEOTETRIS, a cyberpunk neon Tetris: rendering, input, synthesized audio, effects and the leaderboard UI.

## Stack

- React 19 + Vite 8, JSX only — **no TypeScript**; plain CSS (neon custom properties in `index.css`, layout and keyframes in `App.css`).
- No CSS framework, no audio assets (WebAudio oscillators only), inline SVG icons (no emoji).
- `node:test` for the pure-logic tests — no test framework, no DOM harness.

## Commands

| Command | What it does |
|---------|--------------|
| `npm install` | Installs the client dependencies |
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | ESLint 10 (flat config) |
| `npm test` | 66 tests via `node --test` |

## Source layout

- `main.jsx` — React root, mounts `<App>` inside `StrictMode`.
- `App.jsx` — wiring only (~375 lines): `useReducer`, gravity, lock delay, keyboard, audio/FX effects, wide and compact compositions.
- `tetris.js` — pure primitives: shapes, `isValid`, `tryRotate` (SRS kicks), `lockPiece`, `clearLines`, `calcScore`, `SPEEDS`.
- `game.js` — pure state + reducer (`initialState`, `spawnPiece`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer`), zero React.
- `fx.js` — effect layer derived from each dispatch (`initAll`, `reduceAll`, `fxDone`), so effects never call `setState`.
- `sound.js` — WebAudio oscillators and gain envelopes into a compressor, no audio files; mute persisted in `localStorage`; `audioState()` / `masterVolume()` diagnostics.
- `input.js` — `press` / `pressHardDrop` for every on-screen button, plus `repeatPress` (joystick auto-repeat) and the guarded `haptic` helper.
- `joystick.js` — pure stick math: dead zone, dominant axis, tap detection and the DAS/repeat constants.
- `layout.js` — media-query hook and the one breakpoint shared by JSX and CSS.
- `api.js` — the only HTTP module: `API_BASE`, abort timeouts, per-row validation.
- `leaderboard.js` — pure ranking helpers (`normalizeName`, `mergeScores`, `rankOf`, `formatDate`).
- `storage.js` — `localStorage` wrapper that never throws (`neotetris.*` keys).
- `scoreCache.js` — in-memory leaderboard cache with a 30 s TTL.
- `components/` — `Board`, `SidePanel`, `ControlsRail`, `MobileHud`, `Joystick`, `TouchControls`, `Overlays`, `Leaderboard`, `Background`, `Fx`, `StatCard`, `pieces`.
- **Compact composition** — `.hud` on top, the board below (the only flexible row) and a translucent `.touch-layer` drawn *on* the playfield: joystick bottom-left, action pad bottom-right, both inset 12px (safe-area aware) with an 8px centre gap. The usable track is split 58/42, narrowing to 55/45 when the layer itself is ≤ 261px (`@container`, keyed to the board frame) so HOLD/PAUSE stay ≥ 44px wide. No dock row is reserved, so the board keeps the full phone height; the layer is below the start / pause / game-over overlays and is not mounted on the start / game-over screens. Pad keys fire on `pointerdown` (two-finger play) and paint `data-pressed` in the same frame; the stick keeps its own `pointerId` and a window-level move/up/cancel fallback when pointer capture is unavailable.
- `*.test.js` — `tetris.test.js`, `game.test.js`, `leaderboard.test.js`, `joystick.test.js`, `sound.test.js`.

**API** — `API_BASE = import.meta.env.VITE_API_URL || ''` (empty = same origin), which is what the dev proxy in `vite.config.js` (`/api` → `http://localhost:3001`) and the production Express build rely on. Without the server on `:3001` the game still plays, but scores stay local: they are kept in `localStorage` and shown under the `LOCAL` badge.
