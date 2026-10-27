import { bootstrap } from './bootstrap.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db.js';
import { createServer } from './server.js';

await connectDB(env.MONGO_URI);
await bootstrap();

const { httpServer, io } = createServer();

httpServer.listen(env.PORT, () => {
  console.log(`API and Socket.IO listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully…`);
  // Closes all sockets and the underlying HTTP server.
  await io.close();
  await disconnectDB();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
