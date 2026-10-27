import type { Types } from 'mongoose';
import { ReadState } from '../models/ReadState.js';
import { emitToConversation } from '../socket/emitter.js';
import type { AuthUser, ReadReceiptDTO } from '../types/dto.js';
import { findAccessibleConversation } from './conversations.js';

/** Moves the user's read marker to "now" and notifies the conversation. */
export async function markRead(conversationId: string, user: AuthUser): Promise<ReadReceiptDTO> {
  const conversation = await findAccessibleConversation(conversationId, user);
  const state = await ReadState.findOneAndUpdate(
    { conversation: conversation._id, user: user.id },
    // $max never moves the marker backwards.
    { $max: { lastReadAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );

  const receipt: ReadReceiptDTO = {
    conversationId,
    userId: user.id,
    username: user.username,
    lastReadAt: state.lastReadAt.toISOString(),
  };
  emitToConversation(conversationId, 'read:update', receipt);
  return receipt;
}

export async function listReceipts(conversationId: Types.ObjectId): Promise<ReadReceiptDTO[]> {
  const states = await ReadState.find({ conversation: conversationId })
    .populate<{ user: { _id: Types.ObjectId; username: string } | null }>('user', 'username')
    .lean();

  return states.flatMap((s) =>
    s.user
      ? [
          {
            conversationId: conversationId.toString(),
            userId: s.user._id.toString(),
            username: s.user.username,
            lastReadAt: s.lastReadAt.toISOString(),
          },
        ]
      : [],
  );
}
