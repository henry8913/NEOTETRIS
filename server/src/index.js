/**
 * Server entry point: env → store → app → listen.
 * All the wiring lives here; the app itself is built in `app.js`.
 */

import { createApp } from './app.js';
import { createStore, DEFAULT_MONGO_URI } from './store.js';

const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3001;
const MONGO_URI = process.env.MONGO_URI || DEFAULT_MONGO_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function main() {
  const store = await createStore({ mongoUri: MONGO_URI });
  const app = createApp({ store, corsOrigin: CORS_ORIGIN });

  const server = app.listen(PORT, () => {
    console.log(`[server] NEOTETRIS API listening on http://localhost:${PORT}`);
    console.log(`[server] Store: ${store.getStatus()}`);
  });

  server.on('error', async (err) => {
    console.error(`[server] Failed to start: ${err.message}`);
    await store.close().catch(() => {});
    process.exit(1);
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — shutting down...`);

    // Never hang forever on a stuck socket.
    const force = setTimeout(() => {
      console.error('[server] Shutdown timed out, forcing exit.');
      process.exit(1);
    }, 10_000);
    force.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await store.close();
      clearTimeout(force);
      console.log('[server] Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error(`[server] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`[server] Startup failed: ${err.message}`);
  process.exit(1);
});
