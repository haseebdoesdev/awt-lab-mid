import mongoose from 'mongoose';
import { Conversation } from './models/Conversation.js';
import { Message } from './models/Message.js';
import { NearbyMessage, NearbyPresence } from './models/Nearby.js';
import { PasswordReset } from './models/PasswordReset.js';
import { ReadState } from './models/ReadState.js';
import { Session } from './models/Session.js';
import { User } from './models/User.js';

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
  // Make sure unique / TTL indexes exist before the app starts handling requests.
  await Promise.all([User, Session, Conversation, Message, ReadState, PasswordReset, NearbyPresence, NearbyMessage].map((model) => model.init()));
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
