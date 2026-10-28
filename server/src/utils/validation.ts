import { z, ZodError } from 'zod';
import { MAX_MESSAGE_LENGTH, REACTION_EMOJIS } from '../models/Message.js';
import { HttpError } from './httpError.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID.test(value);

export const objectIdSchema = z.string().regex(OBJECT_ID, 'Invalid id');

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(MAX_MESSAGE_LENGTH, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);

export const reactionSchema = z.enum(REACTION_EMOJIS, { error: 'Unsupported reaction' });

/** Human readable message for errors surfaced over Socket.IO acknowledgements. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Invalid input';
  return 'Something went wrong';
}
