import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { emitToConversation } from '../socket/emitter.js';
import type { AuthUser, MessageDTO } from '../types/dto.js';
import { notFound } from '../utils/httpError.js';
import { isObjectId } from '../utils/validation.js';
import { findAccessibleConversation } from './conversations.js';
import { type MessageLike, toMessageDTO } from './mappers.js';

/**
 * Persists a message and broadcasts it to everyone in the conversation.
 * Shared by the REST endpoint and the Socket.IO "message:send" handler.
 */
export async function sendMessage(conversationId: string, sender: AuthUser, body: string): Promise<MessageDTO> {
  const conversation = await findAccessibleConversation(conversationId, sender);
  const message = await Message.create({ conversation: conversation._id, sender: sender.id, body });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessageAt: message.createdAt } });

  const dto = toMessageDTO({
    ...message.toObject(),
    sender: { _id: new Types.ObjectId(sender.id), username: sender.username, role: sender.role },
  });
  emitToConversation(conversationId, 'message:new', dto);
  return dto;
}

/** Cursor-paginated history, returned oldest → newest. */
export async function listMessages(
  conversationId: Types.ObjectId,
  options: { before?: string; limit: number },
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const filter = options.before
    ? { conversation: conversationId, _id: { $lt: new Types.ObjectId(options.before) } }
    : { conversation: conversationId };

  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(options.limit + 1)
    .populate<{ sender: MessageLike['sender'] }>('sender', 'username role')
    .lean();

  const hasMore = docs.length > options.limit;
  const messages = docs.slice(0, options.limit).reverse().map(toMessageDTO);
  return { messages, hasMore };
}

/** Moderation: replaces the message with a "removed" placeholder for everyone. */
export async function removeMessage(messageId: string): Promise<void> {
  if (!isObjectId(messageId)) throw notFound('Message not found');
  const message = await Message.findOneAndUpdate(
    { _id: messageId, deletedAt: null },
    { $set: { deletedAt: new Date(), body: '' } },
  );
  if (!message) throw notFound('Message not found');
  emitToConversation(message.conversation.toString(), 'message:deleted', {
    conversationId: message.conversation.toString(),
    messageId,
  });
}
