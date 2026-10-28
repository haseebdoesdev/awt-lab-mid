import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';

/** Wires Express and Socket.IO onto one HTTP server (not yet listening). */
export function createServer() {
  const app = createApp();
  const httpServer = createHttpServer(app);
  const io = createSocketServer(httpServer);
  return { app, httpServer, io };
}
