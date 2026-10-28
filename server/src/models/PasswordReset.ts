import { Schema, model, type Types } from 'mongoose';

/**
 * A single-use password reset token. Only its SHA-256 hash is stored; the
 * plain token exists solely in the emailed link.
 */
export interface IPasswordReset {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

const passwordResetSchema = new Schema<IPasswordReset>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes expired tokens automatically.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);
