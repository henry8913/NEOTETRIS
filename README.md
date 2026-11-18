
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
- **Keyboard controls** — arrows + space + X/Z/C/P
- **Touch controls** — on-screen buttons with a single pointer path (no double input)
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
│   │   ├── App.jsx               # UI wiring, lock delay, input
│   │   ├── game.js               # Pure state + reducer
│   │   ├── tetris.js             # Pure primitives, SRS kick tables
│   │   ├── tetris.test.js        # 13 tests
│   │   ├── game.test.js          # 15 tests
│   │   ├── App.css               # Cyberpunk styles
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
npm run dev
```

Or run them separately:

```bash
npm run dev:client   # Vite dev server on port 5173
npm run dev:server   # Express server on port 3001
```

Configuration lives in `server/.env.example` (copy to `.env` or export the variables): `PORT`, `MONGO_URI`, `CORS_ORIGIN`, `NODE_ENV`.

### Test

```bash
npm test --prefix client   # 28 tests
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
| `Enter` | Start / Restart |

Touch buttons mirror the same actions: move, rotate, hold, pause, soft drop and hard drop.

## Roadmap

- [ ] Leaderboard UI (connect client to API)
- [x] Wall kicks (SRS)
- [x] Hold piece
- [ ] Sound effects
- [ ] Local high score persistence
- [ ] Gamepad support
