import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { PASSWORD, signUp } from './helpers.js';

// Stand-in for Google: the "credential" is a JSON payload, or "bad" for an invalid token.
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
      if (idToken === 'bad' || audience !== 'test-client-id.apps.googleusercontent.com') throw new Error('invalid');
      const payload = JSON.parse(idToken);
      return { getPayload: () => payload };
    }
  },
}));

const app = createApp();
const credential = (payload: Record<string, unknown>) =>
  JSON.stringify({ sub: 'google-123', email: 'jane.doe@gmail.com', email_verified: true, name: 'Jane', ...payload });

describe('Sign in with Google', () => {
  it('exposes the client id to the frontend', async () => {
    const res = await request(app).get('/api/auth/config').expect(200);
    expect(res.body.googleClientId).toBe('test-client-id.apps.googleusercontent.com');
  });

  it('creates an account on first sign-in and starts a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/google').send({ credential: credential({}) }).expect(201);
    expect(res.body).toMatchObject({ created: true, user: { username: 'jane.doe', email: 'jane.doe@gmail.com' } });
    await agent.get('/api/auth/me').expect(200);

    // Second sign-in finds the same account.
    const again = await request(app).post('/api/auth/google').send({ credential: credential({}) }).expect(200);
    expect(again.body.user.id).toBe(res.body.user.id);
  });

  it('links Google to an existing account with the same email', async () => {
    const { user } = await signUp(app, 'alice');
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: credential({ sub: 'google-alice', email: 'Alice@example.com' }) })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect((await User.findById(user.id))?.googleId).toBe('google-alice');
    // The password still works too.
    await request(app).post('/api/auth/login').send({ login: 'alice', password: PASSWORD }).expect(200);
  });

  it('picks a free username when the email prefix is taken', async () => {
    await signUp(app, 'jane.doe');
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: credential({ email: 'jane.doe@gmail.com', sub: 'google-other' }) })
      .expect(201);
    expect(res.body.user.username).toMatch(/^jane\.doe\d{4}$/);
  });

  it('rejects invalid tokens and unverified emails', async () => {
    await request(app).post('/api/auth/google').send({ credential: 'bad' }).expect(401);
    await request(app).post('/api/auth/google').send({ credential: credential({ email_verified: false }) }).expect(400);
    await request(app).post('/api/auth/google').send({}).expect(400);
  });

  it('refuses banned users', async () => {
    await request(app).post('/api/auth/google').send({ credential: credential({}) }).expect(201);
    await User.updateOne({ googleId: 'google-123' }, { isBanned: true });
    await request(app).post('/api/auth/google').send({ credential: credential({}) }).expect(403);
  });

  it("Google-only accounts can't sign in with a password until they set one", async () => {
    await request(app).post('/api/auth/google').send({ credential: credential({}) }).expect(201);
    await request(app).post('/api/auth/login').send({ login: 'jane.doe', password: 'anything-at-all' }).expect(401);
  });
});
