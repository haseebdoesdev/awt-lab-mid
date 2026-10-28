import { Schema, model, type Types } from 'mongoose';

/** Everyone within this distance of you is in your local room. */
export const NEARBY_RADIUS_METERS = 1000;
/** Your location is forgotten this long after its last update (e.g. the tab was closed). */
export const PRESENCE_TTL_SECONDS = 15 * 60;
/** Local messages delete themselves after a day. */
export const NEARBY_MESSAGE_TTL_SECONDS = 24 * 60 * 60;

export const VISIBILITY_SCOPES = ['hidden', 'approximate', 'contacts', 'everyone'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export interface GeoPoint {
  type: 'Point';
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: [number, number];
}

const pointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

/** A user's current position while they have the Nearby page open. */
export interface INearbyPresence {
  user: Types.ObjectId;
  location: GeoPoint;
  /** Reported GPS accuracy in metres. */
  accuracy: number | null;
  /** Set by an admin's demo pin instead of real GPS. */
  simulated: boolean;
  lastSeenAt: Date;
}

const presenceSchema = new Schema<INearbyPresence>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  location: { type: pointSchema, required: true },
  accuracy: { type: Number, default: null },
  simulated: { type: Boolean, default: false },
  lastSeenAt: { type: Date, required: true },
});
presenceSchema.index({ location: '2dsphere' });
presenceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: PRESENCE_TTL_SECONDS });

export const NearbyPresence = model<INearbyPresence>('NearbyPresence', presenceSchema);

/** A message in the local room, pinned to where it was sent. */
export interface INearbyMessage {
  sender: Types.ObjectId;
  /** Alias (or username) at the time of sending. */
  senderName: string;
  /** Pseudonymous, stable id for the sender – never the user id. */
  senderToken: string;
  body: string;
  location: GeoPoint;
  createdAt: Date;
}

const nearbyMessageSchema = new Schema<INearbyMessage>({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  senderToken: { type: String, required: true },
  body: { type: String, required: true, maxlength: 2000 },
  location: { type: pointSchema, required: true },
  createdAt: { type: Date, default: () => new Date() },
});
nearbyMessageSchema.index({ location: '2dsphere', createdAt: -1 });
nearbyMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: NEARBY_MESSAGE_TTL_SECONDS });

export const NearbyMessage = model<INearbyMessage>('NearbyMessage', nearbyMessageSchema);
