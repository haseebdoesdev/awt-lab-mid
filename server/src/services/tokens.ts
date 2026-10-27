import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Session } from '../models/Session.js';
import { ROLES, type Role } from '../models/User.js';
import type { AuthUser } from '../types/dto.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

// The refresh cookie is only ever sent to the auth endpoints.
const REFRESH_COOKIE_PATH = '/api/auth';
// How long a just-rotated refresh token keeps working (parallel tabs).
const ROTATION_GRACE_MS = 30_000;

/* ----------------------------- Access tokens ----------------------------- */

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ username: user.username, role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    const { username, role } = payload;
    if (typeof username !== 'string' || !ROLES.includes(role)) return null;
    return { id: payload.sub, username, role: role as Role };
  } catch {
    return null;
  }
}

/* -------------------------- Refresh token sessions ------------------------- */

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const generateToken = () => randomBytes(48).toString('base64url');
const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);

/** Starts a new session and returns its opaque refresh token. */
export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = generateToken();
  await Session.create({
    user: userId,
    tokenHash: hashToken(token),
    expiresAt: refreshExpiry(),
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return token;
}

/**
 * Atomically swaps a valid refresh token for a new one (rotation).
 * Returns null when the token is unknown, expired or past its grace period.
 */
export async function rotateSession(token: string): Promise<{ userId: string; token: string } | null> {
  const presented = hashToken(token);
  const next = generateToken();
  const now = new Date();

  const session = await Session.findOneAndUpdate(
    {
      expiresAt: { $gt: now },
      $or: [
        { tokenHash: presented },
        { prevTokenHash: presented, rotatedAt: { $gt: new Date(now.getTime() - ROTATION_GRACE_MS) } },
      ],
    },
    // Update pipeline so the current hash can be copied into prevTokenHash in one step.
    [
      {
        $set: {
          prevTokenHash: '$tokenHash',
          tokenHash: hashToken(next),
          rotatedAt: '$$NOW',
          expiresAt: refreshExpiry(),
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  );

  return session ? { userId: session.user.toString(), token: next } : null;
}

export async function revokeSession(token: string): Promise<void> {
  const hash = hashToken(token);
  await Session.deleteOne({ $or: [{ tokenHash: hash }, { prevTokenHash: hash }] });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await Session.deleteMany({ user: userId });
}

/* --------------------------------- Cookies -------------------------------- */

const baseCookie = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
});

export function setAuthCookies(res: Response, user: AuthUser, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, signAccessToken(user), {
    ...baseCookie(),
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_COOKIE_PATH });
}
