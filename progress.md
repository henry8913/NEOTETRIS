# Progress - NEOTETRIS

## Architettura

- **client/**: React 19 + Vite 8 (JSX, nessun TypeScript)
- **server/**: Express 4 + Mongoose 8 (ESM)
- **Game logic** divisa in due moduli puri (zero dipendenze React):
  - `tetris.js` — primitive: board, forme, `isValid`, `tryRotate` (kick table SRS), `isResting`, `lockPiece`, `clearLines`, scoring, bag, spawn, ghost, velocità; costanti `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`
  - `game.js` — stato + reducer: `initialState`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer` (azioni `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`)
- **UI state** con `useReducer` in `App.jsx` (~335 righe): gravity via `setInterval`, lock delay via `useEffect` + `setTimeout`, input tastiera/touch, overlay start/pausa/game over
- **Rendering**: componenti inline (`Board`, `Cell`, `NextPiece`); stili in `App.css` + `index.css` (no framework CSS)
- **Test**: `node:test` in entrambi i package, nessun framework — 28 test client, 44 test server
- **Backend** modulare: `app.js` (factory `createApp`, montabile nei test senza `listen`), `store.js` (store memoria/Mongo con fallback automatico), `validation.js` (payload score), `index.js` (entry sottile con graceful shutdown)
- **Store**: Mongo opzionale, timeout 3s → store in memoria; risposta API sempre `{ id, name, score, level, lines, date }` (mai `_id`/`__v`)
- **Leaderboard UI** non ancora collegata all'API

## Convenzioni chiave

- ES modules (`import`/`export`)
- Nessun TypeScript; nessun framework di test (`node --test` + `node:assert`)
- Griglia di gioco: array 2D (`0` = cella vuota, stringa nome pezzo = piena, `'ghost'` = fantasma)
- Stato con `nextQueue` (3 pezzi), `holdType`, `canHold`, `paused`, `lockResets`, `bag`
- Rotazione con SRS wall kick (`tryRotate`), y invertita rispetto alla tabella canonica
- Payload score validato lato server: `score` intero obbligatorio, `name`/`level`/`lines` con default
- Commit: subject **solo numerico progressivo** (`0.07` → `0.08`), body vuoto

## Progresso implementazione

### Round 1 — Gameplay core (client) ✅
- Estratto `game.js`: stato + reducer puri, testabili senza React
- `tetris.js` arricchito: kick table SRS per I e JLSTZ, `tryRotate`, `isResting`, `lockPiece`/`clearLines` invariati, costanti lock delay e coda
- `App.jsx` riscritto: lock delay (500 ms, max 15 reset), hold, coda dei 3 pezzi successivi, pausa, rotazione CCW, controlli touch su `onPointerDown` (niente doppio input touch/mouse)
- Test: `tetris.test.js` (13) + `game.test.js` (15) → **28 test, tutti verdi**
- Lint pulito, build produzione **202.32 kB / 63.58 kB gzip**

### Round 2 — Backend (server) ✅
- `app.js`: factory `createApp({ store, corsOrigin, rateLimit, staticDir, logger })`, route health/scores, 404 JSON su `/api/*`, static hosting SPA opzionale
- `store.js`: interfaccia comune memoria/Mongo, `createStore` con fallback automatico (timeout 3s), `clampLimit` 1..50, limite 200 score in memoria
- `validation.js`: `validateScorePayload` (interi stretti, default, errori in inglese) + `sanitizeName`
- `index.js`: entry sottile, env → store → app → listen, shutdown `SIGINT`/`SIGTERM` con guardia 10s
- Hardening: rate limit 30 POST/min per IP, body JSON max 10 kB, gestione errori (400 JSON malformato, 413 payload troppo grande)
- `server/.env.example` + script `npm test`
- Test: `api.test.js` (15), `store.test.js` (13), `validation.test.js` (16) → **44 test, tutti verdi**

### Verifica finale
- `npm test --prefix client` → 28/28
- `npm test --prefix server` → 44/44
- `npm run lint --prefix client` → nessun errore
- `npm run build --prefix client` → build ok

## Problemi noti / prossimi passi

- **Layout non a viewport**: board 300×600 + header 119 px non stanno in altezza su 1263×706 e 390×844 → i controlli finiscono fuori schermo; serve uno scaling/responsive layout (es. board con `clamp()`/aspect-ratio)
- **Scroll interno**: la pagina scrolla invece di adattarsi allo schermo; valutare `height: 100dvh` + `overflow: hidden`
- **Space scrolla dopo il game over**: il `preventDefault` su Space è attivo solo a partita avviata; da gestire anche nello stato di game over
- **Leaderboard UI** da collegare alle API (`GET`/`POST /api/scores`); oggi il client non chiama il server e Vite non ha proxy `/api`
- **Sound e juice** da fare: effetti audio, animazioni di clear/linee, screen shake
- **High score locale** da implementare (persistenza senza server)
- **Gamepad** non supportato
