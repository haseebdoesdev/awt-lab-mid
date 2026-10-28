import type { Express } from 'express';
import request from 'supertest';
import { Conversation } from '../src/models/Conversation.js';
import { User } from '../src/models/User.js';
import type { AccountDTO } from '../src/types/dto.js';

export const PASSWORD = 'correct-horse-battery';

/** Registers a user and returns a supertest agent that keeps their auth cookies. */
export async function signUp(app: Express, username: string, options: { admin?: boolean } = {}) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ username, email: `${username}@example.com`, password: PASSWORD })
    .expect(201);

  const user = res.body.user as AccountDTO;
  if (options.admin) {
    await User.updateOne({ _id: user.id }, { $set: { role: 'admin' } });
    user.role = 'admin';
  }
  return { agent, user, cookies: cookiesFrom(res.headers['set-cookie']) };
}

/** Parses Set-Cookie headers into a name → value map. */
export function cookiesFrom(header: string[] | string | undefined): Record<string, string> {
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return Object.fromEntries(
    list.map((cookie) => {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

export async function createRoom(name: string) {
  const room = await Conversation.create({ type: 'room', name });
  return room.id as string;
}
