import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { Conversation } from './models/Conversation.js';
import { User } from './models/User.js';

const DEFAULT_ROOMS = [
  { name: 'general', description: 'Company-wide announcements and chatter' },
  { name: 'random', description: 'Off-topic conversations, memes and fun' },
  { name: 'help', description: 'Ask questions and get help from the community' },
];

/** Creates the admin account from ADMIN_* env vars if it does not exist yet. */
async function ensureAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  if (await User.exists({ email: env.ADMIN_EMAIL.toLowerCase() })) return;

  await User.create({
    username: env.ADMIN_USERNAME,
    email: env.ADMIN_EMAIL,
    passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
    role: 'admin',
  });
  console.log(`Created admin account "${env.ADMIN_USERNAME}" <${env.ADMIN_EMAIL}>`);
}

/** Seeds a few public rooms on an empty database. */
async function ensureDefaultRooms(): Promise<void> {
  if (await Conversation.exists({ type: 'room' })) return;
  await Conversation.insertMany(DEFAULT_ROOMS.map((room) => ({ type: 'room', ...room })));
  console.log(`Created default rooms: ${DEFAULT_ROOMS.map((r) => `#${r.name}`).join(', ')}`);
}

export async function bootstrap(): Promise<void> {
  await ensureAdmin();
  await ensureDefaultRooms();
}
