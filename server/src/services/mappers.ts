import type { Types } from 'mongoose';
import type { ConversationType } from '../models/Conversation.js';
import type { Role } from '../models/User.js';
import { isOnline } from '../socket/presence.js';
import type {
  AccountDTO,
  AuthUser,
  ConversationDTO,
  MessageDTO,
  PublicUserDTO,
} from '../types/dto.js';

/** Shapes accepted by the mappers – satisfied by both hydrated and lean documents. */
interface UserLike {
  _id: Types.ObjectId;
  username: string;
  role: Role;
  lastSeen?: Date | null;
}

interface AccountLike extends UserLike {
  email: string;
  isBanned: boolean;
  createdAt: Date;
}

export interface MessageLike {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: UserLike | null;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface ConversationLike {
  _id: Types.ObjectId;
  type: ConversationType;
  name: string | null;
  description: string;
  participants: UserLike[];
  lastMessageAt: Date | null;
  createdAt: Date;
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export function toAuthUser(user: UserLike): AuthUser {
  return { id: user._id.toString(), username: user.username, role: user.role };
}

export function toPublicUser(user: UserLike): PublicUserDTO {
  const id = user._id.toString();
  return { id, username: user.username, role: user.role, online: isOnline(id), lastSeen: iso(user.lastSeen) };
}

export function toAccount(user: AccountLike): AccountDTO {
  return {
    ...toPublicUser(user),
    email: user.email,
    isBanned: user.isBanned,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toMessageDTO(message: MessageLike): MessageDTO {
  const sender = message.sender
    ? { id: message.sender._id.toString(), username: message.sender.username, role: message.sender.role }
    : { id: '', username: 'unknown', role: 'user' as const };
  return {
    id: message._id.toString(),
    conversationId: message.conversation.toString(),
    sender,
    body: message.deletedAt ? '' : message.body,
    createdAt: message.createdAt.toISOString(),
    deletedAt: iso(message.deletedAt),
  };
}

export function toConversationDTO(
  conversation: ConversationLike,
  extra: { lastMessage?: MessageDTO | null; unreadCount?: number } = {},
): ConversationDTO {
  return {
    id: conversation._id.toString(),
    type: conversation.type,
    name: conversation.name,
    description: conversation.description,
    participants: conversation.participants.map(toPublicUser),
    lastMessage: extra.lastMessage ?? null,
    lastMessageAt: iso(conversation.lastMessageAt),
    unreadCount: extra.unreadCount ?? 0,
    createdAt: conversation.createdAt.toISOString(),
  };
}
