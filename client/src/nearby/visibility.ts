import type { VisibilityScope } from '../types';

export const VISIBILITY_OPTIONS: { value: VisibilityScope; label: string; description: string }[] = [
  {
    value: 'hidden',
    label: 'Hidden',
    description: "You can chat, but you don't appear on anyone's map.",
  },
  {
    value: 'approximate',
    label: 'Approximate',
    description: 'People nearby see a ~500 m area you are somewhere in – never your exact spot.',
  },
  {
    value: 'contacts',
    label: 'Precise, contacts only',
    description: "People you've messaged directly see your exact spot. Everyone else doesn't see you.",
  },
  {
    value: 'everyone',
    label: 'Precise, everyone nearby',
    description: 'Everyone within 1 km sees your exact spot on the map.',
  },
];

export const formatDistance = (meters: number) =>
  meters < 1000 ? `~${meters} m` : `~${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`;
