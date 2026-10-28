/**
 * API and Socket.IO contracts. Mirrors server/src/types/dto.ts and
 * server/src/socket/events.ts – keep them in sync.
 */
export type Role = 'user' | 'admin';

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  online: boolean;
  lastSeen: string | null;
}

export interface Account extends PublicUser {
  email: string;
  isBanned: boolean;
  createdAt: string;
}

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Reaction {
  emoji: ReactionEmoji;
  users: { id: string; username: string }[];
}

export interface ReplyPreview {
  id: string;
  sender: { id: string; username: string };
  body: string;
  deletedAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: { id: string; username: string; role: Role };
  body: string;
  replyTo: ReplyPreview | null;
  reactions: Reaction[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface Conversation {
  id: string;
  type: 'room' | 'dm';
  name: string | null;
  description: string;
  participants: PublicUser[];
  lastMessage: Message | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface ReadReceipt {
  conversationId: string;
  userId: string;
  username: string;
  lastReadAt: string;
}

export interface AdminStats {
  users: number;
  admins: number;
  banned: number;
  rooms: number;
  directMessages: number;
  messages: number;
  messagesToday: number;
  online: number;
}

/* ------------------------------ Nearby ------------------------------ */

export type VisibilityScope = 'hidden' | 'approximate' | 'contacts' | 'everyone';

export interface NearbyMe {
  joined: boolean;
  alias: string | null;
  visibility: VisibilityScope;
  displayName: string;
  selfToken: string;
  radiusMeters: number;
  location: { lat: number; lng: number; accuracy: number | null; simulated: boolean; updatedAt: string } | null;
}

export interface NearbyPerson {
  token: string;
  name: string;
  precision: 'exact' | 'approximate';
  lat: number;
  lng: number;
  radiusMeters: number | null;
  distanceMeters: number;
}

export interface NearbyMessage {
  id: string;
  senderToken: string;
  senderName: string;
  body: string;
  createdAt: string;
  /** Only present for admins. */
  sender?: { id: string; username: string };
}

/* ------------------------------ Socket.IO ------------------------------ */

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

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
  'message:new': (message: Message) => void;
  'message:updated': (message: Message) => void;
  'message:deleted': (payload: { conversationId: string; messageId: string }) => void;
  typing: (payload: TypingPayload) => void;
  presence: (payload: PresencePayload) => void;
  'read:update': (receipt: ReadReceipt) => void;
  'conversation:new': (conversation: Conversation) => void;
  'conversation:deleted': (payload: { conversationId: string }) => void;
  'session:revoked': (payload: { reason: string }) => void;
  'nearby:message': (message: NearbyMessage) => void;
  'nearby:message-deleted': (payload: { id: string }) => void;
  'nearby:changed': () => void;
}

export interface ClientToServerEvents {
  'message:send': (
    payload: { conversationId: string; body: string; replyToId?: string },
    ack: (response: AckResponse<Message>) => void,
  ) => void;
  'message:edit': (
    payload: { messageId: string; body: string },
    ack: (response: AckResponse<Message>) => void,
  ) => void;
  'message:react': (
    payload: { messageId: string; emoji: ReactionEmoji },
    ack: (response: AckResponse<Message>) => void,
  ) => void;
  typing: (payload: { conversationId: string; isTyping: boolean }) => void;
  'conversation:read': (
    payload: { conversationId: string },
    ack?: (response: AckResponse<ReadReceipt>) => void,
  ) => void;
}
