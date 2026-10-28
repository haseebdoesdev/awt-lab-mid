import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { User, type UserDoc, usernameCollation } from '../models/User.js';
import { HttpError, badRequest, forbidden, unauthorized } from '../utils/httpError.js';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
}

let client: OAuth2Client | null = null;

/**
 * Verifies a Google Identity Services ID token: signature (Google's public
 * keys), issuer, expiry and that it was issued for our client id.
 */
export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(404, 'Google sign-in is not enabled');
  client ??= new OAuth2Client(env.GOOGLE_CLIENT_ID);

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('Google sign-in failed. Please try again.');
  }
  if (!payload?.sub || !payload.email) throw unauthorized('Google sign-in failed. Please try again.');
  if (!payload.email_verified) throw badRequest('Your Google email address is not verified');

  return { googleId: payload.sub, email: payload.email.toLowerCase(), name: payload.name ?? null };
}

/** A free username based on the email's local part, e.g. "jane.doe", "jane.doe2". */
async function availableUsername(email: string): Promise<string> {
  const base = (email.split('@')[0] ?? '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24).padEnd(3, '0');
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    if (!(await User.exists({ username: candidate }).collation(usernameCollation))) return candidate;
  }
  throw new HttpError(500, 'Could not pick a username');
}

/**
 * Finds the account for a Google profile: by Google id, else by verified
 * email (linking the Google account to it), else creates a new account.
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<{ user: UserDoc; created: boolean }> {
  let user = await User.findOne({ googleId: profile.googleId });
  let created = false;

  if (!user) {
    user = await User.findOneAndUpdate(
      { email: profile.email, googleId: null },
      { $set: { googleId: profile.googleId } },
      { returnDocument: 'after' },
    );
  }

  if (!user) {
    user = await User.create({
      username: await availableUsername(profile.email),
      email: profile.email,
      googleId: profile.googleId,
    });
    created = true;
  }

  if (user.isBanned) throw forbidden('This account has been banned');
  return { user, created };
}
