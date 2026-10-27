import type { ConversationType } from '../models/Conversation.js';
import type { Role } from '../models/User.js';

/** Identity carried in the access token and attached to authenticated requests/sockets. */
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

export interface PublicUserDTO {
  id: string;
  username: string;
  role: Role;
  online: boolean;
  lastSeen: string | null;
}

export interface AccountDTO extends PublicUserDTO {
  email: string;
  isBanned: boolean;
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  sender: { id: string; username: string; role: Role };
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationDTO {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string;
  participants: PublicUserDTO[];
  lastMessage: MessageDTO | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface ReadReceiptDTO {
  conversationId: string;
  userId: string;
  username: string;
  lastReadAt: string;
}
