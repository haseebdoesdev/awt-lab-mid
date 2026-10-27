import { type Socket, io } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types';

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Same-origin connection (Vite / nginx proxy /socket.io to the API). The
 * browser sends the httpOnly access-token cookie with the handshake.
 */
export function createSocket(): ChatSocket {
  return io({ withCredentials: true, autoConnect: false });
}
