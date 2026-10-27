import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { removeMessage } from '../services/messages.js';

const router = Router();

/** Admin moderation: remove a message from any conversation. */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await removeMessage(req.params.id);
  res.status(204).end();
});

export default router;
