import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Message } from '../src/models/Message.js';
import type { MessageDTO } from '../src/types/dto.js';
import { createRoom, signUp } from './helpers.js';

const app = createApp();

async function setup() {
  const room = await createRoom('general');
  const alice = await signUp(app, 'alice');
  const bob = await signUp(app, 'bob');
  const sent = await alice.agent.post(`/api/conversations/${room}/messages`).send({ body: 'original text' }).expect(201);
  return { room, alice, bob, message: sent.body.message as MessageDTO };
}

describe('replies', () => {
  it('attaches a preview of the quoted message', async () => {
    const { room, bob, message } = await setup();
    const res = await bob.agent
      .post(`/api/conversations/${room}/messages`)
      .send({ body: 'replying', replyToId: message.id })
      .expect(201);
    expect(res.body.message.replyTo).toEqual({
      id: message.id,
      sender: { id: message.sender.id, username: 'alice' },
      body: 'original text',
      deletedAt: null,
    });

    const history = await bob.agent.get(`/api/conversations/${room}/messages`).expect(200);
    expect(history.body.messages.at(-1).replyTo.id).toBe(message.id);
  });

  it('rejects replies to messages from another conversation', async () => {
    const { bob, message } = await setup();
    const other = await createRoom('random');
    await bob.agent
      .post(`/api/conversations/${other}/messages`)
      .send({ body: 'nope', replyToId: message.id })
      .expect(400);
  });

  it('shows a removed original as removed', async () => {
    const { room, bob, message } = await setup();
    const admin = await signUp(app, 'root', { admin: true });
    await bob.agent.post(`/api/conversations/${room}/messages`).send({ body: 'reply', replyToId: message.id });
    await admin.agent.delete(`/api/messages/${message.id}`).expect(204);
    const history = await bob.agent.get(`/api/conversations/${room}/messages`).expect(200);
    expect(history.body.messages.at(-1).replyTo).toMatchObject({ body: '', deletedAt: expect.any(String) });
  });
});

describe('editing', () => {
  it('lets the sender edit and marks the message as edited', async () => {
    const { alice, message } = await setup();
    const res = await alice.agent.patch(`/api/messages/${message.id}`).send({ body: '  fixed text  ' }).expect(200);
    expect(res.body.message).toMatchObject({ body: 'fixed text', editedAt: expect.any(String) });
  });

  it("doesn't mark a no-op edit as edited", async () => {
    const { alice, message } = await setup();
    const res = await alice.agent.patch(`/api/messages/${message.id}`).send({ body: 'original text' }).expect(200);
    expect(res.body.message.editedAt).toBeNull();
  });

  it("forbids editing someone else's message, even as admin", async () => {
    const { bob, message } = await setup();
    const admin = await signUp(app, 'root', { admin: true });
    await bob.agent.patch(`/api/messages/${message.id}`).send({ body: 'hacked' }).expect(403);
    await admin.agent.patch(`/api/messages/${message.id}`).send({ body: 'hacked' }).expect(403);
  });

  it('validates the new text', async () => {
    const { alice, message } = await setup();
    await alice.agent.patch(`/api/messages/${message.id}`).send({ body: '   ' }).expect(400);
  });
});

describe('reactions', () => {
  it('groups reactions by emoji and toggles your own off', async () => {
    const { alice, bob, message } = await setup();
    const react = (agent: typeof alice.agent, emoji: string) =>
      agent.post(`/api/messages/${message.id}/reactions`).send({ emoji }).expect(200);

    await react(bob.agent, '👍');
    const res = await react(alice.agent, '👍');
    expect(res.body.message.reactions).toEqual([
      { emoji: '👍', users: [{ id: bob.user.id, username: 'bob' }, { id: alice.user.id, username: 'alice' }] },
    ]);

    const off = await react(bob.agent, '👍');
    expect(off.body.message.reactions).toEqual([{ emoji: '👍', users: [{ id: alice.user.id, username: 'alice' }] }]);
  });

  it('allows one reaction per person: a new emoji replaces the old one', async () => {
    const { alice, bob, message } = await setup();
    const react = (emoji: string) =>
      bob.agent.post(`/api/messages/${message.id}/reactions`).send({ emoji }).expect(200);

    await react('👍');
    await react('❤️');
    const res = await react('😂');
    expect(res.body.message.reactions).toEqual([{ emoji: '😂', users: [{ id: bob.user.id, username: 'bob' }] }]);

    // Concurrent clicks still leave exactly one reaction.
    await Promise.all(['👍', '❤️', '😮', '😢', '🎉'].map(react));
    const history = await alice.agent.get(`/api/conversations/${message.conversationId}/messages`).expect(200);
    const mine = history.body.messages[0].reactions.flatMap((r: { users: { id: string }[] }) =>
      r.users.filter((u) => u.id === bob.user.id),
    );
    expect(mine).toHaveLength(1);
  });

  it('only accepts the supported emojis', async () => {
    const { bob, message } = await setup();
    await bob.agent.post(`/api/messages/${message.id}/reactions`).send({ emoji: '💩' }).expect(400);
  });

  it('keeps reactions on DMs private to participants', async () => {
    const alice = await signUp(app, 'alice');
    const bob = await signUp(app, 'bob');
    const eve = await signUp(app, 'eve');
    const dm = await alice.agent.post('/api/conversations/dm').send({ userId: bob.user.id }).expect(201);
    const sent = await alice.agent
      .post(`/api/conversations/${dm.body.conversation.id}/messages`)
      .send({ body: 'secret' })
      .expect(201);
    await eve.agent.post(`/api/messages/${sent.body.message.id}/reactions`).send({ emoji: '👍' }).expect(404);
    await eve.agent.patch(`/api/messages/${sent.body.message.id}`).send({ body: 'x' }).expect(404);
  });
});

describe('messages stored before these features existed', () => {
  it('are listed with empty reactions and no reply or edit', async () => {
    const { room, alice, message } = await setup();
    // Simulate a legacy document that lacks the new fields.
    await Message.collection.updateOne(
      { _id: new Types.ObjectId(message.id) },
      { $unset: { reactions: '', replyTo: '', editedAt: '' } },
    );

    const list = await alice.agent.get('/api/conversations').expect(200);
    expect(list.body.conversations[0].lastMessage).toMatchObject({ reactions: [], replyTo: null, editedAt: null });
    const history = await alice.agent.get(`/api/conversations/${room}/messages`).expect(200);
    expect(history.body.messages[0]).toMatchObject({ reactions: [], replyTo: null, editedAt: null });

    // Reacting to a legacy message works too.
    await alice.agent.post(`/api/messages/${message.id}/reactions`).send({ emoji: '👍' }).expect(200);
  });
});
