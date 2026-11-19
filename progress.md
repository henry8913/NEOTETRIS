# Progress - NEOTETRIS

## Architettura

- **client/**: React 19 + Vite 8 (JSX, nessun TypeScript)
- **server/**: Express 4 + Mongoose 8 (ESM)
- **Game logic** divisa in due moduli puri (zero dipendenze React):
  - `tetris.js` — primitive: board, forme, `isValid`, `tryRotate` (kick table SRS), `isResting`, `lockPiece`, `clearLines`, scoring, bag, spawn, ghost, velocità; costanti `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`
  - `game.js` — stato + reducer: `initialState`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer` (azioni `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`); espone anche metadati di presentazione `combo` e `lastClear { id, count, rows, colors, perfect }` **senza cambiare le regole**
- **FX layer**: `fx.js` — wrapper puro del reducer (`initAll`, `reduceAll`, `fxDone`): deriva `intro`, `flash`, `banner`, `shake`, `wash`, `shock`, `drop` nello stesso dispatch; azioni `FX_DONE` / `FX_SHAKE`
- **Audio**: `sound.js` — solo WebAudio (oscillatori + gain, nessun asset), 12 suoni, mute persistito in `localStorage` (`neotetris.muted`), `AudioContext` creato al primo gesto
- **Layout**: `layout.js` — `WIDE_LAYOUT_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 560px)'` + `useWideLayout` (`useSyncExternalStore`); `input.js` — `press()` come unico path dei bottoni, `pressHardDrop()`, `repeatPress()` per il joystick e `haptic()`; `joystick.js` — matematica pura dello stick (dead zone, asse dominante, tap, costanti DAS)
- **API client**: `api.js` — unico modulo che parla HTTP: `API_BASE = VITE_API_URL || ''`, `fetchScores(limit, { timeout, signal })`, `submitScore()`, `fetchHealth()`; timeout 5s via abort (`408`), righe validate (`parseScore`), errori con `status`/`details`/`retryAfter`
- **Helper leaderboard**: `leaderboard.js` — funzioni pure condivise: `normalizeName` (max 20, strip control, fallback `PLAYER`), `compareScores`, `mergeScores` (dedupe per `id`), `rankOf`, `isRecord`, `formatDate` (UTC `DD/MM`)
- **Storage locale**: `storage.js` — wrapper sicuro di `localStorage` in `try/catch`; chiavi `neotetris.player`, `neotetris.best`, `neotetris.scores` (max 20 run locali)
- **Cache**: `scoreCache.js` — board merged in memoria per tab, TTL 30s, invalidata dopo un salvataggio o su REFRESH/RETRY
- **UI** con `useReducer(reduceAll, null, initAll)` in `App.jsx` (~375 righe): gravity via `setInterval`, lock delay via `useEffect` + `setTimeout`, input tastiera, audio/FX, stato della modale rankings, due composizioni di layout
- **Rendering**: `components/` (`Board`, `SidePanel`, `ControlsRail`, `MobileHud`, `Joystick`, `TouchControls`, `Overlays`, `Leaderboard`, `Background`, `Fx`, `StatCard`, `pieces`); stili in `App.css` + `index.css` (no framework CSS)
- **Test**: `node:test` in entrambi i package, nessun framework — **66 test client** (13 tetris + 22 game + 15 leaderboard + 13 joystick + 3 sound), **44 test server**
- **Backend** modulare: `app.js` (factory `createApp`, montabile nei test senza `listen`), `store.js` (store memoria/Mongo con fallback automatico), `validation.js` (payload score), `index.js` (entry sottile con graceful shutdown)
- **Store**: Mongo opzionale, timeout 3s → store in memoria; risposta API sempre `{ id, name, score, level, lines, date }` (mai `_id`/`__v`)
- **Leaderboard end-to-end**: game over → best locale → form nome → `POST /api/scores` → rank; modale Top 10 con badge SERVER/LOCAL e fallback offline

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
  - **compact** (mobile portrait): HUD a 6 elementi (score · lv · lines · hold · next ×3 · mute), board, e — sopra la board — il touch layer traslucido con joystick (58%) + action pad (42%)
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

### Round 5 — Leaderboard end-to-end ✅
- Client collegato all'API: `api.js` (timeout 5s, righe validate, `408` timeout, `429` con `retryAfter`), `leaderboard.js` (helper puri), `storage.js`, `scoreCache.js`
- Game over: form nome (`maxLength 20`, nome ricordato), `SAVE SCORE` con stati idle/saving/saved/error, `SAVED · RANK #N`, `NEW RECORD` e `BEST`; salvataggio locale in caso di errore/rete
- Modale `TOP RUNNERS` accessibile (`components/Leaderboard.jsx`): focus trap, Esc/backdrop, badge `SERVER`/`LOCAL`, skeleton, RETRY/REFRESH, cache 30s
- `RANKS` nel rail desktop e negli overlay start/game over; apertura in partita → pausa automatica
- Tastiera: a game over `Enter`/`Space` non riavviano (solo `REBOOT`), Esc chiude la modale, `m` non scatta mentre si scrive
- Dev: proxy Vite `/api` → `:3001`; produzione same-origin; `VITE_API_URL` per split deployment
- Test: `leaderboard.test.js` (15) → **50 test client**, **44 server**

### Round 6 — Mobile audio + joystick ✅
- **Audio mobile**: master 0.45 → `DynamicsCompressorNode` (−18 dB, knee 12, 6:1, attack 3 ms, release 250 ms) → destination; il mix resta basso ma si sente sullo speaker del telefono
- **iOS unlock**: buffer silenzioso di un campione su `createBuffer(1, 1, 22050)` al primo gesto; `initAudio()` è idempotente e ritorna subito quando il context è `running`
- **Ripresa persistente**: listener passivi e permanenti (`pointerdown`, `touchend`, `click`, `keydown`, `pageshow`, `visibilitychange`) al posto del vecchio `{ once: true }`; `playSound()` fa `resume()` e schedula **dopo** la promise (i primi suoni non vengono più persi su iOS)
- **Diagnostica**: `audioState()` (`uninitialized | suspended | running | unsupported`) e `masterVolume()`, nessun log in console
- **Joystick**: overlay sul playfield (non più una riga sotto): `.joy-zone` in basso a **sinistra** (58% della larghezza utile × 44%) e `.action-pad` in basso a **destra** (42%) (`DROP` / `HOLD` / `PAUSE`–`PLAY`); base flottante sotto il dito clampata nella zona, knob 44px, dead zone 30%, DAS 200 ms poi repeat 110 ms (soft drop 60 ms), rotazione una volta per gesto (riarmata al centro), tap < 180 ms → rotazione
- **Matematica pura** in `joystick.js` (`stickIntent`, `intentAction`, `repeatInterval`, `isTap`) + `joystick.test.js` (13) e `sound.test.js` (3)
- Touch layer: nessuna riga riservata sotto la board (`.tetris` ha solo `hud` + board), `.action-pad` 120px (56 + 8 + 56) con safe area, knob mai sotto 44px, base `clamp(100px, 32cqw, 132px)`, zero scroll
- Test: **66 client**, lint pulito, build **239.46 kB JS (75.33 kB gzip) / 42.87 kB CSS (9.40 kB gzip)**

### Round 7 — Touch controls come overlay sul playfield ✅
- I controlli non occupano più una riga: `.touch-layer` è `position: absolute; inset: 0` **dentro `.board-frame`**, `pointer-events: none`, `z-index: 5` (sopra la board, sotto start/pausa/game-over a `z-index: 10`)
- `.joy-zone` in basso a **sinistra** e `.action-pad` in basso a **destra**, entrambi `pointer-events: auto`; il resto del playfield resta morto ai tap
- Traslucenza: solo rgba + bordi neon, inner shadow e `text-shadow` per restare leggibili sulle celle accese senza coprire il pezzo che atterra
- `.board-frame` limita l'altezza a `2 × larghezza utile`: la board resta 1:2 anche quando è la larghezza a vincolare
- Pausa: l'overlay `PLAY` resta raggiungibile (`.pause-overlay` è pointer-transparent con gradiente che sfuma in basso); start e game over non montano affatto il layer
- Il layer è smontato quando `!wide` è falso o la run non è attiva; tastiera e rail wide invariati
- Misure: 390×844 board **374 × 748** (era 324 × 648, **+100px**), 320×568 board **249.5 × 499** (era 196 × 392, **+107px**), zero scroll
- Test: **66 client**, lint pulito, build **240.21 kB JS (75.51 kB gzip) / 43.80 kB CSS (9.50 kB gzip)**

### Round 8 — Usabilità mobile: due dita, zone e margini ✅
- **Lati scambiati**: joystick in basso a **sinistra**, action pad in basso a **destra** (DOM invariato, l'action pad resta primo per il tab order)
- **Geometria unica**: `--touch-pad` = `max(12px, env(safe-area-inset-left/right))` per entrambe le zone, `--touch-pad-y` per il fondo, `--touch-gap: 8px` al centro; larghezze `calc(usable × --touch-split)` a sinistra e `× (1 − split)` a destra → mai sovrapposte. Split **58/42**, che diventa **55/45** sotto `@container (max-width: 261px)` (il container è `.board-frame`, quindi la soglia è la larghezza del layer, non del viewport): 320×568 layer 249.5 → usable 217.5 → joy **119.6** + gap **8** + pad **97.9** → HOLD/PAUSE **44.9px** (≥ 44), inset 12 su entrambi i lati e sul fondo
- **Pad**: `56 + 8 + 56 = 120px`, DROP a tutta larghezza ≥56px, HOLD/PAUSE 56px; fill rgba 0.40, bordo 1px a 0.5 alpha (DROP magenta, HOLD ciano, PAUSA giallo / PLAY verde), nessun `backdrop-filter`/`filter`
- **Riposo più discreto**: ring e knob a **0.18** (0.5 durante il gesto), ring cavo (bordo + rgba), knob sempre 44px, base `clamp(100px, 32cqw, 132px)`
- **Multi-touch reale**: il joystick possiede un solo `pointerId`; il secondo dito sulla zona viene ignorato (base e knob non si muovono) e il suo rilascio non chiude il gesto. I bottoni del pad ora scattano su **`pointerdown`** (Chrome non sintetizza più `click` quando c'è un secondo dito), con `data-pressed` nello stesso frame e fallback `click` (`detail === 0`) per tastiera/AT
- **Fallback senza capture**: `pointermove`/`pointerup`/`pointercancel` su `window`, agganciati al pointerdown e rimossi al rilascio, con guardia sul target per non processare due volte l'evento catturato; `blur` resetta tutto. Verificato con un pointer sintetico dove `setPointerCapture` lancia `NotFoundError`
- **Feedback immediato**: `data-pressed` → `transition: none`, transform `scale(.985)`, bordo acceso; haptic su rotate/hard drop sempre in `try/catch`
- Misure: 390×844 joy **198.4 × 329.1**, pad **143.6 × 120** (HOLD/PAUSE **67.8 × 56**), board **374 × 748**, scroll **844/844**; 320×568 joy **119.6 × 219.5**, pad **97.9 × 120** (HOLD/PAUSE **44.9 × 56**), board **249.5 × 499**, scroll **568/568**
- Test: **66 client**, lint pulito, build ok

### Verifica finale
- `npm test --prefix client` → 66/66
- `npm test --prefix server` → 44/44
- `npm run lint --prefix client` → nessun errore
- `npm run build --prefix client` → build ok (**240.21 kB JS / 43.80 kB CSS**)

## Layout

- **Due composizioni esclusive**, scelte da `useWideLayout()`:
  - **wide** — griglia a tre colonne: rail controlli (220px) · board · rail hold/next (220px), dentro uno stage centrato `max-width: 1180px`; top bar con SCORE / LEVEL / LINES allineata alle stesse tre tracce
  - **compact** — `.hud` in alto (6 elementi), board sotto (unica riga flessibile) e `.touch-layer` traslucido **sopra** il playfield: joystick flottante 58% della larghezza utile × 44% in basso a sinistra, action pad 42% in basso a destra; nessuna riga riservata
- **Breakpoint unico** (JSX + CSS): `(min-width: 900px), (orientation: landscape) and (max-height: 560px)`
- **Landscape phone** (altezza ≤ 560px): shell wide senza top bar; i tre stats passano in cima al rail destro
- **Zero scroll**: `.tetris` è `height: 100%` + `overflow: hidden`; la board è l'unica riga flessibile (`height` → `width/2`, rapporto 1:2)
- **Margini reali**: `max(8px, env(safe-area-inset-*))` sulla shell, `viewport-fit=cover`, ≥ 24px sotto la board (wide); nel compact i controlli sono un overlay e ogni zona usa `--touch-pad` (`max(12px, env(safe-area-inset-left/right))`) e `--touch-pad-y`, con 8px di spazio morto al centro (`--touch-gap`)
- **Solo la composizione attiva è montata**: nessun bottone nascosto nel focus order
- Target ≥ 44px su mobile, **40px** nei rail wide; label HUD ≥ 9px

## Effetti / Audio

- `fx.js` deriva tutto nel reducer, nessun `setState` negli effect; ogni layer è rimosso su `animationend`
- Durate: flash righe ~260ms (label 440ms), slam/shake 380ms (leggero 200ms), sweep intro 450ms, burst 340–400ms, shockwave 600ms, wash 480ms, ripple 250ms, count-up 320ms
- Tetti nodi: 12 spark per clear normale, 16 per TETRIS, 22 per PERFECT CLEAR; ~20 nodi nel background; nessun canvas/rAF continuo
- Audio: 12 suoni sintetizzati (`move`, `rotate`, `lock`, `hold`, `clear1`–`clear4`, `tetris`, `perfect`, `levelup`, `gameover`, `start`, `ui-click`), master 0.45 con compressore (−18 dB / 6:1) per uno speaker da telefono; sblocco iOS con buffer silenzioso e ripresa persistente a ogni gesto/ritorno in foreground
- Mute persistito in `localStorage` (`neotetris.muted`), toggle con `M` o col bottone (aria-pressed)
- `prefers-reduced-motion`: animazioni decorative disattivate, count-up istantaneo, effetti pesanti spenti

## Leaderboard

- **End-to-end**: a game over il best locale viene scritto subito (`neotetris.best`), poi il form nome (precompilato con `neotetris.player`) invia `POST /api/scores`; in caso di successo la riga creata viene salvata in locale e si chiede `GET /api/scores?limit=50` per calcolare `SAVED · RANK #N`
- **Offline**: se il POST fallisce (rete, timeout, 429, 400) la run resta in `neotetris.scores` con id `local-…`; la UI mostra `SAVED LOCALLY` e `RETRY` rispedisce al server, sostituendo la copia provvisoria
- **Modale**: Top 10 con `mergeScores(server, local)`, badge `SERVER`/`LOCAL`, skeleton, stati vuoto/errore, RETRY/REFRESH; se il server non risponde si usa `fetchHealth()` per distinguere "offline" da "server in errore"
- **Cache**: board merged in memoria per 30s (`CACHE_TTL_MS`), invalidata dopo un salvataggio e dai pulsanti di refresh
- **Accessibilità**: `role="dialog"` + `aria-modal`, focus iniziale su CLOSE, Tab trap, Esc/backdrop per chiudere, focus restituito all'elemento che l'ha aperta; apertura in partita → `TOGGLE_PAUSE`
- **Storage**: `neotetris.player` (nome), `neotetris.best` (record), `neotetris.scores` (max 20 run, ordinate); ogni accesso in `try/catch`, JSON corrotto ignorato; il mute resta in `neotetris.muted`
- **Rete**: proxy Vite solo in dev, stessa origine in produzione, `VITE_API_URL` come override; richieste con timeout 5s e righe validate lato client

## Problemi noti / prossimi passi

- **Mongo opzionale**: senza DB la leaderboard server vive in RAM (score persi al riavvio del server); sopravvivono solo le run locali sul dispositivo
- **Rate limit**: 30 POST/min per IP; il client mostra `retryAfter` ma non fa code/retry automatico
- **Nessuna moderation dei nomi**: il server sanitizza soltanto (trim, control char, max 20), non filtra contenuti
- **Gamepad** non supportato
- **Profili server-side** (best personale persistente per giocatore) non implementati: oggi il best è solo locale
- Eventuale rifinitura: suoni/animazioni aggiuntive e tuning delle soglie combo

## Convenzione commit

- Subject **solo numerico progressivo** (`0.09` → `0.10`), body vuoto
- La documentazione (`AGENTS.md`, `README.md`, `progress.md`) va nello **stesso commit** del codice
- Branch: `feat/neotetris-upgrade-vN`
