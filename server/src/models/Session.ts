import { Schema, model, type Types } from 'mongoose';

/**
 * A refresh-token session. Only SHA-256 hashes of the opaque refresh tokens
 * are stored. Every refresh rotates the token; the previous hash stays valid
 * for a short grace period so that parallel refreshes (e.g. two tabs) do not
 * log the user out.
 */
export interface ISession {
  user: Types.ObjectId;
  tokenHash: string;
  prevTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    prevTokenHash: { type: String, default: null, index: true },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: null },
  },
  { timestamps: true },
);

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', sessionSchema);
