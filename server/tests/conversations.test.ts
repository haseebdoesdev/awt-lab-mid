import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Message } from '../src/models/Message.js';
import type { ConversationDTO, MessageDTO } from '../src/types/dto.js';
import { createRoom, signUp } from './helpers.js';

const app = createApp();

const find = (list: ConversationDTO[], id: string) => list.find((c) => c.id === id);

describe('rooms', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/conversations').expect(401);
  });

  it('lists every public room to every user', async () => {
    await createRoom('general');
    await createRoom('random');
    const { agent } = await signUp(app, 'alice');

    const res = await agent.get('/api/conversations').expect(200);
    expect(res.body.conversations.map((c: ConversationDTO) => c.name)).toEqual(['general', 'random']);
  });

  it('only lets admins create and delete rooms', async () => {
    const { agent: user } = await signUp(app, 'alice');
    const { agent: admin } = await signUp(app, 'root', { admin: true });

    await user.post('/api/conversations/rooms').send({ name: 'secret' }).expect(403);

    const created = await admin
      .post('/api/conversations/rooms')
      .send({ name: 'Design-Team', description: 'Pixels' })
      .expect(201);
    expect(created.body.conversation).toMatchObject({ type: 'room', name: 'design-team', description: 'Pixels' });

    await admin.post('/api/conversations/rooms').send({ name: 'design-team' }).expect(409);
    await admin.post('/api/conversations/rooms').send({ name: 'no spaces!' }).expect(400);

    const id = created.body.conversation.id;
    await user.delete(`/api/conversations/${id}`).expect(403);
    await admin.delete(`/api/conversations/${id}`).expect(204);
    await admin.get(`/api/conversations/${id}/messages`).expect(404);
  });
});

describe('direct messages', () => {
  it('creates one DM per pair of users, from either side', async () => {
    const { agent: alice, user: aliceUser } = await signUp(app, 'alice');
    const { agent: bob, user: bobUser } = await signUp(app, 'bob');

    const first = await alice.post('/api/conversations/dm').send({ userId: bobUser.id }).expect(201);
    const again = await bob.post('/api/conversations/dm').send({ userId: aliceUser.id }).expect(200);
    expect(again.body.conversation.id).toBe(first.body.conversation.id);
    expect(first.body.conversation.participants.map((p: { username: string }) => p.username).sort()).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('keeps DMs private to their participants', async () => {
    const { agent: alice } = await signUp(app, 'alice');
    const { user: bobUser } = await signUp(app, 'bob');
    const { agent: eve } = await signUp(app, 'eve');

    const dm = await alice.post('/api/conversations/dm').send({ userId: bobUser.id }).expect(201);
    const id = dm.body.conversation.id;

    await eve.get(`/api/conversations/${id}/messages`).expect(404);
    await eve.post(`/api/conversations/${id}/messages`).send({ body: 'hi' }).expect(404);
    const eveList = await eve.get('/api/conversations').expect(200);
    expect(find(eveList.body.conversations, id)).toBeUndefined();
  });

  it('rejects DMs with yourself or unknown users', async () => {
    const { agent, user } = await signUp(app, 'alice');
    await agent.post('/api/conversations/dm').send({ userId: user.id }).expect(400);
    await agent.post('/api/conversations/dm').send({ userId: '64b000000000000000000000' }).expect(404);
    await agent.post('/api/conversations/dm').send({ userId: 'nope' }).expect(400);
  });
});

describe('messages', () => {
  it('validates the message body', async () => {
    const room = await createRoom('general');
    const { agent } = await signUp(app, 'alice');
    await agent.post(`/api/conversations/${room}/messages`).send({ body: '   ' }).expect(400);
    await agent.post(`/api/conversations/${room}/messages`).send({ body: 'x'.repeat(2001) }).expect(400);
  });

  it('paginates history with a cursor, oldest first within a page', async () => {
    const room = await createRoom('general');
    const { agent } = await signUp(app, 'alice');
    for (let i = 1; i <= 35; i++) {
      await agent.post(`/api/conversations/${room}/messages`).send({ body: `message ${i}` }).expect(201);
    }

    const page1 = await agent.get(`/api/conversations/${room}/messages?limit=30`).expect(200);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.messages).toHaveLength(30);
    expect(page1.body.messages[0].body).toBe('message 6');
    expect(page1.body.messages.at(-1).body).toBe('message 35');

    const cursor = page1.body.messages[0].id;
    const page2 = await agent.get(`/api/conversations/${room}/messages?limit=30&before=${cursor}`).expect(200);
    expect(page2.body.hasMore).toBe(false);
    expect(page2.body.messages.map((m: MessageDTO) => m.body)).toEqual([1, 2, 3, 4, 5].map((i) => `message ${i}`));
  });

  it('tracks unread counts and read receipts per user', async () => {
    const room = await createRoom('general');
    const { agent: alice, user: aliceUser } = await signUp(app, 'alice');
    const { agent: bob } = await signUp(app, 'bob');

    for (const body of ['one', 'two', 'three']) {
      await bob.post(`/api/conversations/${room}/messages`).send({ body }).expect(201);
    }

    const before = await alice.get('/api/conversations').expect(200);
    expect(find(before.body.conversations, room)).toMatchObject({ unreadCount: 3, lastMessage: { body: 'three' } });

    // Your own messages never count as unread.
    const bobView = await bob.get('/api/conversations').expect(200);
    expect(find(bobView.body.conversations, room)?.unreadCount).toBe(0);

    const read = await alice.post(`/api/conversations/${room}/read`).expect(200);
    expect(read.body.receipt).toMatchObject({ conversationId: room, userId: aliceUser.id, username: 'alice' });

    const after = await alice.get('/api/conversations').expect(200);
    expect(find(after.body.conversations, room)?.unreadCount).toBe(0);

    const receipts = await bob.get(`/api/conversations/${room}/receipts`).expect(200);
    expect(receipts.body.receipts.map((r: { username: string }) => r.username)).toEqual(['alice']);
  });

  it('lets admins remove messages', async () => {
    const room = await createRoom('general');
    const { agent: alice } = await signUp(app, 'alice');
    const { agent: admin } = await signUp(app, 'root', { admin: true });

    const sent = await alice.post(`/api/conversations/${room}/messages`).send({ body: 'spam' }).expect(201);
    const id = sent.body.message.id;

    await alice.delete(`/api/messages/${id}`).expect(403);
    await admin.delete(`/api/messages/${id}`).expect(204);
    await admin.delete(`/api/messages/${id}`).expect(404);

    const history = await alice.get(`/api/conversations/${room}/messages`).expect(200);
    expect(history.body.messages[0]).toMatchObject({ id, body: '' });
    expect(history.body.messages[0].deletedAt).not.toBeNull();
    expect((await Message.findById(id))?.body).toBe('');
  });
});
