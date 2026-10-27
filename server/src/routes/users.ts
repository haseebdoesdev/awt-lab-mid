import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { toPublicUser } from '../services/mappers.js';

const router = Router();

const querySchema = z.object({
  q: z.string().trim().max(30).optional(),
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** People the current user can start a DM with – online users first. */
router.get('/', async (req, res) => {
  const { q } = querySchema.parse(req.query);
  const me = currentUser(req);

  const users = await User.find({
    _id: { $ne: me.id },
    isBanned: false,
    ...(q ? { username: { $regex: escapeRegex(q), $options: 'i' } } : {}),
  })
    .select('username role lastSeen')
    .sort({ username: 1 })
    .limit(100)
    .lean();

  const result = users.map(toPublicUser).sort((a, b) => Number(b.online) - Number(a.online));
  res.json({ users: result });
});

export default router;
