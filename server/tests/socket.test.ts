import type { AddressInfo } from 'node:net';
import { type Socket, io as connect } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/socket/events.js';
import { createRoom, signUp } from './helpers.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const { app, httpServer, io } = createServer();
let url = '';
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await io.close();
});

function open(accessToken?: string): ClientSocket {
  const socket: ClientSocket = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: accessToken ? { cookie: `access_token=${accessToken}` } : {},
  });
  sockets.push(socket);
  return socket;
}

function waitForConnect(socket: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

/** Signs a user up and connects an authenticated socket for them. */
async function connectAs(username: string) {
  const session = await signUp(app, username);
  const socket = open(session.cookies.access_token);
  await waitForConnect(socket);
  return { ...session, socket };
}

type Payload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

/** Resolves with the next `event` whose payload matches `filter`. */
function next<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  filter: (payload: Payload<E>) => boolean = () => true,
) {
  return new Promise<Payload<E>>((resolve) => {
    const handler = ((payload: Payload<E>) => {
      if (!filter(payload)) return;
      socket.off(event, handler);
      resolve(payload);
    }) as never;
    socket.on(event, handler);
  });
}

describe('Socket.IO', () => {
  it('rejects connections without a valid access token', async () => {
    const error = await new Promise<Error>((resolve) => open('garbage').once('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('accepts a short-lived socket token instead of the cookie (cross-domain hosting)', async () => {
    const { agent } = await signUp(app, 'alice');
    const { body } = await agent.get('/api/auth/socket-token').expect(200);
    const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true, auth: { token: body.token } });
    sockets.push(socket);
    await waitForConnect(socket);
    expect(socket.connected).toBe(true);
  });

  it('delivers messages in real time and acknowledges the sender', async () => {
    const room = await createRoom('general');
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');

    const received = next(bob.socket, 'message:new');
    const ack = await alice.socket.emitWithAck('message:send', { conversationId: room, body: '  hello bob  ' });

    expect(ack).toMatchObject({ ok: true, data: { body: 'hello bob', sender: { username: 'alice' } } });
    expect(await received).toMatchObject({ conversationId: room, body: 'hello bob' });
  });

  it('broadcasts edits and reactions as message:updated', async () => {
    const room = await createRoom('general');
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');

    const sent = await alice.socket.emitWithAck('message:send', { conversationId: room, body: 'first draft' });
    if (!sent.ok) throw new Error(sent.error);

    const edited = next(bob.socket, 'message:updated');
    await alice.socket.emitWithAck('message:edit', { messageId: sent.data.id, body: 'final version' });
    expect(await edited).toMatchObject({ id: sent.data.id, body: 'final version', editedAt: expect.any(String) });

    const reacted = next(alice.socket, 'message:updated');
    const ack = await bob.socket.emitWithAck('message:react', { messageId: sent.data.id, emoji: '🎉' });
    expect(ack.ok).toBe(true);
    expect((await reacted).reactions).toEqual([{ emoji: '🎉', users: [{ id: bob.user.id, username: 'bob' }] }]);

    const reply = next(alice.socket, 'message:new');
    await bob.socket.emitWithAck('message:send', { conversationId: room, body: 'nice', replyToId: sent.data.id });
    expect((await reply).replyTo).toMatchObject({ id: sent.data.id, body: 'final version' });
  });

  it('acknowledges invalid messages with an error', async () => {
    const room = await createRoom('general');
    const alice = await connectAs('alice');
    expect(await alice.socket.emitWithAck('message:send', { conversationId: room, body: '' })).toEqual({
      ok: false,
      error: 'Message cannot be empty',
    });
    expect(
      await alice.socket.emitWithAck('message:send', { conversationId: '64b000000000000000000000', body: 'hi' }),
    ).toEqual({ ok: false, error: 'Conversation not found' });
  });

  it('broadcasts typing indicators to everyone but the typist', async () => {
    const room = await createRoom('general');
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');

    let aliceSawOwnTyping = false;
    alice.socket.on('typing', () => (aliceSawOwnTyping = true));

    const typing = next(bob.socket, 'typing');
    alice.socket.emit('typing', { conversationId: room, isTyping: true });
    expect(await typing).toMatchObject({ conversationId: room, isTyping: true, user: { username: 'alice' } });
    expect(aliceSawOwnTyping).toBe(false);
  });

  it('announces presence changes', async () => {
    const alice = await connectAs('alice');
    const bob = await signUp(app, 'bob');
    const isBob = (p: { userId: string }) => p.userId === bob.user.id;

    const online = next(alice.socket, 'presence', isBob);
    const bobSocket = open(bob.cookies.access_token);
    await waitForConnect(bobSocket);
    expect(await online).toEqual({ userId: bob.user.id, online: true, lastSeen: null });

    const offline = next(alice.socket, 'presence', isBob);
    bobSocket.disconnect();
    expect(await offline).toMatchObject({ userId: bob.user.id, online: false });
  });

  it('pushes read receipts to the conversation', async () => {
    const room = await createRoom('general');
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');

    const receipt = next(alice.socket, 'read:update');
    const ack = await bob.socket.emitWithAck('conversation:read', { conversationId: room });
    expect(ack.ok).toBe(true);
    expect(await receipt).toMatchObject({ conversationId: room, userId: bob.user.id, username: 'bob' });
  });

  it('subscribes both participants to a newly created DM', async () => {
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');

    const announced = next(bob.socket, 'conversation:new');
    const res = await alice.agent.post('/api/conversations/dm').send({ userId: bob.user.id }).expect(201);
    const dmId = res.body.conversation.id;
    expect((await announced).id).toBe(dmId);

    const received = next(bob.socket, 'message:new');
    await alice.socket.emitWithAck('message:send', { conversationId: dmId, body: 'psst' });
    expect(await received).toMatchObject({ conversationId: dmId, body: 'psst' });
  });

  it('delivers local (nearby) messages only to people within 1 km', async () => {
    const at = async (session: Awaited<ReturnType<typeof connectAs>>, lat: number) => {
      await session.agent.post('/api/nearby/join').send({ consent: true }).expect(200);
      await session.agent.put('/api/nearby/location').send({ lat, lng: 73.03 }).expect(200);
    };
    const alice = await connectAs('alice');
    const bob = await connectAs('bob');
    const carol = await connectAs('carol');
    await at(alice, 33.7);
    await at(bob, 33.7027); // ~300 m away
    await at(carol, 33.745); // ~5 km away

    let carolGotIt = false;
    carol.socket.on('nearby:message', () => (carolGotIt = true));
    const received = next(bob.socket, 'nearby:message');
    await alice.agent.post('/api/nearby/messages').send({ body: 'hello neighbours' }).expect(201);

    expect(await received).toMatchObject({ body: 'hello neighbours', senderName: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(carolGotIt).toBe(false);
  });

  it('disconnects banned users and tells them why', async () => {
    const admin = await signUp(app, 'root', { admin: true });
    const bob = await connectAs('bob');

    const revoked = next(bob.socket, 'session:revoked');
    const disconnected = new Promise<string>((resolve) => bob.socket.once('disconnect', resolve));
    await admin.agent.patch(`/api/admin/users/${bob.user.id}`).send({ isBanned: true }).expect(200);

    expect((await revoked).reason).toMatch(/banned/);
    expect(await disconnected).toBe('io server disconnect');
  });
});
