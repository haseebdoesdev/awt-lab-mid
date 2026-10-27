import { type Socket, io } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types';
import { api } from './api';

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Set when the socket server lives on another domain (e.g. app on Vercel, API on AWS). */
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

export function createSocket(): ChatSocket {
  if (!SOCKET_URL) {
    // Same origin (Vite / nginx proxy /socket.io to the API): the browser
    // sends the httpOnly access-token cookie with the handshake.
    return io({ withCredentials: true, autoConnect: false });
  }

  // Cross-origin: the cookie isn't sent to the socket server, so each
  // (re)connect fetches a short-lived token through the same-origin API.
  return io(SOCKET_URL, {
    autoConnect: false,
    auth: (send) => {
      api.auth.socketToken().then(
        ({ token }) => send({ token }),
        () => send({}),
      );
    },
  });
}
