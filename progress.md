# Progress - NEOTETRIS

## Architettura

- **client/**: React 19 + Vite 8 (JSX, nessun TypeScript)
- **server/**: Express 4 + Mongoose 8 (ESM)
- **Game logic** divisa in due moduli puri (zero dipendenze React):
  - `tetris.js` — primitive: board, forme, `isValid`, `tryRotate` (kick table SRS), `isResting`, `lockPiece`, `clearLines`, scoring, bag, spawn, ghost, velocità; costanti `LOCK_DELAY_MS = 500`, `MAX_LOCK_RESETS = 15`, `NEXT_QUEUE_SIZE = 3`
  - `game.js` — stato + reducer: `initialState`, `takeNext`, `takeFromQueue`, `lockReduce`, `reducer` (azioni `START`, `MOVE`, `ROTATE`, `HARD_DROP`, `TICK`, `LOCK`, `HOLD`, `TOGGLE_PAUSE`, `RESET`); espone anche metadati di presentazione `combo` e `lastClear { id, count, rows, colors, perfect }` **senza cambiare le regole**
- **FX layer**: `fx.js` — wrapper puro del reducer (`initAll`, `reduceAll`, `fxDone`): deriva `intro`, `flash`, `banner`, `shake`, `wash`, `shock`, `drop` nello stesso dispatch; azioni `FX_DONE` / `FX_SHAKE`
- **Audio**: `sound.js` — solo WebAudio (oscillatori + gain, nessun asset), 12 suoni, mute persistito in `localStorage` (`neotetris.muted`), `AudioContext` creato al primo gesto
- **Layout**: `layout.js` — `WIDE_LAYOUT_QUERY = '(min-width: 900px), (orientation: landscape) and (max-height: 560px) and (min-width: 640px)'` + `useWideLayout` (`useSyncExternalStore`); `visualViewport.js` — `useKeyboardInset()` pubblica l'altezza della tastiera come `--kb-inset` su `<html>` (rAF, nessuno state) e `revealInView()`; `input.js` — `press()` come unico path dei bottoni, `pressHardDrop()`, `repeatPress()` per il joystick e `haptic()`; `joystick.js` — matematica pura dello stick (dead zone, asse dominante, tap, costanti DAS)
- **API client**: `api.js` — unico modulo che parla HTTP: `API_BASE = VITE_API_URL || ''`, `fetchScores(limit, { timeout, signal })`, `submitScore()`, `fetchHealth()`; timeout via abort (`408`) — 5s in lettura, **10s in scrittura** (una POST su rete mobile non va abbandonata a 5s), righe validate (`parseScore`), errori con `status`/`details`/`retryAfter`
- **Helper leaderboard**: `leaderboard.js` — funzioni pure condivise: `normalizeName` (max 20, strip control, fallback `PLAYER`), `compareScores`, `mergeScores` (dedupe per `id`; oggi solo board offline e dedupe del rank), `rankOf`, `isRecord`, `formatDate` (UTC `DD/MM`)
- **Storage locale**: `storage.js` — wrapper sicuro di `localStorage` in `try/catch`; chiavi `neotetris.player`, `neotetris.best`, `neotetris.scores` (max 20 run locali)
- **Cache**: `scoreCache.js` — board **del server** in memoria per tab (righe come arrivano, mai unite alle run locali), TTL 30s, invalidata dopo un salvataggio o su REFRESH/RETRY
- **Build identity**: `buildInfo.js` — `assetName`, `parseEntryAsset`, `buildTag`, `isStale` (puri, testati); tag `BUILD <HASH6>` nella start screen e banner `NEW VERSION AVAILABLE` quando l'HTML servito referenzia un entry diverso (throttle 30s, `cache: 'no-store'`, offline silenzioso)
- **UI** con `useReducer(reduceAll, null, initAll)` in `App.jsx` (~510 righe): gravity via `setInterval`, lock delay via `useEffect` + `setTimeout`, input tastiera, audio/FX, rilevamento build obsoleta + banner, stato della modale rankings, due composizioni di layout
- **Rendering**: `components/` (`Board`, `SidePanel`, `ControlsRail`, `MobileHud`, `Joystick`, `TouchControls`, `Overlays`, `Leaderboard`, `Background`, `Fx`, `StatCard`, `pieces`); stili in `App.css` + `index.css` (no framework CSS)
- **Test**: `node:test` in entrambi i package, nessun framework — **100 test client** (13 tetris + 22 game + 17 leaderboard + 13 joystick + 3 sound + 9 runKey + 4 storage + 9 buildInfo + 10 saveSession), **44 test server**
- **Backend** modulare: `app.js` (factory `createApp`, montabile nei test senza `listen`), `store.js` (store memoria/Mongo con fallback automatico), `validation.js` (payload score), `index.js` (entry sottile con graceful shutdown)
- **Store**: Mongo opzionale, timeout 3s → store in memoria; risposta API sempre `{ id, name, score, level, lines, date }` (mai `_id`/`__v`)
- **Leaderboard end-to-end**: game over → best locale → form nome (**nome congelato al primo invio**) → `POST /api/scores` → rank sul board del server; modale Top 10 con badge SERVER/LOCAL e fallback offline

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

### Round 9 — Salvataggio una volta sola + pad più trasparente ✅
- **Save-once**: dopo un salvataggio confermato il form sparisce per quella run e al suo posto c'è un blocco read-only (`SAVED AS <NOME>` + `RANK #N`, o `ON THE BOARD` se il rank non è calcolabile) con `RANKINGS` / `REBOOT`; l'unico modo per rivedere il form è `REBOOT`, che rimonta `Overlays` (`key={run-${runId}}`) — nessun altro reset
- **Rankings automatico**: `onSaved(created)` (highlight) e subito dopo `onRankings()`, nello stesso batch, quindi la modale si apre già con la riga nuova evidenziata; la run è finita, quindi niente `TOGGLE_PAUSE` (verificato: nessun `.pause-overlay`)
- **Terminale per la run**: `savedRef` + `busyRef` rendono `saved` definitivo (un secondo Enter, un click sintetico o un doppio tap non rifanno la POST); `aliveRef` impedisce che una risposta arrivata dopo `REBOOT` apra la modale sopra la run nuova
- **Idempotenza**: `runKey.js` (`makeRunKey`) genera **una** chiave per run (`crypto.randomUUID()`, altrimenti timestamp + random a 32 bit), tenuta in un ref e reinviata **anche dal RETRY**: la POST che era andata in timeout dopo l'insert ora torna 200 con la riga esistente invece di duplicarla. Contratto server rispettato in entrambi i rami: 8–64 caratteri `[A-Za-z0-9_-]` (uuid sanificato, fallback con salt a 7 cifre zero-padded) — una chiave rifiutata con 400 avrebbe spinto una run valida nel percorso locale
- **Offline invariato**: la POST fallita lascia `SAVED LOCALLY` + `RETRY` e non naviga (la regola one-shot vale solo per un salvataggio confermato); copia provvisoria locale (`provisionalRef`/`removeLocalScore`) intatta
- **Pad più trasparente**: `.action-btn` da `rgba(8,10,26,0.4)` a **0.22** (DROP 0.26 sopra il gradiente magenta 0.14), bordi a **0.35** alpha (DROP 0.40, PAUSA 0.35, PLAY 0.35), `text-shadow` a due strati (ombra 0.95 + alone nel colore d'accento), inset scuro ridotto a 0.16; `[data-pressed]`/`:active` restano ≥0.45 (**0.48**, DROP 0.50) con `transition: none`, nessun `backdrop-filter`/`filter`, misure invariate (HOLD/PAUSE 68×56, DROP 144×56 a 390×844)
- Verifiche headless (Chromium 390×844): save → modale con riga `is-highlight`, form assente, conferma `SAVED AS NEO RANK #2`; RETRY → 2 POST con la **stessa** chiave valida; REBOOT → form pulito con il nome ricordato; computed styles del pad come sopra
- Test: `runKey.test.js` (9) → **75 client**, lint pulito, build **242.25 kB JS (76.21 kB gzip) / 45.17 kB CSS (9.74 kB gzip)**

### Round 10 — Save flow 0.17: nome normalizzato, zero-score, build identity ✅
- **Nome ricordato normalizzato**: `Overlays` semina il campo con `normalizeName(loadName())` (stessa funzione del submit), quindi un valore legacy in `neotetris.player` (`"PLAYER "`, doppi spazi, caratteri di controllo) non compare più com'era salvato; `maxLength 20` invariato e fallback `PLAYER` invariato (`storage.test.js`)
- **Zero-score**: `shouldOfferSave(score)` in `leaderboard.js` (puro, `> 0`) governa tutto il flusso. A 0 il game over mostra il blocco read-only `NO SCORE TO SAVE` / `PLAY AGAIN TO GET ON THE BOARD` al posto del form: niente input, niente submit, niente POST, niente `saveLocalScore`, niente `saveBest`, niente badge `NEW RECORD`, niente apertura automatica della modale, nessun autofocus; restano `RANKINGS` e `REBOOT`. `saveBest` rifiuta esplicitamente 0 come ulteriore difesa. Server invariato (`score >= 0` accettato per compatibilità API): la regola è lato client e documentata nell'header di `Overlays.jsx`
- **Build identity**: `buildInfo.js` (`assetName`, `parseEntryAsset`, `buildTag`, `isStale`) ricava l'entry hashed da `index.html`; `App.jsx` legge lo `<script type="module">` in esecuzione e mostra `BUILD <HASH6>` (primi 6 caratteri dell'hash, `DEV` senza hash) sotto `// 2084 //` nella start screen, a 8–10px, uppercase, bassa opacità
- **Banner nuova versione**: su mount + `visibilitychange`/`pageshow` (throttle 30s) una `fetch('/', { cache: 'no-store' })` rilegge l'HTML servito e confronta l'entry con quella in esecuzione; se differiscono appare `NEW VERSION AVAILABLE` + `RELOAD` (fixed, `z-index: 8` tra touch layer e overlay, safe-area, 44px, nessun `backdrop-filter`, animazione gated da `prefers-reduced-motion`). Offline/HTML non parsabile = nessun banner, nessun log; reload = hash uguali = banner assente
- Verifiche headless (Chromium 390×844, `node server/src/index.js`): zero-score → `SYSTEM HALTED / SCORE 0 / BEST 0 / NO SCORE TO SAVE / PLAY AGAIN TO GET ON THE BOARD / RANKINGS / REBOOT`, 0 POST, localStorage vuoto, focus su `BODY`; run normale (200 punti) → nome precompilato `PLAYER` da `"PLAYER "`, **1 sola** POST 201 con `key`, modale aperta con riga `is-highlight`, form sostituito da `SAVED AS NEO TETRIS / RANK #1`, Enter/Space extra non rifanno la POST; reload → campo precompilato `Neo Tetris` senza spazi ai bordi; tag `BUILD CRUN-D` (hash `CrUN-dTo`), banner assente a hash uguali e presente (52px, x 12, y 8) dopo un HTML servito diverso, dismiss ok, scroll 844/844, zero righe in console
- Test: `leaderboard.test.js` (17), `storage.test.js` (4), `buildInfo.test.js` (9) → **90 client**, lint pulito, build **244.83 kB JS (76.99 kB gzip) / 47.39 kB CSS (10.11 kB gzip)**

### Round 11 — Accettazione produzione: quattro difetti visivi (390×844 touch) ✅
- **Wordmark troncato (`NE|`)**: la causa non era l'`overflow` dell'overlay ma il gradiente animato. `background-size: 300%` animato da `0%` a `300%` faceva scivolare l'immagine fuori dall'elemento: con `-webkit-text-fill-color: transparent` i glifi non più coperti venivano **cancellati** (a metà ciclo restavano solo le prime due lettere). Ora il gradiente è **due tile identiche** (`background-size: 200%`, stop periodici a 50%) e l'animazione va solo da `0%` a `100%`: l'immagine resta sempre sopra la parola, e il loop è continuo perché le due tile sono uguali. Aggiunti `background-color: var(--neon-cyan)` come rete di sicurezza, `font-size: clamp(15px, 8.6cqw, 32px)`, `letter-spacing: clamp(0.5px, 0.55cqw, 3px)`, `max-width: 100%`, `white-space: nowrap`. Misure: 320×568 titolo **153.1px** in un overlay da **249.5** (`scrollWidth 153 = clientWidth 153`), font **21.46px**, ink interamente dentro l'elemento e dentro l'overlay; 390×844 **228.4 / 374** (font 32px); 1440×900 **229.5 / 394.8**. Con `prefers-reduced-motion` l'animazione è `none` e il gradiente statico (posizione 0%) dipinge tutta la parola
- **Tap fantasma su REBOOT dopo il salvataggio**: `.overlay-actions` ha `margin-top: clamp(18px, 4.6cqw, 24px)` e `.save-confirm` è alto **56px** (min-height, padding 6–10px): lo spazio morto fra il blocco di conferma e i due bottoni passa da **~6px a 22px** (390×844 e 320×568), 20px a 844×390, 24.5px a 1440×900; vale anche per il blocco zero-score (`NO SCORE TO SAVE`, 24px). Sonde `elementFromPoint` a 3 ascisse × 40 altezze (1–40px sopra REBOOT): **0 hit su `BUTTON`** in tutte le configurazioni — la banda 1–22px risolve su `.overlay` e 23–40px su `.save-confirm` (blocco statico, nessun handler)
- **Modale trasparente a ~180ms**: `.lb-modal` non anima più l'`opacity` (keyframe `lb-in` = solo `scale` 0.96 → 1) e ha una superficie propria `background-color: rgba(6, 9, 22, 0.96)` con il radial ciano come solo `background-image`; il backdrop resta `rgba(3, 3, 10, 0.82)` e **senza `backdrop-filter`**. Misure con le animazioni congelate: a 0/40/90/180/219ms `opacity` della card = **1**, `background-color` = `rgba(6, 9, 22, 0.96)`; solo il backdrop sfuma (0 → 1). Nessun `backdrop-filter` in tutta la modale
- **Cifre del game over tagliate**: `.final-block` è `flex: 0 0 auto` + `min-height: min-content` + `overflow: visible` (prima `flex: 0 1 auto`, quindi poteva essere compresso: `scrollHeight 86` vs `clientHeight 78`) e `.final-score` tiene `line-height: 1` con `padding-bottom: 0.14em`, la quantità esatta di ink che Orbitron fa uscire dal box. Misure: **74/74** a 320×568 e **74/74** a 390×844 con 1 cifra, con 4 cifre e con il punteggio reale (6 cifre resta 74/74); 54/54 a 844×390, 87/87 a 1440×900. Overlay e pagina senza overflow in tutte le prove (`scrollHeight = clientHeight`, `documentElement` 568/568, 844/844, 900/900)
- Verifiche: `npm run lint --prefix client` pulito, `npm test --prefix client` **90/90**, build **244.83 kB JS (76.99 kB gzip) / 47.60 kB CSS (10.19 kB gzip)**

### Round 12 — Tastiera iOS, layout e salvataggio che sopravvive al remount ✅
- **BUG A — la tastiera faceva scattare il layout landscape**: a 390×844, aprendo la tastiera su iOS il layout viewport scende a ~375×370, quindi `(orientation: landscape) and (max-height: 560px)` diventava **vero** su un telefono in verticale: `wide` passava a `true`, React smontava la composizione compact e montava quella wide (rail `CONTROLS` a sinistra, `CORE/LEVEL/LINES/HOLD/NEXT` a destra), la card di game over veniva schiacciata a ~400px e il testo si tagliava (`CORE 10…`, `EVEL .INES`). `WIDE_LAYOUT_QUERY` ora è `(min-width: 900px), (orientation: landscape) and (max-height: 560px) and (min-width: 640px)`: un telefono in landscape è sempre ≥ 640px largo, un viewport portrait con la tastiera è 375–430px, quindi non può più combaciare. I **tre** `@media` di `App.css` che rispecchiano la query sono stati aggiornati identici (`grep max-height: 560px` → 1907/2235/3149 di prima, ora 1944/2273/3188) e nessun altro `matchMedia` usa la stringa: la composizione resta decisa solo da `useWideLayout()`
- **BUG B — la card doveva restare usabile con la tastiera aperta**: nuovo `visualViewport.js` con `useKeyboardInset()` (montato una volta in `App.jsx`): ascolta `visualViewport` `resize`/`scroll` (+ `orientationchange`), calcola `max(0, innerHeight − visualViewport.height − visualViewport.offsetTop)`, lo scrive come `--kb-inset` su `<html>` dentro un `requestAnimationFrame` e solo quando il valore cambia (zero `setState`, stesso pattern di `--level`), pulisce listener e proprietà all'unmount; senza `visualViewport` resta `0px`. `.overlay` è ora keyboard-aware: `max-height: calc(100% − var(--kb-inset, 0px))`, `padding-bottom: calc(var(--overlay-pad) + var(--kb-inset, 0px))`, `overflow-y: auto` + `-webkit-overflow-scrolling: touch` + `overscroll-behavior: contain`, scrollbar nascosta e **nessun** `backdrop-filter` aggiunto. L'`input` del nome fa `scrollIntoView({ block: 'nearest' })` al focus e l'hook riporta in vista il campo attivo quando l'inset cresce
- **Centratura senza clipping**: `.overlay` usa `justify-content: flex-start` + `margin-top/bottom: auto` sul primo e sull'ultimo figlio invece di `justify-content: center`, che in un contenitore scrollabile taglia la parte alta e la rende irraggiungibile. Le due regole stanno **in fondo** ad `App.css`: prima venivano cancellate da `margin: 0` di `.build-tag`/`.hint` e la card si incollava al bordo inferiore (`top 397 / bottom 22`); dopo lo spostamento `top 209 / bottom 209` a 390×844 e `279 / 279` sulla start screen
- **BUG C — il remount distruggeva il salvataggio**: la stessa `stage` è renderizzata dentro due `<main>` diversi, quindi ogni flip di `wide` smonta e rimonta `<Overlays>`. Sequenza reale: focus sul campo → tastiera → flip → remount → `blur()` all'invio → tastiera chiusa → flip → **secondo remount subito dopo la POST** → `Overlays` nuovo con `status: 'idle'`, `keyRef` vuoto e `savedRef: false`: la run era sul server ma il giocatore rivedeva il form, la modale non si apriva e un secondo invio con un altro nome creava una seconda riga. Nuovo `saveSession.js` (in memoria, per `runId`, pota alle ultime 2 run, con `subscribe`): `Overlays` semina stato/ref da `readSaveSession(runId)`, scrive **prima** di ogni `setState` (e anche nel `finally`), segue il negozio con `subscribeSaveSession` (una risposta arrivata dopo l'unmount aggiorna l'istanza montata) e consuma `pendingOpen` una sola volta per aprire `onSaved` + `onRankings`. `saved` sul negozio → faccia `SCORE SAVED` immediata, nessun input, `keyRef` riusato dal RETRY, run nuova = `runId` nuovo = `idle`
- **Verifiche headless (Chromium, dev server, API stubbata)**: a **375×370** composizione compact (`.hud` + `.touch-layer`/joystick, nessun rail, nessun `CONTROLS`, 0 label tagliate, anche con la card di game over: `scrollWidth = clientWidth`); a **844×390** wide (rail + `CONTROLS`, `.hud` assente, `top-bar` `display: none`); a **1440×900** wide con top bar `grid`. Remount: **1 POST** per run sia con il flip *durante* la POST sia con il flip *prima* e viewport lasciato schiacciato durante la risposta; finale `SAVED AS NEO / RANK #1` e `SAVED AS ZED / RANK #1`, `.save-form` assente, **1 sola** richiesta `limit=10` (modale aperta una volta, chiusa non si riapre, `RANKINGS` la riapre a richiesta), `REBOOT` → form `idle` editabile
- **Inset tastiera simulato a 300px (390×844)**: card `max-height: calc(100% − 300px)`, `scrollHeight 653` / `clientHeight 448` (scrollabile), `padding-bottom 322px`, card `83 → 531` (limite `844 − 300 = 544`), SAVE `[287, 331]` interamente sopra la tastiera, pagina ferma (`scrollTop 0`, `scrollHeight 844 = innerHeight`). Con `--kb-inset: 0` l'overlay landscape mantiene i suoi 6px di padding (`6px / 6px / gap 3px`)
- Test: `saveSession.test.js` (10) → **100 client**, lint pulito, build **248.07 kB JS (78.08 kB gzip) / 48.43 kB CSS (10.36 kB gzip)**

### Verifica finale
- `npm test --prefix client` → 100/100
- `npm test --prefix server` → 44/44
- `npm run lint --prefix client` → nessun errore
- `npm run build --prefix client` → build ok (**248.07 kB JS / 48.43 kB CSS**)

## Layout

- **Due composizioni esclusive**, scelte da `useWideLayout()`:
  - **wide** — griglia a tre colonne: rail controlli (220px) · board · rail hold/next (220px), dentro uno stage centrato `max-width: 1180px`; top bar con SCORE / LEVEL / LINES allineata alle stesse tre tracce
  - **compact** — `.hud` in alto (6 elementi), board sotto (unica riga flessibile) e `.touch-layer` traslucido **sopra** il playfield: joystick flottante 58% della larghezza utile × 44% in basso a sinistra, action pad 42% in basso a destra; nessuna riga riservata
- **Breakpoint unico** (JSX + CSS): `(min-width: 900px), (orientation: landscape) and (max-height: 560px) and (min-width: 640px)` — il vincolo di larghezza impedisce a un telefono in portrait con la tastiera aperta (~375×370) di entrare nella composizione landscape
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

- **End-to-end**: a game over il best locale viene scritto subito (`neotetris.best`), poi il form nome (precompilato con `neotetris.player` e normalizzato con `normalizeName`) invia `POST /api/scores` con la chiave idempotente della run; in caso di successo la riga creata viene salvata in locale, si chiede `GET /api/scores?limit=50` per calcolare il rank, il form diventa la conferma read-only e la modale rankings si apre da sola con la riga evidenziata
- **Zero-score**: una run che finisce a 0 non è una run da salvare — `shouldOfferSave` (`leaderboard.js`) blocca form, POST, `saveLocalScore`, `saveBest`, badge `NEW RECORD` e apertura automatica della modale; al loro posto il blocco read-only `NO SCORE TO SAVE` / `PLAY AGAIN TO GET ON THE BOARD` e restano solo `RANKINGS` / `REBOOT`. Il server resta permissivo (`score >= 0`) per compatibilità API: la regola è una scelta di prodotto lato client
- **Offline**: se il POST fallisce (rete, timeout, 429, 400) la run resta in `neotetris.scores` con id `local-…`; la UI mostra `SAVED LOCALLY` e `RETRY` rispedisce al server **con la stessa chiave e lo stesso nome** (una POST andata in timeout dopo l'insert torna 200 con la riga esistente), sostituendo la copia provvisoria. Il campo nome resta bloccato: nessun rename dopo il primo tentativo
- **Board unico**: quando `GET /api/scores` risponde la modale mostra **solo** le righe del server (`fetchScores(10)`, cache tale e quale): niente merge con le run locali, quindi due dispositivi vedono la stessa classifica e "batti il record di qualcun altro" è vero. Le run locali compaiono solo nel ramo offline/errore, con badge `LOCAL`
- **Modale**: Top 10 dal server, badge `SERVER`/`LOCAL`, skeleton, stati vuoto/errore, RETRY/REFRESH; se il server non risponde si usa `fetchHealth()` per distinguere "offline" da "server in errore"
- **Rank coerente**: `rankOf(created, remote)` dopo il salvataggio (board condiviso); `rankOf(created, loadLocalScores())` solo se la GET del rank fallisce
- **Nome bloccato**: il primo `handleSubmit` imposta `attempted` + `lockedNameRef` → input `disabled` + `readOnly` per il resto della run (successo **o** errore), `RETRY` rimanda lo stesso nome e la stessa chiave; `document.activeElement.blur()` all'invio chiude la tastiera iOS e `enterKeyHint="send"` sull'input
- **Cache**: board merged in memoria per 30s (`CACHE_TTL_MS`), invalidata dopo un salvataggio e dai pulsanti di refresh
- **Accessibilità**: `role="dialog"` + `aria-modal`, focus iniziale su CLOSE, Tab trap, Esc/backdrop per chiudere, focus restituito all'elemento che l'ha aperta; apertura in partita → `TOGGLE_PAUSE`
- **Storage**: `neotetris.player` (nome), `neotetris.best` (record), `neotetris.scores` (max 20 run, ordinate); ogni accesso in `try/catch`, JSON corrotto ignorato; il mute resta in `neotetris.muted`
- **Rete**: proxy Vite solo in dev, stessa origine in produzione, `VITE_API_URL` come override; timeout 5s in lettura / 10s in scrittura e righe validate lato client

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
