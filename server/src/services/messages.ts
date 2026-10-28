import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { Message, type ReactionEmoji } from '../models/Message.js';
import { emitToConversation } from '../socket/emitter.js';
import type { AuthUser, MessageDTO } from '../types/dto.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { isObjectId } from '../utils/validation.js';
import { findAccessibleConversation } from './conversations.js';
import { MESSAGE_POPULATE, type MessageLike, toMessageDTO } from './mappers.js';

type PopulatedFields = Pick<MessageLike, 'sender' | 'replyTo' | 'reactions'>;

/** Loads a message as the DTO clients receive (sender, reply preview and reactions resolved). */
async function messageDTO(id: Types.ObjectId | string): Promise<MessageDTO> {
  const message = await Message.findById(id).populate<PopulatedFields>(MESSAGE_POPULATE).lean();
  if (!message) throw notFound('Message not found');
  return toMessageDTO(message);
}

/** A message the user can see (its conversation is accessible), or 404. */
async function findAccessibleMessage(messageId: string, user: AuthUser) {
  if (!isObjectId(messageId)) throw notFound('Message not found');
  const message = await Message.findById(messageId);
  if (!message) throw notFound('Message not found');
  await findAccessibleConversation(message.conversation.toString(), user);
  return message;
}

/**
 * Persists a message and broadcasts it to everyone in the conversation.
 * Shared by the REST endpoint and the Socket.IO "message:send" handler.
 */
export async function sendMessage(
  conversationId: string,
  sender: AuthUser,
  body: string,
  replyToId?: string,
): Promise<MessageDTO> {
  const conversation = await findAccessibleConversation(conversationId, sender);

  if (replyToId) {
    const target = isObjectId(replyToId) && (await Message.exists({ _id: replyToId, conversation: conversation._id }));
    if (!target) throw badRequest('The message you replied to no longer exists');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: sender.id,
    body,
    replyTo: replyToId ?? null,
  });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessageAt: message.createdAt } });

  const dto = await messageDTO(message._id);
  emitToConversation(conversationId, 'message:new', dto);
  return dto;
}

/** Senders can change the text of their own messages; everyone sees the update live. */
export async function editMessage(messageId: string, user: AuthUser, body: string): Promise<MessageDTO> {
  const message = await findAccessibleMessage(messageId, user);
  if (!message.sender.equals(user.id)) throw forbidden('You can only edit your own messages');
  if (message.deletedAt) throw badRequest('This message was removed');

  if (message.body !== body) {
    message.body = body;
    message.editedAt = new Date();
    await message.save();
  }

  const dto = await messageDTO(message._id);
  emitToConversation(dto.conversationId, 'message:updated', dto);
  return dto;
}

/**
 * Each user has at most one reaction per message: picking an emoji replaces
 * their current one, and picking the same emoji again removes it.
 */
export async function toggleReaction(messageId: string, user: AuthUser, emoji: ReactionEmoji): Promise<MessageDTO> {
  const message = await findAccessibleMessage(messageId, user);
  if (message.deletedAt) throw badRequest("You can't react to a removed message");

  const userId = new Types.ObjectId(user.id);
  const current = { $ifNull: ['$reactions', []] };
  // A single pipeline update, so concurrent clicks can never leave a user with two reactions.
  await Message.updateOne({ _id: message._id }, [
    {
      $set: {
        reactions: {
          $let: {
            vars: {
              others: { $filter: { input: current, cond: { $ne: ['$$this.user', userId] } } },
              mine: { $filter: { input: current, cond: { $eq: ['$$this.user', userId] } } },
            },
            in: {
              $cond: [
                { $in: [emoji, '$$mine.emoji'] },
                '$$others',
                { $concatArrays: ['$$others', [{ emoji, user: userId }]] },
              ],
            },
          },
        },
      },
    },
  ], { updatePipeline: true });

  const dto = await messageDTO(message._id);
  emitToConversation(dto.conversationId, 'message:updated', dto);
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
    .populate<PopulatedFields>(MESSAGE_POPULATE)
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
    { $set: { deletedAt: new Date(), body: '', reactions: [] } },
  );
  if (!message) throw notFound('Message not found');
  emitToConversation(message.conversation.toString(), 'message:deleted', {
    conversationId: message.conversation.toString(),
    messageId,
  });
}
