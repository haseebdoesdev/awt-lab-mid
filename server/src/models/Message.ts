import { Schema, model, type Types } from 'mongoose';

export interface IMessage {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  /** Set when an admin removes the message; the body is cleared. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new Schema<IMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, default: '', maxlength: MAX_MESSAGE_LENGTH },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Cursor pagination (newest first) and unread counting.
messageSchema.index({ conversation: 1, _id: -1 });
messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message = model<IMessage>('Message', messageSchema);
