import { Types } from 'mongoose';
import { Conversation, type ConversationDoc } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ReadState } from '../models/ReadState.js';
import { User } from '../models/User.js';
import type { AuthUser, ConversationDTO, MessageDTO } from '../types/dto.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { isObjectId } from '../utils/validation.js';
import {
  type ConversationLike,
  MESSAGE_POPULATE,
  type MessageLike,
  toConversationDTO,
  toMessageDTO,
} from './mappers.js';

const PARTICIPANT_FIELDS = 'username role lastSeen';

/** Loads a conversation the user may read and write in, or throws 404. */
export async function findAccessibleConversation(id: string, user: AuthUser): Promise<ConversationDoc> {
  if (!isObjectId(id)) throw notFound('Conversation not found');
  const conversation = await Conversation.findById(id);
  const allowed =
    conversation?.type === 'room' || conversation?.participants.some((p) => p.equals(user.id));
  // DMs the user is not part of are reported as missing so their existence is not leaked.
  if (!conversation || !allowed) throw notFound('Conversation not found');
  return conversation;
}

/** Ids of every conversation a user can see: all rooms plus their own DMs. */
export async function accessibleConversationIds(userId: string): Promise<string[]> {
  const conversations = await Conversation.find(
    { $or: [{ type: 'room' }, { type: 'dm', participants: new Types.ObjectId(userId) }] },
    { _id: 1 },
  ).lean();
  return conversations.map((c) => c._id.toString());
}

/** Rooms (alphabetical) and DMs (most recent first) with last message and unread count. */
export async function listConversations(user: AuthUser): Promise<ConversationDTO[]> {
  const viewerId = new Types.ObjectId(user.id);
  const [viewer, conversations] = await Promise.all([
    User.findById(viewerId, { createdAt: 1 }).lean(),
    Conversation.find({ $or: [{ type: 'room' }, { type: 'dm', participants: viewerId }] })
      .populate<Pick<ConversationLike, 'participants'>>('participants', PARTICIPANT_FIELDS)
      .lean(),
  ]);
  if (conversations.length === 0) return [];

  const ids = conversations.map((c) => c._id);

  // Last message per conversation.
  const latest = await Message.aggregate<{ _id: Types.ObjectId; messageId: Types.ObjectId }>([
    { $match: { conversation: { $in: ids } } },
    { $sort: { conversation: 1, _id: -1 } },
    { $group: { _id: '$conversation', messageId: { $first: '$_id' } } },
  ]);
  const lastMessages = await Message.find({ _id: { $in: latest.map((l) => l.messageId) } })
    .populate<Pick<MessageLike, 'sender' | 'replyTo' | 'reactions'>>(MESSAGE_POPULATE)
    .lean();
  const lastMessageByConversation = new Map<string, MessageDTO>(
    lastMessages.map((m) => [m.conversation.toString(), toMessageDTO(m)]),
  );

  // Unread = messages from others newer than the user's read marker. Without a
  // marker, only messages sent after the user signed up count as unread.
  const readStates = await ReadState.find({ user: viewerId, conversation: { $in: ids } }).lean();
  const lastReadAt = new Map(readStates.map((r) => [r.conversation.toString(), r.lastReadAt]));
  const defaultSince = viewer?.createdAt ?? new Date(0);
  const unread = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        sender: { $ne: viewerId },
        deletedAt: null,
        $or: ids.map((id) => ({
          conversation: id,
          createdAt: { $gt: lastReadAt.get(id.toString()) ?? defaultSince },
        })),
      },
    },
    { $group: { _id: '$conversation', count: { $sum: 1 } } },
  ]);
  const unreadByConversation = new Map(unread.map((u) => [u._id.toString(), u.count]));

  const dtos = conversations.map((c) =>
    toConversationDTO(c, {
      lastMessage: lastMessageByConversation.get(c._id.toString()) ?? null,
      unreadCount: unreadByConversation.get(c._id.toString()) ?? 0,
    }),
  );

  const rooms = dtos.filter((c) => c.type === 'room').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const dms = dtos
    .filter((c) => c.type === 'dm')
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  return [...rooms, ...dms];
}

/** Builds the DTO for a single conversation (used for real-time "conversation:new" events). */
export async function conversationDTO(id: Types.ObjectId | string): Promise<ConversationDTO> {
  const conversation = await Conversation.findById(id)
    .populate<Pick<ConversationLike, 'participants'>>('participants', PARTICIPANT_FIELDS)
    .lean();
  if (!conversation) throw notFound('Conversation not found');
  return toConversationDTO(conversation);
}

export async function createRoom(input: { name: string; description: string }, creator: AuthUser) {
  return Conversation.create({ type: 'room', ...input, createdBy: creator.id });
}

/** Returns the DM between two users, creating it on first contact. */
export async function getOrCreateDirectMessage(
  user: AuthUser,
  otherUserId: string,
): Promise<{ conversation: ConversationDoc; created: boolean }> {
  if (otherUserId === user.id) throw badRequest("You can't start a conversation with yourself");
  if (!isObjectId(otherUserId) || !(await User.exists({ _id: otherUserId }))) throw notFound('User not found');

  const dmKey = [user.id, otherUserId].sort().join(':');
  const existing = await Conversation.findOne({ type: 'dm', dmKey });
  if (existing) return { conversation: existing, created: false };

  try {
    const conversation = await Conversation.create({
      type: 'dm',
      dmKey,
      participants: [user.id, otherUserId],
      createdBy: user.id,
    });
    return { conversation, created: true };
  } catch (error) {
    // Lost a race with a concurrent request for the same pair.
    if ((error as { code?: number }).code === 11000) {
      const conversation = await Conversation.findOne({ type: 'dm', dmKey });
      if (conversation) return { conversation, created: false };
    }
    throw error;
  }
}

export async function deleteConversation(conversation: ConversationDoc): Promise<void> {
  await Promise.all([
    Message.deleteMany({ conversation: conversation._id }),
    ReadState.deleteMany({ conversation: conversation._id }),
    conversation.deleteOne(),
  ]);
}
