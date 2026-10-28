import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createSocketLimiter } from '../middleware/rateLimit.js';
import { User } from '../models/User.js';
import { accessibleConversationIds } from '../services/conversations.js';
import { editMessage, sendMessage, toggleReaction } from '../services/messages.js';
import { markRead } from '../services/reads.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/tokens.js';
import { errorMessage, messageBodySchema, objectIdSchema, reactionSchema } from '../utils/validation.js';
import { type ChatServer, attachIO } from './emitter.js';
import { conversationRoom, userRoom } from './events.js';
import { addConnection, removeConnection } from './presence.js';

const sendSchema = z.object({
  conversationId: objectIdSchema,
  body: messageBodySchema,
  replyToId: objectIdSchema.optional(),
});
const editSchema = z.object({ messageId: objectIdSchema, body: messageBodySchema });
const reactSchema = z.object({ messageId: objectIdSchema, emoji: reactionSchema });
const typingSchema = z.object({ conversationId: objectIdSchema, isTyping: z.boolean() });
const readSchema = z.object({ conversationId: objectIdSchema });

export function createSocketServer(httpServer: HttpServer): ChatServer {
  const io: ChatServer = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN.split(','), credentials: true },
    // Replays missed events to clients that reconnect within two minutes.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  // Handshake authentication: the browser sends the httpOnly access-token cookie.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const authToken = (socket.handshake.auth as { token?: unknown }).token;
      const token = cookies[ACCESS_COOKIE] ?? (typeof authToken === 'string' ? authToken : undefined);
      const claims = token ? verifyAccessToken(token) : null;
      if (!claims) return next(new Error('unauthorized'));

      const user = await User.findById(claims.id, { username: 1, role: 1, isBanned: 1 }).lean();
      if (!user || user.isBanned) return next(new Error('unauthorized'));

      socket.data.user = { id: claims.id, username: user.username, role: user.role };
      socket.data.conversationIds = await accessibleConversationIds(claims.id);
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    const allowMessage = createSocketLimiter(20, 10_000);
    const allowReaction = createSocketLimiter(30, 10_000);

    void socket.join([userRoom(user.id), ...socket.data.conversationIds.map(conversationRoom)]);

    if (addConnection(user.id, socket.id)) {
      io.emit('presence', { userId: user.id, online: true, lastSeen: null });
    }

    socket.on('message:send', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        if (!allowMessage()) {
          ack({ ok: false, error: 'You are sending messages too quickly – slow down a little' });
          return;
        }
        const { conversationId, body, replyToId } = sendSchema.parse(payload);
        ack({ ok: true, data: await sendMessage(conversationId, user, body, replyToId) });
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on('message:edit', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        if (!allowMessage()) {
          ack({ ok: false, error: 'You are editing too quickly – slow down a little' });
          return;
        }
        const { messageId, body } = editSchema.parse(payload);
        ack({ ok: true, data: await editMessage(messageId, user, body) });
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on('message:react', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        if (!allowReaction()) {
          ack({ ok: false, error: 'You are reacting too quickly – slow down a little' });
          return;
        }
        const { messageId, emoji } = reactSchema.parse(payload);
        ack({ ok: true, data: await toggleReaction(messageId, user, emoji) });
      } catch (error) {
        ack({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on('typing', (payload) => {
      const parsed = typingSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = conversationRoom(parsed.data.conversationId);
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing', {
        conversationId: parsed.data.conversationId,
        user: { id: user.id, username: user.username },
        isTyping: parsed.data.isTyping,
      });
    });

    socket.on('conversation:read', async (payload, ack) => {
      try {
        const { conversationId } = readSchema.parse(payload);
        const receipt = await markRead(conversationId, user);
        ack?.({ ok: true, data: receipt });
      } catch (error) {
        ack?.({ ok: false, error: errorMessage(error) });
      }
    });

    socket.on('disconnect', async () => {
      if (!removeConnection(user.id, socket.id)) return;
      const lastSeen = new Date();
      await User.updateOne({ _id: user.id }, { $set: { lastSeen } }).catch(() => undefined);
      io.emit('presence', { userId: user.id, online: false, lastSeen: lastSeen.toISOString() });
    });
  });

  attachIO(io);
  return io;
}
