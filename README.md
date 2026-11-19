
```text

  ███████╗███╗   ██╗███████╗ ██████╗ ████████╗██████╗ ██╗███████╗
  ██╔════╝████╗  ██║██╔════╝██╔═══██╗╚══██╔══╝██╔══██╗██║██╔════╝
  █████╗  ██╔██╗ ██║█████╗  ██║   ██║   ██║   ██████╔╝██║███████╗
  ██╔══╝  ██║╚██╗██║██╔══╝  ██║   ██║   ██║   ██╔══██╗██║╚════██║
  ██║     ██║ ╚████║███████╗╚██████╔╝   ██║   ██║  ██║██║███████║
  ╚═╝     ╚═╝  ╚═══╝╚══════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝/

                      //  N E O T E T R I S  //

```

A cyberpunk-styled Tetris game built with **React 19** + **Vite 8** (frontend) and **Express** + **MongoDB** (backend).

## Features

- Full Tetris gameplay with all 7 standard tetrominoes (I, O, T, S, Z, J, L)
- **7-bag randomizer** — fair piece distribution
- **Next queue ×3** — the next three pieces are always visible
- **Hold piece** — stash one piece and swap it back later (once per drop)
- **SRS wall kicks** — rotations slide off walls, floors and stacks
- **Lock delay** — 500ms grace period on the ground, up to 15 resets per piece
- **Ghost piece** — shows where the piece will land
- **Hard drop** — instant drop with space bar
- **Rotation both ways** — clockwise and counter-clockwise
- **Pause** — freeze gravity and input without losing the run
- **15 speed levels** — from 800ms down to 30ms per tick
- **Scoring** — classic 100/300/500/800 points per line × level
- **Cyberpunk UI** — immersive neon atmosphere with animated background effects:
  - **Animated grid** — scrolling neon grid that drifts downward
  - **CRT scanline overlay** — sweeping scanline for retro monitor feel
  - **Floating data particles** — neon dots drifting upward in cyberpunk colors
  - **Data stream accents** — Matrix-style digital rain on screen edges
  - **Pulsing ambient glow** — shifting cyan-to-magenta radial gradient
  - **Level-reactive ambience** — the background intensity follows the current level (`--level`, capped at 10)
- **Viewport-fit layout** — zero page scroll on every screen:
  - **Desktop / landscape** — three columns (controls rail · board · hold/next rail) in a centred 1180px stage
  - **Mobile portrait** — compact 6-item HUD, board, and a single row of thumb buttons
  - **Landscape phones** — the wide shell without the top bar; score/level/lines move into the right rail
  - Real safe-area margins (`viewport-fit=cover`) and a board sized from the available height
- **Synthesized audio** — 12 WebAudio sounds (move, rotate, lock, hold, 1–4 line clears, TETRIS, perfect clear, level-up, game over, start), no audio files, `M` to mute; the choice is remembered locally
- **Juice & effects**:
  - Row flash and neon burst on every clear
  - `SINGLE` / `DOUBLE` / `TRIPLE` / `TETRIS!` / `PERFECT CLEAR` banners
  - Combo badge for consecutive clears
  - Level-up banner and colour wash
  - Screen shake on hard drops, TETRIS and game over
  - Count-up score readout and a landing ripple on hard drop
  - Game-over desaturation of the playfield
- **Accessibility** — real `<button>` controls, visible focus, aria labels/live score, keyboard-operable overlays, and `prefers-reduced-motion` support (effects disabled or snapped to their end state)
- **Keyboard controls** — arrows + space + X/Z/C/P/M
- **Touch controls** — on-screen buttons with a single pointer path (no double input), 44px+ targets
- **Leaderboard** — save a run with your name and see the **Top 10**:
  - Name form on game over (20 chars max, remembered for the next run)
  - `SAVE SCORE` with live states, then `SAVED · RANK #N`
  - Personal best and `NEW RECORD` badge (stored locally)
  - **Offline fallback** — works without the server: runs are kept on the device, the panel shows a `LOCAL` badge, and `RETRY` syncs to the server later
  - Accessible `TOP RUNNERS` modal (focus trap, Esc to close, skeleton/empty/error states, 30s cache)
  - `RANKS` in the desktop rail and on the start/game-over screens
- **Leaderboard API** — save and retrieve high scores (works with or without MongoDB)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, ESLint |
| Backend | Node.js, Express 4 |
| Database | MongoDB + Mongoose 8 (optional, in-memory fallback) |
| Fonts | Orbitron, Rajdhani (Google Fonts) |
| Styling | Pure CSS with keyframe animations |
| Tests | `node:test` (client + server, no framework) |

## Project Structure

```
├── client/                       # React frontend
│   ├── src/
│   │   ├── main.jsx              # Entry point
│   │   ├── App.jsx               # UI wiring, two layouts, lock delay, input
│   │   ├── game.js               # Pure state + reducer (+ combo/lastClear metadata)
│   │   ├── tetris.js             # Pure primitives, SRS kick tables
│   │   ├── fx.js                 # Reducer wrapper: transient FX state
│   │   ├── sound.js              # WebAudio synth + persisted mute
│   │   ├── layout.js             # Shared breakpoint + useWideLayout
│   │   ├── input.js              # Single click path for on-screen buttons
│   │   ├── api.js                # fetch wrapper: timeout, row validation, errors
│   │   ├── leaderboard.js        # Pure helpers: names, sort, merge, rank, dates
│   │   ├── storage.js            # Safe localStorage: name, best, local runs
│   │   ├── scoreCache.js         # 30s in-memory cache of the merged board
│   │   ├── components/           # UI building blocks
│   │   │   ├── Board.jsx         # Board, cells, clear flash, stage
│   │   │   ├── SidePanel.jsx     # Right rail: hold, next, mute, RANKS, hints
│   │   │   ├── ControlsRail.jsx  # Left rail: D-pad, drop, pause
│   │   │   ├── MobileHud.jsx     # Compact 6-item HUD
│   │   │   ├── Overlays.jsx      # Start / pause / game over + save form
│   │   │   ├── Leaderboard.jsx   # Top 10 dialog (server/local, retry, a11y)
│   │   │   ├── Background.jsx    # Particles + data streams
│   │   │   ├── Fx.jsx            # Sweep, burst, shockwave, wash, ripple, count-up
│   │   │   ├── StatCard.jsx      # Top-bar stat card
│   │   │   ├── pieces.jsx        # Previews, hold slot, mute button, SVG icons
│   │   │   └── TouchControls.jsx # Compact thumb pad
│   │   ├── tetris.test.js        # 13 tests
│   │   ├── game.test.js          # 22 tests
│   │   ├── leaderboard.test.js   # 15 tests
│   │   ├── App.css               # Cyberpunk styles + two compositions
│   │   └── index.css             # Global theme
│   ├── public/                   # Static assets
│   └── dist/                     # Production build (gitignored)
│
├── server/                       # Express backend
│   ├── src/
│   │   ├── index.js              # Entry: env → store → app → listen
│   │   ├── app.js                # createApp() factory + routes
│   │   ├── store.js              # Memory / Mongo stores
│   │   └── validation.js         # POST /api/scores validation
│   ├── test/                     # 44 tests (api, store, validation)
│   └── .env.example              # Environment template
│
└── package.json                  # Monorepo root scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB — **optional**. Without it the server runs on an in-memory store: scores work but are lost on restart.

### Install

```bash
npm install --prefix client && npm install --prefix server
```

### Run (development)

Start both client and server:

```bash
npm run dev   # starts both: Vite on 5173, Express on 3001
```

The game itself only needs the client, but the leaderboard needs the server: Vite proxies `/api` to `http://localhost:3001`. Without MongoDB the scores still work but live in memory (lost on server restart); the device keeps its own copy of recent runs.

Or run them separately:

```bash
npm run dev:client   # Vite dev server on port 5173
npm run dev:server   # Express server on port 3001
```

Configuration lives in `server/.env.example` (copy to `.env` or export the variables): `PORT`, `MONGO_URI`, `CORS_ORIGIN`, `NODE_ENV`.

For a split deployment (client and API on different origins), set `VITE_API_URL` to the API's absolute URL at build time, e.g. `VITE_API_URL=https://api.example.com npm run build`. Leave it unset for dev (proxy) and for production same-origin (Express serves `client/dist`).

### Test

```bash
npm test --prefix client   # 50 tests
npm test --prefix server   # 44 tests
```

### Build

```bash
npm run build   # Builds client for production
```

### Production

```bash
npm start       # Express serves client/dist if present, otherwise API only
```

The Express server mounts `client/dist` with an SPA fallback when the build exists; without it, only the API is available.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | `{ status, db, uptime, timestamp }` — `db` is `mongo` or `memory` |
| GET | `/api/scores?limit=N` | High scores, sorted by score. `N` is 1..50 (default 10) |
| POST | `/api/scores` | Save a new score (rate limited) |

### Score shape

```json
{
  "id": "6f1c...",
  "name": "Player",
  "score": 10000,
  "level": 5,
  "lines": 42,
  "date": "2026-11-18T21:00:00.000Z"
}
```

`_id` and `__v` are never exposed.

The client (`client/src/api.js`) calls these endpoints on a relative `/api` base: in dev Vite proxies it to `:3001`, in production Express serves the build from the same origin, and `VITE_API_URL` overrides the base for a split deployment. Requests time out after 5s, malformed rows are discarded, and a `429` surfaces its `Retry-After` so the UI can ask the player to retry shortly.

### POST `/api/scores`

```json
{
  "name": "Player",
  "score": 10000,
  "level": 5,
  "lines": 42
}
```

- `score` is required and must be an **integer number** (numeric strings are rejected); max 999999999.
- `name` is optional (default `"Anonymous"`, max 20 chars, sanitized); `level` defaults to 1 (1..99), `lines` to 0.
- Invalid payloads return `400` with `{ "error": "Invalid payload", "details": [...] }`.
- More than 30 POSTs per minute from one IP return `429` with `Retry-After`.
- Without MongoDB, scores are kept in memory (up to 200, newest high scores trimmed).

## Controls

| Key | Action |
|-----|--------|
| `←` `→` | Move left / right |
| `↓` | Soft drop |
| `↑` / `X` | Rotate clockwise |
| `Z` | Rotate counter-clockwise |
| `Space` | Hard drop |
| `C` / `Shift` | Hold / swap piece |
| `P` / `Esc` | Pause / resume |
| `M` | Mute / unmute |
| `Enter` | Start a run (on game over use `REBOOT`) |

Touch buttons mirror the same actions: move, rotate, hold, pause, soft drop and hard drop.

Keys are ignored while you type in the name field. On game over `Enter`/`Space` do not restart, so a stray key cannot wipe the save form; `Esc` closes the rankings modal.

On desktop and landscape a visible mute button sits in the right rail (always available on mobile in the HUD); the setting is stored in `localStorage`.

## Roadmap

- [x] Leaderboard UI (Top 10, name entry, rank, offline fallback, accessible modal)
- [x] Wall kicks (SRS)
- [x] Hold piece
- [x] Sound effects (synthesized WebAudio, mute persisted)
- [x] Local high score persistence (name, personal best, recent runs)
- [ ] Server-side player profiles / personal bests
- [ ] Gamepad support

## Deploy

Produzione: **https://neotetris.henrydev.it**

Un solo container (`neo-tetris`) su porta interna **3001**: Express serve sia le API sia la build Vite della SPA, quindi in produzione non gira Vite e `VITE_API_URL` resta vuoto (stessa origine). MongoDB gira in un container separato (`neo-tetris-mongo`) con volume persistente.

L'immagine è multi-stage (`Dockerfile`): stage `client` per `npm ci` + `vite build`, stage `runtime` con solo le dipendenze di produzione del server. Lo stack è descritto in `docker-compose.yml` (`app` + `mongo` + volume `mongo_data`), con `restart: unless-stopped`.

### Nginx Proxy Manager

Proxy Host verso il container, con Let's Encrypt:

| Campo | Valore |
|-------|--------|
| Domain Names | `neotetris.henrydev.it` |
| Scheme | `http` |
| Forward Hostname / IP | `neo-tetris` |
| Forward Port | `3001` |
| Block Common Exploits | attivo |
| Websockets Support | **off** (non servono) |
| SSL | Let's Encrypt + **Force SSL** |

Il container `app` è collegato alla rete esterna `npm_default` (dove vive Nginx Proxy Manager); `mongo` resta sulla sola rete interna e non è raggiungibile dal proxy. La porta **5173 è solo dev** (Vite): non usarla in produzione.

### Deploy automatico

Ogni push su `main` esegue `.github/workflows/deploy.yml`: SSH su `158.180.235.83`, `git pull` in `/var/www/NEOTETRIS`, `docker compose up --build -d --remove-orphans`. Richiede il secret `SSH_PRIVATE_KEY`; i deploy sono serializzati (`concurrency: deploy-production`), quindi non si sovrappongono.

### Locale

```bash
docker network inspect npm_default >/dev/null 2>&1 || docker network create npm_default
docker compose up --build -d    # → http://localhost:3001
docker compose ps               # app e mongo devono risultare "healthy"
docker compose logs -f app
docker compose down             # aggiungi -v per cancellare anche i punteggi (volume mongo_data)
```

Nessun `env_file` da preparare: le variabili (`MONGO_URI`, `CORS_ORIGIN`, `PORT`) sono già nel compose.
