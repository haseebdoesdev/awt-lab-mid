import { useEffect, useRef, useState } from 'react';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

export type GeoStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'unsupported';

const MIN_MOVE_METERS = 30;
const MIN_INTERVAL_MS = 15_000;
/** Re-sends the last fix so the server doesn't expire it while you sit still. */
const HEARTBEAT_MS = 2 * 60_000;

function metersBetween(a: Fix, b: Fix): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_378_100 * Math.asin(Math.sqrt(h));
}

/**
 * Watches the device position (Geolocation API) while `enabled` and calls
 * `onFix` when it changes meaningfully – at most every 15 s, or after moving
 * 30 m – plus a heartbeat every 2 minutes.
 */
export function useGeolocation(enabled: boolean, onFix: (fix: Fix) => void) {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const onFixRef = useRef(onFix);

  useEffect(() => {
    onFixRef.current = onFix;
  });

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setStatus('unsupported');
      return;
    }

    setStatus('locating');
    let last: { fix: Fix; at: number } | null = null;
    const send = (fix: Fix) => {
      last = { fix, at: Date.now() };
      onFixRef.current(fix);
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setStatus('active');
        const fix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        };
        if (!last || metersBetween(last.fix, fix) >= MIN_MOVE_METERS || Date.now() - last.at >= MIN_INTERVAL_MS) {
          send(fix);
        }
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    const heartbeat = window.setInterval(() => {
      if (last && Date.now() - last.at >= HEARTBEAT_MS) send(last.fix);
    }, 30_000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeat);
    };
  }, [enabled]);

  return status;
}
