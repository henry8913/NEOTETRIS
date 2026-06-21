# Progress - NEOTETRIS

## Architettura
- **client/**: React 19 + Vite 8 (JSX, nessun TypeScript)
- **server/**: Express 4 + Mongoose 8 (ESM)
- **Game logic** in `tetris.js` (JS puro, zero dipendenze React)
- **UI state** con `useReducer` in `App.jsx` (nessun Redux/Zustand)
- **Rendering**: componenti inline (`Board`, `Cell`, `NextPiece`); stili in `App.css` + `index.css` (no framework CSS)
- **Backend**: 3 endpoint (`GET /api/health`, `GET /api/scores`, `POST /api/scores`); MongoDB opzionale
- **Leaderboard UI** non ancora collegata all'API

## Convenzioni chiave
- ES modules (`import`/`export`)
- Nessun TypeScript, nessun test framework
- Griglia di gioco: array 2D (`0` = cella vuota, stringa nome pezzo = piena, `'ghost'` = fantasma)
- Stato contiene `nextQueue` (array di 3 tipi di pezzo) — sostituisce il vecchio `nextType` singolo
- Rotazione: 90° CW con rilevamento collisioni (nessun SRS wall kick)

## Progresso implementazione
### Completato
- Creato `AGENTS.md` con struttura, comandi, convenzioni e note critiche
- Identificate 10 aree di miglioramento e discussione con l'utente
- **Implementata coda dei prossimi pezzi (next queue)**:
  - Sostituito `nextType` con `nextQueue` (array di 3 pezzi) in `initialState`, reducer `START` e `lockReduce`
  - `NextPiece` ora cicla su 3 pezzi e li mostra in verticale
  - CSS: aggiunto `.next-queue` (flex column), celle anteprima ridotte da 13px → 11px
  - Lint passa senza errori
- `fillBag` garantisce `bag.length > idx + 7`, quindi gli indici della coda (idx+1, +2, +3) sono sempre sicuri
