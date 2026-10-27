import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const CONVERSATION_TYPES = ['room', 'dm'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

/**
 * Rooms are public channels managed by admins; DMs are private conversations
 * between exactly two participants.
 */
export interface IConversation {
  type: ConversationType;
  name: string | null;
  description: string;
  participants: Types.ObjectId[];
  /** Sorted participant ids joined by ":" – guarantees one DM per pair. */
  dmKey: string | null;
  createdBy: Types.ObjectId | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDoc = HydratedDocument<IConversation>;

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: CONVERSATION_TYPES, required: true },
    name: { type: String, default: null, trim: true, maxlength: 40 },
    description: { type: String, default: '', trim: true, maxlength: 200 },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    dmKey: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { type: 'room' }, collation: { locale: 'en', strength: 2 } },
);
conversationSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { type: 'dm' } });
conversationSchema.index({ participants: 1 });

export const Conversation = model<IConversation>('Conversation', conversationSchema);
