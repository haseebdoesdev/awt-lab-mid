import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { NearbyMessage, NearbyPresence } from '../src/models/Nearby.js';
import { User } from '../src/models/User.js';
import { signUp } from './helpers.js';

const app = createApp();

// Around F-9 Park, Islamabad. 0.0027° of latitude ≈ 300 m; 0.045° ≈ 5 km.
const HERE = { lat: 33.7, lng: 73.03 };
const NEAR = { lat: HERE.lat + 0.0027, lng: HERE.lng };
const FAR = { lat: HERE.lat + 0.045, lng: HERE.lng };

type Agent = ReturnType<typeof request.agent>;

async function joinAt(
  username: string,
  at: { lat: number; lng: number },
  settings: { alias?: string; visibility?: string } = {},
  options: { admin?: boolean } = {},
) {
  const session = await signUp(app, username, options);
  await session.agent.post('/api/nearby/join').send({ consent: true, ...settings }).expect(200);
  await session.agent.put('/api/nearby/location').send({ ...at, accuracy: 20 }).expect(200);
  return session;
}

const people = async (agent: Agent) => (await agent.get('/api/nearby/people').expect(200)).body;

describe('consent', () => {
  it('requires explicit consent to join', async () => {
    const { agent } = await signUp(app, 'alice');
    await agent.post('/api/nearby/join').send({}).expect(400);
    await agent.post('/api/nearby/join').send({ consent: false }).expect(400);
    const res = await agent.post('/api/nearby/join').send({ consent: true }).expect(200);
    expect(res.body.me).toMatchObject({ joined: true, visibility: 'hidden', alias: null, radiusMeters: 1000 });
  });

  it("won't take a location before the user has joined", async () => {
    const { agent } = await signUp(app, 'alice');
    await agent.put('/api/nearby/location').send(HERE).expect(409);
    expect(await NearbyPresence.countDocuments()).toBe(0);
  });

  it('leaving deletes the location immediately', async () => {
    const alice = await joinAt('alice', HERE);
    await alice.agent.post('/api/nearby/leave').expect(204);
    expect(await NearbyPresence.countDocuments()).toBe(0);
    expect((await User.findById(alice.user.id))?.nearby).toBeNull();
    await alice.agent.get('/api/nearby/people').expect(409);
  });

  it('validates aliases and coordinates', async () => {
    const { agent } = await signUp(app, 'alice');
    await agent.post('/api/nearby/join').send({ consent: true, alias: '<script>' }).expect(400);
    await agent.post('/api/nearby/join').send({ consent: true, alias: 'x'.repeat(31) }).expect(400);
    await agent.post('/api/nearby/join').send({ consent: true, visibility: 'stalk-mode' }).expect(400);
    await agent.post('/api/nearby/join').send({ consent: true, alias: 'Night Owl' }).expect(200);
    await agent.put('/api/nearby/location').send({ lat: 95, lng: 0 }).expect(400);
  });
});

describe('who you can see on the map', () => {
  it('only includes people within 1 km', async () => {
    const alice = await joinAt('alice', HERE);
    await joinAt('bob', NEAR, { visibility: 'everyone' });
    await joinAt('carol', FAR, { visibility: 'everyone' });

    const res = await people(alice.agent);
    expect(res.total).toBe(1);
    expect(res.people.map((p: { name: string }) => p.name)).toEqual(['bob']);
    expect(res.people[0]).toMatchObject({ precision: 'exact', lat: NEAR.lat, lng: NEAR.lng, distanceMeters: 350 });
  });

  it('counts hidden people but never shows where they are', async () => {
    const alice = await joinAt('alice', HERE);
    await joinAt('bob', NEAR); // default: hidden
    expect(await people(alice.agent)).toEqual({ total: 1, people: [] });
  });

  it('blurs approximate locations to a ~500 m grid cell', async () => {
    const alice = await joinAt('alice', HERE);
    await joinAt('bob', NEAR, { visibility: 'approximate' });

    const [bob] = (await people(alice.agent)).people;
    expect(bob).toMatchObject({ precision: 'approximate', radiusMeters: 400 });
    expect([bob.lat, bob.lng]).not.toEqual([NEAR.lat, NEAR.lng]);
    expect(Math.abs(bob.lat - NEAR.lat)).toBeLessThan(0.005);
    expect(bob.distanceMeters % 100).toBe(0);
  });

  it('shows "contacts only" people precisely to their DM contacts and not at all to others', async () => {
    const alice = await joinAt('alice', HERE);
    const bob = await joinAt('bob', NEAR, { visibility: 'contacts' });
    const carol = await joinAt('carol', HERE);

    await alice.agent.post('/api/conversations/dm').send({ userId: bob.user.id }).expect(201);

    expect((await people(alice.agent)).people[0]).toMatchObject({ name: 'bob', precision: 'exact' });
    const carolView = await people(carol.agent);
    expect(carolView.people.find((p: { name: string }) => p.name === 'bob')).toBeUndefined();
    expect(carolView.total).toBe(2);
  });

  it('shows the alias instead of the username', async () => {
    const alice = await joinAt('alice', HERE);
    await joinAt('bob', NEAR, { alias: 'Night Owl', visibility: 'everyone' });
    expect((await people(alice.agent)).people[0].name).toBe('Night Owl');
  });

  it('applies visibility changes straight away', async () => {
    const alice = await joinAt('alice', HERE);
    const bob = await joinAt('bob', NEAR, { visibility: 'everyone' });
    await bob.agent.patch('/api/nearby/settings').send({ visibility: 'hidden' }).expect(200);
    expect((await people(alice.agent)).people).toEqual([]);
  });

  it('ignores locations that have gone stale', async () => {
    const alice = await joinAt('alice', HERE);
    await joinAt('bob', NEAR, { visibility: 'everyone' });
    await NearbyPresence.updateMany({ user: { $ne: alice.user.id } }, { $set: { lastSeenAt: new Date(0) } });
    expect((await people(alice.agent)).total).toBe(0);
  });
});

describe('local messages', () => {
  it('reach people within 1 km and show the alias, not the username', async () => {
    const alice = await joinAt('alice', HERE, { alias: 'Sunny' });
    const bob = await joinAt('bob', NEAR);
    const carol = await joinAt('carol', FAR);

    const sent = await alice.agent.post('/api/nearby/messages').send({ body: 'Anyone at the park?' }).expect(201);
    expect(sent.body.message).toMatchObject({ senderName: 'Sunny', body: 'Anyone at the park?' });
    expect(sent.body.message).not.toHaveProperty('sender');

    const bobView = (await bob.agent.get('/api/nearby/messages').expect(200)).body.messages;
    expect(bobView).toHaveLength(1);
    expect(JSON.stringify(bobView)).not.toContain('alice');
    expect((await carol.agent.get('/api/nearby/messages').expect(200)).body.messages).toEqual([]);
  });

  it('lets admins see the real account behind an alias and remove messages', async () => {
    const alice = await joinAt('alice', HERE, { alias: 'Sunny' });
    const admin = await joinAt('root', NEAR, {}, { admin: true });
    const sent = await alice.agent.post('/api/nearby/messages').send({ body: 'spam' }).expect(201);

    const adminView = (await admin.agent.get('/api/nearby/messages').expect(200)).body.messages;
    expect(adminView[0].sender).toEqual({ id: alice.user.id, username: 'alice' });

    await alice.agent.delete(`/api/nearby/messages/${sent.body.message.id}`).expect(403);
    await admin.agent.delete(`/api/nearby/messages/${sent.body.message.id}`).expect(204);
    expect(await NearbyMessage.countDocuments()).toBe(0);
  });

  it('auto-deletes messages after 24 hours (TTL index)', async () => {
    const indexes = await NearbyMessage.collection.indexes();
    expect(indexes.find((i) => i.expireAfterSeconds !== undefined)).toMatchObject({
      key: { createdAt: 1 },
      expireAfterSeconds: 86_400,
    });
  });

  it('requires a shared location to post', async () => {
    const { agent } = await signUp(app, 'alice');
    await agent.post('/api/nearby/join').send({ consent: true }).expect(200);
    await agent.post('/api/nearby/messages').send({ body: 'hi' }).expect(409);
  });
});

describe('demo location', () => {
  it('is only available to admins', async () => {
    const alice = await joinAt('alice', HERE);
    await alice.agent.put('/api/nearby/location').send({ ...FAR, simulated: true }).expect(403);

    const admin = await joinAt('root', HERE, {}, { admin: true });
    const res = await admin.agent.put('/api/nearby/location').send({ ...FAR, simulated: true }).expect(200);
    expect(res.body.me.location).toMatchObject({ simulated: true, lat: FAR.lat });
    // Moving the pin 5 km away takes the admin out of Alice's local room.
    expect((await people(alice.agent)).total).toBe(0);
  });
});

describe('bans', () => {
  it('remove the user from the local room', async () => {
    const alice = await joinAt('alice', HERE);
    const admin = await signUp(app, 'root', { admin: true });
    await admin.agent.patch(`/api/admin/users/${alice.user.id}`).send({ isBanned: true }).expect(200);
    expect(await NearbyPresence.countDocuments()).toBe(0);
  });
});
