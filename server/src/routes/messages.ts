import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { editMessage, removeMessage, toggleReaction } from '../services/messages.js';
import { messageBodySchema, reactionSchema } from '../utils/validation.js';

const router = Router();

/** The sender edits their message. */
router.patch('/:id', async (req, res) => {
  const { body } = z.object({ body: messageBodySchema }).parse(req.body);
  res.json({ message: await editMessage(req.params.id, currentUser(req), body) });
});

/** Toggles the current user's reaction. */
router.post('/:id/reactions', async (req, res) => {
  const { emoji } = z.object({ emoji: reactionSchema }).parse(req.body);
  res.json({ message: await toggleReaction(req.params.id, currentUser(req), emoji) });
});

/** Admin moderation: remove a message from any conversation. */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await removeMessage(req.params.id);
  res.status(204).end();
});

export default router;
