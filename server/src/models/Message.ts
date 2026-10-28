import { Schema, model, type Types } from 'mongoose';

/** The reactions people can add to a message. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface IReaction {
  emoji: ReactionEmoji;
  user: Types.ObjectId;
}

export interface IMessage {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  /** The message this one replies to (same conversation). */
  replyTo: Types.ObjectId | null;
  /** One entry per (emoji, user) pair. */
  reactions: IReaction[];
  /** Set when the sender edits the message. */
  editedAt: Date | null;
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
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: {
      type: [
        new Schema<IReaction>(
          {
            emoji: { type: String, enum: REACTION_EMOJIS, required: true },
            user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Cursor pagination (newest first) and unread counting.
messageSchema.index({ conversation: 1, _id: -1 });
messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message = model<IMessage>('Message', messageSchema);
