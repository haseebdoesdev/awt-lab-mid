import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { User } from '../models/User.js';
import { disconnectUser, emitToUser } from '../socket/emitter.js';
import { badRequest } from '../utils/httpError.js';
import { sendMail } from './mailer.js';
import { revokeAllSessions } from './tokens.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Emails a reset link if an active account uses this address. Callers always
 * report success so the response never reveals whether an account exists.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email, isBanned: false });
  if (!user) return;

  // Only the newest link is valid.
  await PasswordReset.deleteMany({ user: user._id });
  const token = randomBytes(32).toString('base64url');
  await PasswordReset.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
  });

  const link = `${env.APP_URL}/reset-password?token=${token}`;
  const minutes = env.PASSWORD_RESET_TTL_MINUTES;
  await sendMail({
    to: user.email,
    subject: 'Reset your Pulse Chat password',
    text:
      `Hi ${user.username},\n\nSomeone asked to reset the password for your Pulse Chat account.\n` +
      `Open this link to choose a new one (it expires in ${minutes} minutes):\n\n${link}\n\n` +
      `If it wasn't you, ignore this email – your password stays the same.`,
    html:
      `<p>Hi ${user.username},</p><p>Someone asked to reset the password for your Pulse Chat account.</p>` +
      `<p><a href="${link}">Choose a new password</a> (the link expires in ${minutes} minutes).</p>` +
      `<p>If it wasn't you, ignore this email – your password stays the same.</p>`,
  });
}

/** Sets a new password from a valid token, then signs the user out everywhere. */
export async function resetPassword(token: string, password: string): Promise<void> {
  // findOneAndDelete makes the token single-use, even under concurrent requests.
  const reset = await PasswordReset.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!reset) throw badRequest('This reset link is invalid or has expired. Request a new one.');

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await User.findOneAndUpdate({ _id: reset.user, isBanned: false }, { $set: { passwordHash } });
  if (!user) throw badRequest('This reset link is invalid or has expired. Request a new one.');

  const userId = user._id.toString();
  await revokeAllSessions(userId);
  emitToUser(userId, 'session:revoked', { reason: 'Your password was changed. Please sign in again.' });
  disconnectUser(userId);
}
