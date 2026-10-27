import { Schema, model, type Types } from 'mongoose';

/** How far a user has read in a conversation – drives unread counts and "seen" markers. */
export interface IReadState {
  user: Types.ObjectId;
  conversation: Types.ObjectId;
  lastReadAt: Date;
}

const readStateSchema = new Schema<IReadState>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  lastReadAt: { type: Date, required: true },
});

readStateSchema.index({ conversation: 1, user: 1 }, { unique: true });
readStateSchema.index({ user: 1 });

export const ReadState = model<IReadState>('ReadState', readStateSchema);
