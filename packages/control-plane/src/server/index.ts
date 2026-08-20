import { app } from './app.js';
import { getDb, closeDb } from '../db/index.js';

const PORT = parseInt(process.env.PORT || '3099');

async function start() {
  await getDb();
  const HOST = process.env.HOST || '127.0.0.1';
  const server = app.listen(PORT, HOST, () => {
    console.log(`[control-plane] Server running on http://localhost:${PORT}`);
    console.log(`[control-plane] API: http://localhost:${PORT}/api`);
  });

  process.on('SIGINT', () => { closeDb(); server.close(); process.exit(0); });
  process.on('SIGTERM', () => { closeDb(); server.close(); process.exit(0); });
}

start().catch(err => {
  console.error('[control-plane] Failed to start:', err);
  process.exit(1);
});

export { app };
