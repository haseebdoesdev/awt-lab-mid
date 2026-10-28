import { rateLimit } from 'express-rate-limit';
import { isTest } from '../config/env.js';

/** Brute-force protection for login / registration. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many attempts, please try again in a few minutes' },
});

/**
 * Sliding-window limiter for socket events: allows `limit` calls per
 * `windowMs`. Returns a function that reports whether the call is allowed.
 */
export function createSocketLimiter(limit: number, windowMs: number): () => boolean {
  let timestamps: number[] = [];
  return () => {
    const now = Date.now();
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= limit) return false;
    timestamps.push(now);
    return true;
  };
}
