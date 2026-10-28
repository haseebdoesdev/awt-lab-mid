import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ROLES, User } from '../models/User.js';
import { toAccount } from '../services/mappers.js';
import { leaveNearby } from '../services/nearby.js';
import { revokeAllSessions } from '../services/tokens.js';
import { disconnectUser, emitToUser } from '../socket/emitter.js';
import { onlineCount } from '../socket/presence.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { isObjectId } from '../utils/validation.js';

/** Every route in this router is mounted behind requireAuth + requireRole('admin'). */
const router = Router();

const updateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    isBanned: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.isBanned !== undefined, 'Nothing to update');

router.get('/stats', async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [users, admins, banned, rooms, directMessages, messages, messagesToday] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ isBanned: true }),
    Conversation.countDocuments({ type: 'room' }),
    Conversation.countDocuments({ type: 'dm' }),
    Message.countDocuments({ deletedAt: null }),
    Message.countDocuments({ deletedAt: null, createdAt: { $gte: startOfDay } }),
  ]);

  res.json({
    stats: { users, admins, banned, rooms, directMessages, messages, messagesToday, online: onlineCount() },
  });
});

router.get('/users', async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.json({ users: users.map(toAccount) });
});

router.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) throw notFound('User not found');
  if (id === currentUser(req).id) throw badRequest("You can't change your own role or ban yourself");

  const update = updateUserSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after', runValidators: true });
  if (!user) throw notFound('User not found');

  if (update.isBanned) {
    // Kill every session and live connection of the banned user.
    await revokeAllSessions(id);
    await leaveNearby(id);
    emitToUser(id, 'session:revoked', { reason: 'Your account has been banned by an administrator' });
    disconnectUser(id);
  }

  res.json({ user: toAccount(user) });
});

export default router;
