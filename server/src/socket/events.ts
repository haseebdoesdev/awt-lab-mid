import type { ReactionEmoji } from '../models/Message.js';
import type { AuthUser, ConversationDTO, MessageDTO, ReadReceiptDTO } from '../types/dto.js';

/**
 * Strongly typed Socket.IO contract. The client keeps a mirror of these
 * types in client/src/types.ts.
 */
export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (response: AckResponse<T>) => void;

export interface TypingPayload {
  conversationId: string;
  user: { id: string; username: string };
  isTyping: boolean;
}

export interface PresencePayload {
  userId: string;
  online: boolean;
  lastSeen: string | null;
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  /** An existing message was edited or its reactions changed. */
  'message:updated': (message: MessageDTO) => void;
  'message:deleted': (payload: { conversationId: string; messageId: string }) => void;
  typing: (payload: TypingPayload) => void;
  presence: (payload: PresencePayload) => void;
  'read:update': (receipt: ReadReceiptDTO) => void;
  'conversation:new': (conversation: ConversationDTO) => void;
  'conversation:deleted': (payload: { conversationId: string }) => void;
  'session:revoked': (payload: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (
    payload: { conversationId: string; body: string; replyToId?: string },
    ack: Ack<MessageDTO>,
  ) => void;
  'message:edit': (payload: { messageId: string; body: string }, ack: Ack<MessageDTO>) => void;
  'message:react': (payload: { messageId: string; emoji: ReactionEmoji }, ack: Ack<MessageDTO>) => void;
  typing: (payload: { conversationId: string; isTyping: boolean }) => void;
  'conversation:read': (payload: { conversationId: string }, ack?: Ack<ReadReceiptDTO>) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  user: AuthUser;
  /** Conversations the socket subscribes to on connect (resolved during the handshake). */
  conversationIds: string[];
}

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conv:${conversationId}`;
