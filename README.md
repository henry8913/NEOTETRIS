
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
- **Ghost piece** — shows where the piece will land
- **Hard drop** — instant drop with space bar
- **Rotation** with wall collision detection
- **15 speed levels** — from 800ms down to 30ms per tick
- **Scoring** — classic 100/300/500/800 points per line × level
- **Cyberpunk UI** — neon glow, CRT scanlines, animated borders, dark theme
- **Keyboard controls** — arrow keys + space + enter
- **Touch controls** — on-screen buttons for mobile play
- **Leaderboard API** — save and retrieve high scores (server required)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, ESLint |
| Backend | Node.js, Express 4 |
| Database | MongoDB + Mongoose 8 |
| Fonts | Orbitron, Rajdhani (Google Fonts) |
| Styling | Pure CSS with animations |

## Project Structure

```
├── client/                  # React frontend
│   ├── src/
│   │   ├── main.jsx         # Entry point
│   │   ├── App.jsx          # Main game component
│   │   ├── App.css          # Cyberpunk styles
│   │   ├── index.css        # Global theme
│   │   └── tetris.js        # Pure game logic
│   ├── public/              # Static assets
│   └── dist/                # Production build
│
├── server/                  # Express backend
│   └── src/
│       └── index.js         # API server (scores)
│
└── package.json             # Monorepo root scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (for the leaderboard feature)

### Install

```bash
npm install
cd client && npm install
cd ../server && npm install
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

### Build

```bash
npm run build   # Builds client for production
```

### Production

```bash
npm start       # Starts the Express server
```

Serve the `client/dist` folder with any static server or configure Express to serve it.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scores` | Top 10 high scores |
| POST | `/api/scores` | Save a new score |

### POST `/api/scores`

```json
{
  "name": "Player",
  "score": 10000,
  "level": 5,
  "lines": 42
}
```

## Controls

| Key | Action |
|-----|--------|
| `←` `→` | Move left / right |
| `↓` | Soft drop |
| `↑` | Rotate |
| `Space` | Hard drop |
| `Enter` | Start / Restart |

## Roadmap

- [ ] Leaderboard UI (connect client to API)
- [ ] Wall kicks (SRS)
- [ ] Hold piece
- [ ] Sound effects
- [ ] Local high score persistence
- [ ] Gamepad support
