import { type Request, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { isTest } from '../config/env.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { VISIBILITY_SCOPES } from '../models/Nearby.js';
import {
  getNearbyMe,
  joinNearby,
  leaveNearby,
  listNearbyMessages,
  listNearbyPeople,
  postNearbyMessage,
  removeNearbyMessage,
  updateLocation,
  updateNearbySettings,
} from '../services/nearby.js';
import { messageBodySchema } from '../utils/validation.js';

/** Every route here is mounted behind requireAuth. */
const router = Router();

const perUser = (limit: number, windowMs: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req: Request) => req.user?.id ?? 'anonymous',
    skip: () => isTest,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
  });

const locationLimiter = perUser(30, 60_000, 'Too many location updates');
const messageLimiter = perUser(20, 10_000, 'You are sending messages too quickly – slow down a little');

const aliasSchema = z
  .string()
  .trim()
  .max(30, 'Aliases are limited to 30 characters')
  .regex(/^[\p{L}\p{N} _.'-]*$/u, 'Aliases may only contain letters, numbers, spaces and . _ \' -')
  .transform((alias) => alias || null);

const visibilitySchema = z.enum(VISIBILITY_SCOPES, { error: 'Unknown visibility option' });

const joinSchema = z.object({
  /** Explicit consent is required to join; the client sends it from the consent screen. */
  consent: z.literal(true, { error: 'Please agree to share your location to join' }),
  alias: aliasSchema.optional(),
  visibility: visibilitySchema.default('hidden'),
});

const settingsSchema = z
  .object({ alias: aliasSchema.optional(), visibility: visibilitySchema.optional() })
  .refine((s) => s.alias !== undefined || s.visibility !== undefined, 'Nothing to update');

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  simulated: z.boolean().optional(),
});

router.get('/me', async (req, res) => {
  res.json({ me: await getNearbyMe(currentUser(req)) });
});

router.post('/join', async (req, res) => {
  const { alias, visibility } = joinSchema.parse(req.body);
  res.json({ me: await joinNearby(currentUser(req), { alias: alias ?? null, visibility }) });
});

router.patch('/settings', async (req, res) => {
  res.json({ me: await updateNearbySettings(currentUser(req), settingsSchema.parse(req.body)) });
});

router.post('/leave', async (req, res) => {
  await leaveNearby(currentUser(req).id);
  res.status(204).end();
});

router.put('/location', locationLimiter, async (req, res) => {
  res.json({ me: await updateLocation(currentUser(req), locationSchema.parse(req.body)) });
});

router.get('/people', async (req, res) => {
  res.json(await listNearbyPeople(currentUser(req)));
});

router.get('/messages', async (req, res) => {
  res.json({ messages: await listNearbyMessages(currentUser(req)) });
});

router.post('/messages', messageLimiter, async (req, res) => {
  const { body } = z.object({ body: messageBodySchema }).parse(req.body);
  res.status(201).json({ message: await postNearbyMessage(currentUser(req), body) });
});

router.delete('/messages/:id', requireRole('admin'), async (req, res) => {
  await removeNearbyMessage(req.params.id);
  res.status(204).end();
});

export default router;
