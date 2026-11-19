# NEOTETRIS — single-container production image
#
# One image, one process: Express (`server/src/index.js`) serves BOTH the API
# (`/api/*`) and the SPA build (`client/dist`) from the same origin. There is no
# Vite, no dev server and no reverse proxy inside the image — Nginx Proxy Manager
# on the host terminates TLS and forwards plain HTTP to port 3001.
#
# Because the API and the UI share an origin, `VITE_API_URL` is intentionally NOT
# set at build time: `client/src/api.js` falls back to the empty base (same
# origin) which is exactly what we want here.
#
# The monorepo layout is preserved inside the image because
# `server/src/app.js` resolves the static dir as `<repo>/client/dist`
# (`path.resolve(HERE, '../../client/dist')` with HERE = /app/server/src).

# --- stage 1: build the client ------------------------------------------
FROM node:22-alpine AS client

WORKDIR /app/client

# Dependency layer first: it only busts when the lockfile changes.
COPY client/package.json client/package-lock.json ./
RUN npm ci

# Sources (node_modules / dist are excluded by .dockerignore).
COPY client/ ./

RUN npm run build

# --- stage 2: runtime (API + SPA) ---------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app

# Server dependencies only — no dev tooling in the final image.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/ ./server/

# Vite build from stage 1, in the exact path Express expects.
COPY --from=client /app/client/dist ./client/dist

# Drop root: the app only reads the image contents and writes nothing.
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "server/src/index.js"]
