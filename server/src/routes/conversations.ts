import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import {
  conversationDTO,
  createRoom,
  deleteConversation,
  findAccessibleConversation,
  getOrCreateDirectMessage,
  listConversations,
} from '../services/conversations.js';
import { listMessages, sendMessage } from '../services/messages.js';
import { listReceipts, markRead } from '../services/reads.js';
import { closeConversation, emitToAll, emitToConversation, emitToUser, joinConversation } from '../socket/emitter.js';
import { badRequest } from '../utils/httpError.js';
import { messageBodySchema, objectIdSchema } from '../utils/validation.js';

const router = Router();

const roomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Room name must be at least 2 characters')
    .max(40, 'Room name must be at most 40 characters')
    .regex(/^[a-z0-9][a-z0-9-]*$/i, 'Room names may only contain letters, numbers and "-"')
    .transform((name) => name.toLowerCase()),
  description: z.string().trim().max(200).default(''),
});

const dmSchema = z.object({ userId: objectIdSchema });

const sendSchema = z.object({ body: messageBodySchema, replyToId: objectIdSchema.optional() });

const historySchema = z.object({
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get('/', async (req, res) => {
  res.json({ conversations: await listConversations(currentUser(req)) });
});

router.post('/rooms', requireRole('admin'), async (req, res) => {
  const input = roomSchema.parse(req.body);
  const room = await createRoom(input, currentUser(req));
  const dto = await conversationDTO(room._id);

  // Rooms are public: subscribe every connected socket and announce it.
  joinConversation(dto.id);
  emitToAll('conversation:new', dto);
  res.status(201).json({ conversation: dto });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, currentUser(req));
  if (conversation.type !== 'room') throw badRequest('Only rooms can be deleted');

  await deleteConversation(conversation);
  emitToConversation(conversation.id, 'conversation:deleted', { conversationId: conversation.id });
  closeConversation(conversation.id);
  res.status(204).end();
});

router.post('/dm', async (req, res) => {
  const me = currentUser(req);
  const { userId } = dmSchema.parse(req.body);
  const { conversation, created } = await getOrCreateDirectMessage(me, userId);
  const dto = await conversationDTO(conversation._id);

  if (created) {
    joinConversation(dto.id, [me.id, userId]);
    emitToUser(userId, 'conversation:new', dto);
    emitToUser(me.id, 'conversation:new', dto);
  }
  res.status(created ? 201 : 200).json({ conversation: dto });
});

router.get('/:id/messages', async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, currentUser(req));
  const options = historySchema.parse(req.query);
  res.json(await listMessages(conversation._id, options));
});

router.post('/:id/messages', async (req, res) => {
  const { body, replyToId } = sendSchema.parse(req.body);
  const message = await sendMessage(req.params.id, currentUser(req), body, replyToId);
  res.status(201).json({ message });
});

router.post('/:id/read', async (req, res) => {
  res.json({ receipt: await markRead(req.params.id, currentUser(req)) });
});

router.get('/:id/receipts', async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, currentUser(req));
  res.json({ receipts: await listReceipts(conversation._id) });
});

export default router;
