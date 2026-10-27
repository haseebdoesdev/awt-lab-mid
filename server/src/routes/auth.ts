import bcrypt from 'bcryptjs';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { User, type UserDoc, usernameCollation } from '../models/User.js';
import { toAccount, toAuthUser } from '../services/mappers.js';
import { requestPasswordReset, resetPassword } from '../services/passwordReset.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  setAuthCookies,
} from '../services/tokens.js';
import { conflict, forbidden, unauthorized } from '../utils/httpError.js';

const router = Router();

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, ".", "_" and "-"'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: passwordSchema,
});

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
});

const resetSchema = z.object({
  token: z.string().min(1, 'Missing reset token'),
  password: passwordSchema,
});

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Enter your password'),
});

// Compared against when the user does not exist, so response times don't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', 4);

async function startSession(req: Request, res: Response, user: UserDoc) {
  const refreshToken = await createSession(user.id, req.get('user-agent'));
  setAuthCookies(res, toAuthUser(user), refreshToken);
}

router.post('/register', authLimiter, async (req, res) => {
  const { username, email, password } = registerSchema.parse(req.body);

  const [emailTaken, usernameTaken] = await Promise.all([
    User.exists({ email }),
    User.exists({ username }).collation(usernameCollation),
  ]);
  if (emailTaken) throw conflict('An account with that email already exists');
  if (usernameTaken) throw conflict('That username is already taken');

  const user = await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
  });

  await startSession(req, res, user);
  res.status(201).json({ user: toAccount(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { login, password } = loginSchema.parse(req.body);

  const query = login.includes('@')
    ? User.findOne({ email: login.toLowerCase() })
    : User.findOne({ username: login }).collation(usernameCollation);
  const user = await query.select('+passwordHash');

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized('Invalid email/username or password');
  if (user.isBanned) throw forbidden('This account has been banned');

  await startSession(req, res, user);
  res.json({ user: toAccount(user) });
});

/** Exchanges the refresh cookie for a new access token and a rotated refresh token. */
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw unauthorized('No active session');

  const rotated = await rotateSession(token);
  if (!rotated) {
    clearAuthCookies(res);
    throw unauthorized('Your session has expired, please sign in again');
  }

  const user = await User.findById(rotated.userId);
  if (!user || user.isBanned) {
    await revokeAllSessions(rotated.userId);
    clearAuthCookies(res);
    throw unauthorized('Your session is no longer valid');
  }

  setAuthCookies(res, toAuthUser(user), rotated.token);
  res.json({ user: toAccount(user) });
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) await revokeSession(token);
  clearAuthCookies(res);
  res.status(204).end();
});

router.post('/forgot-password', authLimiter, (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  // Not awaited: the response time must not reveal whether the account exists.
  requestPasswordReset(email).catch((error) => console.error('Password reset email failed:', error));
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  await resetPassword(token, password);
  clearAuthCookies(res);
  res.json({ message: 'Your password has been changed. You can now sign in.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(currentUser(req).id);
  if (!user) throw unauthorized();
  res.json({ user: toAccount(user) });
});

export default router;
