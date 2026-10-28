import type { Types } from 'mongoose';
import type { ConversationType } from '../models/Conversation.js';
import { REACTION_EMOJIS, type ReactionEmoji } from '../models/Message.js';
import type { Role } from '../models/User.js';
import { isOnline } from '../socket/presence.js';
import type {
  AccountDTO,
  AuthUser,
  ConversationDTO,
  MessageDTO,
  PublicUserDTO,
  ReactionDTO,
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

interface NamedUserLike {
  _id: Types.ObjectId;
  username: string;
}

/**
 * A message with `sender`, `replyTo` (+ its sender) and `reactions.user` populated – see MESSAGE_POPULATE.
 * replyTo / reactions / editedAt are optional: lean queries don't apply schema defaults, and messages
 * stored before those fields existed don't have them.
 */
export interface MessageLike {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: UserLike | null;
  body: string;
  replyTo?: {
    _id: Types.ObjectId;
    sender: NamedUserLike | null;
    body: string;
    deletedAt?: Date | null;
  } | null;
  reactions?: { emoji: ReactionEmoji; user: NamedUserLike | null }[];
  createdAt: Date;
  editedAt?: Date | null;
  deletedAt: Date | null;
}

/** Populate options that turn a Message document into a MessageLike. */
export const MESSAGE_POPULATE = [
  { path: 'sender', select: 'username role' },
  { path: 'reactions.user', select: 'username' },
  { path: 'replyTo', select: 'sender body deletedAt', populate: { path: 'sender', select: 'username' } },
];

const REPLY_PREVIEW_LENGTH = 140;
const unknownUser = { id: '', username: 'unknown' };
const named = (user: NamedUserLike | null) =>
  user ? { id: user._id.toString(), username: user.username } : unknownUser;

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
  const reply = message.replyTo;
  return {
    id: message._id.toString(),
    conversationId: message.conversation.toString(),
    sender,
    body: message.deletedAt ? '' : message.body,
    replyTo: reply
      ? {
          id: reply._id.toString(),
          sender: named(reply.sender),
          body: reply.deletedAt ? '' : reply.body.slice(0, REPLY_PREVIEW_LENGTH),
          deletedAt: iso(reply.deletedAt),
        }
      : null,
    reactions: message.deletedAt ? [] : groupReactions(message.reactions ?? []),
    createdAt: message.createdAt.toISOString(),
    editedAt: iso(message.editedAt),
    deletedAt: iso(message.deletedAt),
  };
}

function groupReactions(reactions: NonNullable<MessageLike['reactions']>): ReactionDTO[] {
  return REACTION_EMOJIS.flatMap((emoji) => {
    const users = reactions.filter((r) => r.emoji === emoji && r.user).map((r) => named(r.user));
    return users.length ? [{ emoji, users }] : [];
  });
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
