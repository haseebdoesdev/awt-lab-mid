import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { PasswordReset } from '../src/models/PasswordReset.js';
import { Session } from '../src/models/Session.js';
import { User } from '../src/models/User.js';
import { outbox } from '../src/services/mailer.js';
import { PASSWORD, signUp } from './helpers.js';

const app = createApp();
const NEW_PASSWORD = 'a-brand-new-password';

beforeEach(() => {
  outbox.length = 0;
});

/** Requests a reset for `email` and returns the token from the emailed link. */
async function requestToken(email: string): Promise<string> {
  await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
  const mail = await vi.waitFor(() => {
    const found = outbox.find((m) => m.to === email);
    if (!found) throw new Error('no email yet');
    return found;
  });
  const token = /reset-password\?token=([\w-]+)/.exec(mail.text)?.[1];
  if (!token) throw new Error('no token in email');
  return token;
}

describe('forgot password', () => {
  it('emails a reset link to existing accounts', async () => {
    await signUp(app, 'alice');
    const token = await requestToken('alice@example.com');
    expect(outbox[0]).toMatchObject({ to: 'alice@example.com', subject: 'Reset your Pulse Chat password' });
    expect(outbox[0]?.text).toContain(`http://localhost:5173/reset-password?token=${token}`);

    // Only a hash of the token is stored.
    const stored = await PasswordReset.findOne();
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('responds identically for unknown emails and sends nothing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(200);
    expect(res.body.message).toMatch(/If an account exists/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(outbox).toHaveLength(0);
  });

  it('validates the email address', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'nope' }).expect(400);
  });

  it('keeps only the newest link valid', async () => {
    await signUp(app, 'alice');
    const first = await requestToken('alice@example.com');
    outbox.length = 0;
    await requestToken('alice@example.com');
    await request(app).post('/api/auth/reset-password').send({ token: first, password: NEW_PASSWORD }).expect(400);
  });
});

describe('reset password', () => {
  it('sets the new password and signs out every session', async () => {
    const { agent } = await signUp(app, 'alice');
    const token = await requestToken('alice@example.com');

    await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(200);

    expect(await Session.countDocuments()).toBe(0);
    await agent.post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/login').send({ login: 'alice', password: PASSWORD }).expect(401);
    await request(app).post('/api/auth/login').send({ login: 'alice', password: NEW_PASSWORD }).expect(200);
  });

  it('accepts each link only once', async () => {
    await signUp(app, 'alice');
    const token = await requestToken('alice@example.com');
    await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(200);
    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-password' });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid or has expired/);
  });

  it('rejects expired and forged tokens', async () => {
    await signUp(app, 'alice');
    const token = await requestToken('alice@example.com');
    await PasswordReset.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(400);
    await request(app).post('/api/auth/reset-password').send({ token: 'forged', password: NEW_PASSWORD }).expect(400);
  });

  it('validates the new password', async () => {
    await signUp(app, 'alice');
    const token = await requestToken('alice@example.com');
    await request(app).post('/api/auth/reset-password').send({ token, password: 'short' }).expect(400);
  });

  it('does not email banned users', async () => {
    const { user } = await signUp(app, 'mallory');
    await User.updateOne({ _id: user.id }, { isBanned: true });
    await request(app).post('/api/auth/forgot-password').send({ email: 'mallory@example.com' }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(outbox).toHaveLength(0);
  });
});
