import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from './events.js';
import { conversationRoom, userRoom } from './events.js';

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Holds the Socket.IO server so REST handlers can push real-time updates.
 * When no server is attached (e.g. REST-only tests) every call is a no-op.
 */
let io: ChatServer | null = null;

export function attachIO(server: ChatServer | null): void {
  io = server;
}

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>;

export function emitToConversation<E extends keyof ServerToClientEvents>(
  conversationId: string,
  event: E,
  ...args: EventArgs<E>
): void {
  io?.to(conversationRoom(conversationId)).emit(event, ...args);
}

export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: EventArgs<E>
): void {
  io?.to(userRoom(userId)).emit(event, ...args);
}

export function emitToAll<E extends keyof ServerToClientEvents>(event: E, ...args: EventArgs<E>): void {
  io?.emit(event, ...args);
}

/** Subscribes every socket of the given users (or everyone) to a conversation's room. */
export function joinConversation(conversationId: string, userIds?: string[]): void {
  if (!io) return;
  const room = conversationRoom(conversationId);
  if (!userIds) io.socketsJoin(room);
  else io.in(userIds.map(userRoom)).socketsJoin(room);
}

export function closeConversation(conversationId: string): void {
  io?.in(conversationRoom(conversationId)).socketsLeave(conversationRoom(conversationId));
}

export function disconnectUser(userId: string): void {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
