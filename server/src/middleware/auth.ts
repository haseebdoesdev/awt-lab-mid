import type { NextFunction, Request, Response } from 'express';
import { type Role, User } from '../models/User.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/tokens.js';
import type { AuthUser } from '../types/dto.js';
import { forbidden, unauthorized } from '../utils/httpError.js';

function readToken(req: Request): string | undefined {
  const cookie = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/**
 * Verifies the JWT access token (httpOnly cookie, or Bearer header for API
 * clients). The user is re-read from the database so bans and role changes
 * take effect immediately rather than when the token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) throw unauthorized();

  const user = await User.findById(claims.id, { username: 1, role: 1, isBanned: 1 }).lean();
  if (!user) throw unauthorized();
  if (user.isBanned) throw forbidden('This account has been banned');

  req.user = { id: claims.id, username: user.username, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  // Generic over route params so it doesn't break Express's param inference.
  return <P>(req: Request<P>, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** The authenticated user; only valid behind `requireAuth`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
