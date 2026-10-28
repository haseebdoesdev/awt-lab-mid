import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';
import {
  type GeoPoint,
  NEARBY_MESSAGE_TTL_SECONDS,
  NEARBY_RADIUS_METERS,
  NearbyMessage,
  NearbyPresence,
  PRESENCE_TTL_SECONDS,
  type VisibilityScope,
} from '../models/Nearby.js';
import { type Role, User } from '../models/User.js';
import { emitToUsers } from '../socket/emitter.js';
import type { AuthUser } from '../types/dto.js';
import { HttpError, forbidden, notFound } from '../utils/httpError.js';
import { isObjectId } from '../utils/validation.js';

const EARTH_RADIUS_METERS = 6_378_100;
/** Approximate locations snap to a grid of roughly this size. */
const APPROXIMATE_CELL_DEGREES = 0.005; // ≈ 550 m north–south
const APPROXIMATE_RADIUS_METERS = 400;
/** Location updates smaller than this don't notify neighbours. */
const MOVE_THRESHOLD_METERS = 25;

/* --------------------------------- DTOs ---------------------------------- */

export interface NearbyMeDTO {
  joined: boolean;
  alias: string | null;
  visibility: VisibilityScope;
  /** What others see as your name in the local room. */
  displayName: string;
  /** Your own pseudonymous token, to recognise your messages. */
  selfToken: string;
  radiusMeters: number;
  location: { lat: number; lng: number; accuracy: number | null; simulated: boolean; updatedAt: string } | null;
}

export interface NearbyPersonDTO {
  token: string;
  name: string;
  precision: 'exact' | 'approximate';
  lat: number;
  lng: number;
  /** For approximate locations: the radius of the circle the person is somewhere in. */
  radiusMeters: number | null;
  /** Rounded up, so exact distances can't be used to triangulate anyone. */
  distanceMeters: number;
}

export interface NearbyMessageDTO {
  id: string;
  senderToken: string;
  senderName: string;
  body: string;
  createdAt: string;
  /** Only included for admins (moderation). */
  sender?: { id: string; username: string };
}

/* -------------------------------- Helpers -------------------------------- */

const toPoint = (lat: number, lng: number): GeoPoint => ({ type: 'Point', coordinates: [lng, lat] });
const latOf = (p: GeoPoint) => p.coordinates[1];
const lngOf = (p: GeoPoint) => p.coordinates[0];

/** Great-circle distance in metres (haversine formula). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(latOf(b) - latOf(a));
  const dLng = rad(lngOf(b) - lngOf(a));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latOf(a))) * Math.cos(rad(latOf(b))) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

const roundUp = (meters: number, step: number) => Math.max(step, Math.ceil(meters / step) * step);

/**
 * Snaps a point to the centre of a ~500 m grid cell. Deterministic, so asking
 * repeatedly can't be averaged out to recover the real position.
 */
function approximate(point: GeoPoint): GeoPoint {
  const lat = latOf(point);
  const latStep = APPROXIMATE_CELL_DEGREES;
  const lngStep = APPROXIMATE_CELL_DEGREES / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const snap = (value: number, step: number) => (Math.floor(value / step) + 0.5) * step;
  return toPoint(snap(lat, latStep), snap(lngOf(point), lngStep));
}

/** Stable pseudonym for a user in the local room; can't be reversed into a user id. */
export function senderToken(userId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`nearby:${userId}`).digest('base64url').slice(0, 16);
}

const withinRadius = (point: GeoPoint, meters = NEARBY_RADIUS_METERS) => ({
  $geoWithin: { $centerSphere: [point.coordinates, meters / EARTH_RADIUS_METERS] },
});

const freshSince = () => new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000);

interface PresentUser {
  _id: Types.ObjectId;
  username: string;
  role: Role;
  isBanned: boolean;
  nearby: { alias: string | null; visibility: VisibilityScope } | null;
}

/** Opted-in, non-banned users whose fresh location is within the radius of `point`. */
async function presentNear(point: GeoPoint) {
  const presences = await NearbyPresence.find({ location: withinRadius(point), lastSeenAt: { $gt: freshSince() } })
    .populate<{ user: PresentUser | null }>('user', 'username role isBanned nearby')
    .lean();
  return presences.flatMap((p) => {
    const { user } = p;
    if (!user?.nearby || user.isBanned) return [];
    return [{ ...p, user: { ...user, nearby: user.nearby } }];
  });
}

async function myPresence(userId: string) {
  return NearbyPresence.findOne({ user: userId, lastSeenAt: { $gt: freshSince() } }).lean();
}

/** Tells everyone near these points to refresh their map / people count. */
async function notifyArea(points: GeoPoint[], exceptUserId: string) {
  const ids = new Set<string>();
  for (const point of points) {
    for (const p of await presentNear(point)) ids.add(p.user._id.toString());
  }
  ids.delete(exceptUserId);
  emitToUsers([...ids], 'nearby:changed');
}

async function requireJoined(userId: string) {
  const user = await User.findById(userId, { username: 1, role: 1, nearby: 1 }).lean();
  if (!user?.nearby) throw new HttpError(409, 'Join the local room first');
  return { ...user, nearby: user.nearby };
}

const nameOf = (user: { username: string; nearby: { alias: string | null } | null }) =>
  user.nearby?.alias || user.username;

/* ------------------------------ Membership ------------------------------- */

export async function getNearbyMe(user: AuthUser): Promise<NearbyMeDTO> {
  const [account, presence] = await Promise.all([
    User.findById(user.id, { username: 1, nearby: 1 }).lean(),
    myPresence(user.id),
  ]);
  return {
    joined: Boolean(account?.nearby),
    alias: account?.nearby?.alias ?? null,
    visibility: account?.nearby?.visibility ?? 'hidden',
    displayName: account ? nameOf(account) : user.username,
    selfToken: senderToken(user.id),
    radiusMeters: NEARBY_RADIUS_METERS,
    location:
      account?.nearby && presence
        ? {
            lat: latOf(presence.location),
            lng: lngOf(presence.location),
            accuracy: presence.accuracy,
            simulated: presence.simulated,
            updatedAt: presence.lastSeenAt.toISOString(),
          }
        : null,
  };
}

/** Records consent and the user's chosen alias / visibility. */
export async function joinNearby(
  user: AuthUser,
  settings: { alias: string | null; visibility: VisibilityScope },
): Promise<NearbyMeDTO> {
  await User.updateOne(
    { _id: user.id },
    { $set: { nearby: { joinedAt: new Date(), alias: settings.alias, visibility: settings.visibility } } },
  );
  return getNearbyMe(user);
}

export async function updateNearbySettings(
  user: AuthUser,
  settings: { alias?: string | null; visibility?: VisibilityScope },
): Promise<NearbyMeDTO> {
  await requireJoined(user.id);
  const set: Record<string, unknown> = {};
  if (settings.alias !== undefined) set['nearby.alias'] = settings.alias;
  if (settings.visibility !== undefined) set['nearby.visibility'] = settings.visibility;
  await User.updateOne({ _id: user.id }, { $set: set });

  const presence = await myPresence(user.id);
  if (presence) await notifyArea([presence.location], user.id);
  return getNearbyMe(user);
}

/** Withdraws consent: forgets the location immediately. */
export async function leaveNearby(userId: string): Promise<void> {
  const presence = await NearbyPresence.findOneAndDelete({ user: userId }).lean();
  await User.updateOne({ _id: userId }, { $set: { nearby: null } });
  if (presence) await notifyArea([presence.location], userId);
}

/* -------------------------------- Location ------------------------------- */

export async function updateLocation(
  user: AuthUser,
  input: { lat: number; lng: number; accuracy?: number | null; simulated?: boolean },
): Promise<NearbyMeDTO> {
  await requireJoined(user.id);
  if (input.simulated && user.role !== 'admin') throw forbidden('Only admins can use a demo location');

  const point = toPoint(input.lat, input.lng);
  const previous = await NearbyPresence.findOneAndUpdate(
    { user: user.id },
    {
      $set: {
        location: point,
        accuracy: input.accuracy ?? null,
        simulated: Boolean(input.simulated),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true },
  ).lean();

  const moved = !previous || distanceMeters(previous.location, point) >= MOVE_THRESHOLD_METERS;
  if (moved) await notifyArea(previous ? [previous.location, point] : [point], user.id);
  return getNearbyMe(user);
}

/* --------------------------------- People -------------------------------- */

/**
 * Who is nearby, as this viewer is allowed to see them. Precision follows
 * each person's chosen scope; hidden people only count towards `total`.
 */
export async function listNearbyPeople(user: AuthUser): Promise<{ total: number; people: NearbyPersonDTO[] }> {
  await requireJoined(user.id);
  const me = await myPresence(user.id);
  if (!me) return { total: 0, people: [] };

  const others = (await presentNear(me.location)).filter((p) => !p.user._id.equals(user.id));
  const dms = await Conversation.find({ type: 'dm', participants: new Types.ObjectId(user.id) }, { participants: 1 }).lean();
  const contacts = new Set(dms.flatMap((c) => c.participants.map(String)));

  const people = others.flatMap((p): NearbyPersonDTO[] => {
    const scope = p.user.nearby.visibility;
    const isContact = contacts.has(p.user._id.toString());
    const exact = scope === 'everyone' || (scope === 'contacts' && isContact);
    if (!exact && scope !== 'approximate') return [];

    const shown = exact ? p.location : approximate(p.location);
    return [
      {
        token: senderToken(p.user._id.toString()),
        name: nameOf(p.user),
        precision: exact ? 'exact' : 'approximate',
        lat: latOf(shown),
        lng: lngOf(shown),
        radiusMeters: exact ? null : APPROXIMATE_RADIUS_METERS,
        distanceMeters: roundUp(distanceMeters(me.location, shown), exact ? 50 : 100),
      },
    ];
  });

  return { total: others.length, people };
}

/* -------------------------------- Messages ------------------------------- */

interface NearbyMessageLike {
  _id: Types.ObjectId;
  senderName: string;
  senderToken: string;
  body: string;
  createdAt: Date;
}

/** `sender` (the real account) is only passed for admin viewers. */
function toNearbyMessageDTO(message: NearbyMessageLike, sender?: { id: string; username: string }): NearbyMessageDTO {
  return {
    id: message._id.toString(),
    senderToken: message.senderToken,
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    ...(sender ? { sender } : {}),
  };
}

/** The last 24 hours of messages sent within 1 km of where you are now. */
export async function listNearbyMessages(user: AuthUser): Promise<NearbyMessageDTO[]> {
  await requireJoined(user.id);
  const me = await myPresence(user.id);
  if (!me) throw new HttpError(409, 'Share your location to see the local room');

  const since = new Date(Date.now() - NEARBY_MESSAGE_TTL_SECONDS * 1000);
  const messages = await NearbyMessage.find({ location: withinRadius(me.location), createdAt: { $gt: since } })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ sender: { _id: Types.ObjectId; username: string } | null }>('sender', 'username')
    .lean();

  const admin = user.role === 'admin';
  return messages
    .reverse()
    .map((m) =>
      toNearbyMessageDTO(m, admin && m.sender ? { id: m.sender._id.toString(), username: m.sender.username } : undefined),
    );
}

/** Saves a message at the sender's position and delivers it to everyone within 1 km. */
export async function postNearbyMessage(user: AuthUser, body: string): Promise<NearbyMessageDTO> {
  const account = await requireJoined(user.id);
  const me = await myPresence(user.id);
  if (!me) throw new HttpError(409, 'Share your location to post in the local room');

  const message = await NearbyMessage.create({
    sender: user.id,
    senderName: nameOf(account),
    senderToken: senderToken(user.id),
    body,
    location: me.location,
  });
  const realSender = { id: user.id, username: user.username };

  // Recipients are everyone whose own 1 km circle contains the sender.
  // Admins get the real account behind the alias for moderation; nobody else does.
  const recipients = await presentNear(me.location);
  const idsWhere = (admin: boolean) =>
    recipients.filter((p) => (p.user.role === 'admin') === admin).map((p) => p.user._id.toString());
  emitToUsers(idsWhere(false), 'nearby:message', toNearbyMessageDTO(message));
  emitToUsers(idsWhere(true), 'nearby:message', toNearbyMessageDTO(message, realSender));

  return toNearbyMessageDTO(message, user.role === 'admin' ? realSender : undefined);
}

/** Moderation: removes a local message for everyone around it. */
export async function removeNearbyMessage(messageId: string): Promise<void> {
  if (!isObjectId(messageId)) throw notFound('Message not found');
  const message = await NearbyMessage.findByIdAndDelete(messageId).lean();
  if (!message) throw notFound('Message not found');
  const recipients = await presentNear(message.location);
  emitToUsers(
    recipients.map((p) => p.user._id.toString()),
    'nearby:message-deleted',
    { id: messageId },
  );
}

