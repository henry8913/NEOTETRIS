# Progress - NEOTETRIS

## Architettura

- **client/**: React 19 + Vite 8 (JSX, nessun TypeScript)
- **server/**: Express 4 + Mongoose 8 (ESM)
- **Game logic** divisa in due moduli puri (zero dipendenze React):
  - `tetris.js` — primitive: board, forme, `isValid`, `tryRotate` (kick table SRS), `isResting`, `lockPiece`, `clearLines`, scoring, bag, spawn, ghost, velocità; costanti `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`
  - `game.js` — stato + reducer: `initialState`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer` (azioni `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`); espone anche metadati di presentazione `combo` e `lastClear { id, count, rows, colors, perfect }` **senza cambiare le regole**
- **FX layer**: `fx.js` — wrapper puro del reducer (`initAll`, `reduceAll`, `fxDone`): deriva `intro`, `flash`, `banner`, `shake`, `wash`, `shock`, `drop` nello stesso dispatch; azioni `FX_DONE` / `FX_SHAKE`
- **Audio**: `sound.js` — solo WebAudio (oscillatori + gain, nessun asset), 12 suoni, mute persistito in `localStorage` (`neotetris.muted`), `AudioContext` creato al primo gesto
- **Layout**: `layout.js` — `WIDE_LAYOUT_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 560px)'` + `useWideLayout` (`useSyncExternalStore`); `input.js` — `press()` come unico path dei bottoni, `pressHardDrop()`
- **UI** con `useReducer(reduceAll, null, initAll)` in `App.jsx` (~335 righe): gravity via `setInterval`, lock delay via `useEffect` + `setTimeout`, input tastiera, audio/FX, due composizioni di layout
- **Rendering**: `components/` (`Board`, `SidePanel`, `ControlsRail`, `MobileHud`, `Overlays`, `Background`, `Fx`, `StatCard`, `pieces`, `TouchControls`); stili in `App.css` + `index.css` (no framework CSS)
- **Test**: `node:test` in entrambi i package, nessun framework — **35 test client**, **44 test server**
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
- FX solo CSS (keyframes/transform/opacity), max 12–22 nodi per burst; niente canvas
- Audio solo WebAudio/oscillatori; nessun file audio
- Niente emoji nella UI: icone SVG inline
- `prefers-reduced-motion` rispettato; target ≥ 44px (40px nei rail landscape); label ≥ 9px
- Zero scroll (`height: 100%` + `overflow: hidden`, `viewport-fit=cover`)
- Commit: subject **solo numerico progressivo** (`0.07` → `0.08`), body vuoto

## Progresso implementazione

### Round 1 — Gameplay core (client) ✅
- Estratto `game.js`: stato + reducer puri, testabili senza React
- `tetris.js` arricchito: kick table SRS per I e JLSTZ, `tryRotate`, `isResting`, `lockPiece`/`clearLines` invariati, costanti lock delay e coda
- `App.jsx` riscritto: lock delay (500 ms, max 15 reset), hold, coda dei 3 pezzi successivi, pausa, rotazione CCW, controlli touch su pointer (niente doppio input touch/mouse)
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

### Round 3 — UI/UX redesign ✅
- Shell a viewport-fit: **zero scroll**, `height: 100%` + `overflow: hidden`, `viewport-fit=cover`, safe-area inset
- Due composizioni esclusive:
  - **wide** (desktop e landscape phone): tre colonne — rail controlli · board · rail hold/next — in uno stage centrato `max-width: 1180px`
  - **compact** (mobile portrait): HUD a 6 elementi (score · lv · lines · hold · next ×3 · mute), board, dock con sei bottoni
- Landscape (altezza ≤ 560px): resta la shell wide ma senza top bar; score/level/lines passano nel rail destro
- Breakpoint unico condiviso JSX/CSS: `(min-width: 900px), (orientation: landscape) and (max-height: 560px)` (`layout.js`)
- Estratti `components/`: `Board` (+ `ClearFlash`, `BoardStage`), `SidePanel`, `ControlsRail`, `MobileHud`, `Overlays`, `Background`, `Fx`, `StatCard`, `pieces`, `TouchControls`
- `input.js`: un solo path `click` per i bottoni (niente doppio `pointerdown` + `click`), hold e mute come veri `<button>`
- Board 1:2 come unica riga flessibile, margini reali, target ≥ 44px (40px nei rail), label ≥ 9px
- Test: `game.test.js` sale a 22 (metadati `combo`/`lastClear`) → **35 test client**

### Round 4 — Wow / FX / audio ✅
- `fx.js`: metadati di presentazione derivati nel reducer (intro, flash, banner, shake, wash, shock, drop), smontati su `animationend`
- `sound.js`: motore WebAudio a 12 suoni, mute persistito (`neotetris.muted`), scorciatoia `m`, sblocco al primo gesto
- Count-up dello score (~320ms), burst neon sulle righe, shockwave su TETRIS/PERFECT CLEAR, wash sul level-up, game over con desaturazione
- Background reattivo al livello (`--level`, cap a 10), reduced-motion rispettato (animazioni decorative gated, count-up istantaneo)
- Test: **35 client / 44 server**, lint pulito, build **219.55 kB JS (68.94 kB gzip) / 28.47 kB CSS (6.82 kB gzip)**

### Verifica finale
- `npm test --prefix client` → 35/35
- `npm test --prefix server` → 44/44
- `npm run lint --prefix client` → nessun errore
- `npm run build --prefix client` → build ok (219.55 kB JS / 28.47 kB CSS)

## Layout

- **Due composizioni esclusive**, scelte da `useWideLayout()`:
  - **wide** — griglia a tre colonne: rail controlli (220px) · board · rail hold/next (220px), dentro uno stage centrato `max-width: 1180px`; top bar con SCORE / LEVEL / LINES allineata alle stesse tre tracce
  - **compact** — `.hud` in alto (6 elementi), board al centro, `.dock` con la thumb pad in basso
- **Breakpoint unico** (JSX + CSS): `(min-width: 900px), (orientation: landscape) and (max-height: 560px)`
- **Landscape phone** (altezza ≤ 560px): shell wide senza top bar; i tre stats passano in cima al rail destro
- **Zero scroll**: `.tetris` è `height: 100%` + `overflow: hidden`; la board è l'unica riga flessibile (`height` → `width/2`, rapporto 1:2)
- **Margini reali**: `max(8px, env(safe-area-inset-*))`, `viewport-fit=cover`, ≥ 24px sotto la board (wide) / ≥ 10px nel dock (compact)
- **Solo la composizione attiva è montata**: nessun bottone nascosto nel focus order
- Target ≥ 44px su mobile, **40px** nei rail wide; label HUD ≥ 9px

## Effetti / Audio

- `fx.js` deriva tutto nel reducer, nessun `setState` negli effect; ogni layer è rimosso su `animationend`
- Durate: flash righe ~260ms (label 440ms), slam/shake 380ms (leggero 200ms), sweep intro 450ms, burst 340–400ms, shockwave 600ms, wash 480ms, ripple 250ms, count-up 320ms
- Tetti nodi: 12 spark per clear normale, 16 per TETRIS, 22 per PERFECT CLEAR; ~20 nodi nel background; nessun canvas/rAF continuo
- Audio: 12 suoni sintetizzati (`move`, `rotate`, `lock`, `hold`, `clear1`–`clear4`, `tetris`, `perfect`, `levelup`, `gameover`, `start`, `ui-click`), volume master 0.12
- Mute persistito in `localStorage` (`neotetris.muted`), toggle con `M` o col bottone (aria-pressed)
- `prefers-reduced-motion`: animazioni decorative disattivate, count-up istantaneo, effetti pesanti spenti

## Problemi noti / prossimi passi

- **Leaderboard UI** non ancora collegata alle API (`GET`/`POST /api/scores`); oggi il client non chiama il server e Vite non ha proxy `/api`
- **High score locale** non ancora persistito: l'unica preferenza salvata è il mute
- **Gamepad** non supportato
- **Mongo opzionale**: senza DB si usa lo store in memoria (score persi al riavvio)
- Eventuale rifinitura: suoni/animazioni aggiuntive e tuning delle soglie combo

## Convenzione commit

- Subject **solo numerico progressivo** (`0.08`, `0.09`, …), body vuoto
- La documentazione (`AGENTS.md`, `README.md`, `progress.md`) va nello **stesso commit** del codice
- Branch: `feat/neotetris-upgrade-vN`
