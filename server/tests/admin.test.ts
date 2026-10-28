import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { PASSWORD, createRoom, signUp } from './helpers.js';

const app = createApp();

describe('admin API', () => {
  it('is forbidden for regular users', async () => {
    const { agent } = await signUp(app, 'alice');
    await agent.get('/api/admin/stats').expect(403);
    await agent.get('/api/admin/users').expect(403);
  });

  it('reports statistics', async () => {
    const room = await createRoom('general');
    const { agent: admin } = await signUp(app, 'root', { admin: true });
    const { agent: alice } = await signUp(app, 'alice');
    await alice.post(`/api/conversations/${room}/messages`).send({ body: 'hello' }).expect(201);

    const res = await admin.get('/api/admin/stats').expect(200);
    expect(res.body.stats).toMatchObject({ users: 2, admins: 1, banned: 0, rooms: 1, messages: 1, messagesToday: 1 });
  });

  it('bans a user, ending their sessions immediately', async () => {
    const { agent: admin } = await signUp(app, 'root', { admin: true });
    const { agent: bob, user: bobUser } = await signUp(app, 'bob');

    const res = await admin.patch(`/api/admin/users/${bobUser.id}`).send({ isBanned: true }).expect(200);
    expect(res.body.user.isBanned).toBe(true);

    // The still-valid access token is rejected, and the refresh token is gone.
    await bob.get('/api/conversations').expect(403);
    await bob.post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/login').send({ login: 'bob', password: PASSWORD }).expect(403);

    await admin.patch(`/api/admin/users/${bobUser.id}`).send({ isBanned: false }).expect(200);
    await request(app).post('/api/auth/login').send({ login: 'bob', password: PASSWORD }).expect(200);
  });

  it('promotes users to admin', async () => {
    const { agent: admin } = await signUp(app, 'root', { admin: true });
    const { agent: carol, user: carolUser } = await signUp(app, 'carol');

    await admin.patch(`/api/admin/users/${carolUser.id}`).send({ role: 'admin' }).expect(200);
    // Role changes apply to the very next request – no re-login needed.
    await carol.get('/api/admin/stats').expect(200);
  });

  it('prevents admins from locking themselves out', async () => {
    const { agent: admin, user } = await signUp(app, 'root', { admin: true });
    await admin.patch(`/api/admin/users/${user.id}`).send({ role: 'user' }).expect(400);
  });

  it('validates updates', async () => {
    const { agent: admin } = await signUp(app, 'root', { admin: true });
    const { user } = await signUp(app, 'carol');
    await admin.patch(`/api/admin/users/${user.id}`).send({}).expect(400);
    await admin.patch(`/api/admin/users/${user.id}`).send({ role: 'superuser' }).expect(400);
    await admin.patch('/api/admin/users/64b000000000000000000000').send({ isBanned: true }).expect(404);
  });
});
