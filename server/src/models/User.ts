import { Schema, model, type HydratedDocument } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface IUser {
  username: string;
  email: string;
  /** Null for accounts created with Google that never set a password. */
  passwordHash: string | null;
  /** Google account id (`sub`) once the user has signed in with Google. */
  googleId: string | null;
  role: Role;
  isBanned: boolean;
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<IUser>;

/** Case-insensitive collation used for username uniqueness and lookups. */
export const usernameCollation = { locale: 'en', strength: 2 } as const;

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_.-]+$/,
    },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: null, select: false },
    googleId: { type: String, default: null },
    role: { type: String, enum: ROLES, default: 'user', required: true },
    isBanned: { type: Boolean, default: false, required: true },
    lastSeen: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

// "Alice" and "alice" are the same username.
userSchema.index({ username: 1 }, { unique: true, collation: usernameCollation });

export const User = model<IUser>('User', userSchema);
