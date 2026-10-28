import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Session } from '../src/models/Session.js';
import { User } from '../src/models/User.js';
import { PASSWORD, cookiesFrom, signUp } from './helpers.js';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('creates an account and sets httpOnly auth cookies', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'Alice@Example.com', password: PASSWORD })
      .expect(201);

    expect(res.body.user).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'user' });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('access_token='))).toMatch(/HttpOnly/);
    expect(setCookie.find((c) => c.startsWith('refresh_token='))).toMatch(/Path=\/api\/auth/);

    const stored = await User.findOne({ username: 'alice' }).select('+passwordHash');
    expect(stored?.passwordHash).not.toBe(PASSWORD);
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'a', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(['username', 'email', 'password']);
  });

  it('rejects duplicate emails and case-insensitive duplicate usernames', async () => {
    await signUp(app, 'alice');
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'other', email: 'alice@example.com', password: PASSWORD })
      .expect(409);
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'ALICE', email: 'new@example.com', password: PASSWORD })
      .expect(409);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts either email or username', async () => {
    await signUp(app, 'bob');
    await request(app).post('/api/auth/login').send({ login: 'bob@example.com', password: PASSWORD }).expect(200);
    const res = await request(app).post('/api/auth/login').send({ login: 'BoB', password: PASSWORD }).expect(200);
    expect(res.body.user.username).toBe('bob');
  });

  it('rejects wrong credentials without revealing which part was wrong', async () => {
    await signUp(app, 'bob');
    const wrongPassword = await request(app).post('/api/auth/login').send({ login: 'bob', password: 'nope' });
    const unknownUser = await request(app).post('/api/auth/login').send({ login: 'ghost', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownUser.body.error);
  });

  it('refuses banned users', async () => {
    const { user } = await signUp(app, 'mallory');
    await User.updateOne({ _id: user.id }, { isBanned: true });
    await request(app).post('/api/auth/login').send({ login: 'mallory', password: PASSWORD }).expect(403);
  });
});

describe('sessions', () => {
  it('protects /me', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const { agent } = await signUp(app, 'carol');
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.username).toBe('carol');
  });

  it('accepts a Bearer access token as an alternative to cookies', async () => {
    const { cookies } = await signUp(app, 'carol');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${cookies.access_token}`).expect(200);
  });

  it('rotates the refresh token on every refresh', async () => {
    const { agent, cookies } = await signUp(app, 'dave');
    const original = cookies.refresh_token;

    const res = await agent.post('/api/auth/refresh').expect(200);
    const rotated = cookiesFrom(res.headers['set-cookie']).refresh_token;
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(original);

    // The previous token keeps working for a short grace period (parallel tabs)…
    await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${original}`).expect(200);

    // …but an unknown token never does.
    await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=forged').expect(401);
  });

  it('rejects a rotated-out token once the grace period has passed', async () => {
    const { agent, cookies } = await signUp(app, 'erin');
    await agent.post('/api/auth/refresh').expect(200);
    await Session.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${cookies.refresh_token}`).expect(401);
  });

  it('logout revokes the session and clears cookies', async () => {
    const { agent } = await signUp(app, 'frank');
    const res = await agent.post('/api/auth/logout').expect(204);
    expect((res.headers['set-cookie'] as unknown as string[]).join()).toMatch(/refresh_token=;/);
    expect(await Session.countDocuments()).toBe(0);
    await agent.post('/api/auth/refresh').expect(401);
  });
});
