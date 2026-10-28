import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { NearbyPerson } from '../types';
import { formatDistance } from './visibility';

interface NearbyMapProps {
  me: { lat: number; lng: number; accuracy: number | null } | null;
  radiusMeters: number;
  people: NearbyPerson[];
  /** Admin demo mode: clicking the map moves your (simulated) position there. */
  onPick?: (point: { lat: number; lng: number }) => void;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** OpenStreetMap via Leaflet: you, your 1 km area, and the people you're allowed to see. */
export function NearbyMap({ me, radiusMeters, people, onPick }: NearbyMapProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const centeredRef = useRef(false);
  const meRef = useRef(me);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
    meRef.current = me;
  });

  /**
   * Frames your 1 km area – the first time the map has a real size, and again
   * whenever your position moves out of view. Fitting a zero-sized map (before
   * layout settles) would leave it zoomed out.
   */
  const frame = (map: L.Map, force = false) => {
    const current = meRef.current;
    if (!current || map.getSize().x === 0) return;
    const inView = map.getBounds().contains([current.lat, current.lng]);
    if (force || !centeredRef.current || !inView) {
      map.fitBounds(L.latLng(current.lat, current.lng).toBounds(radiusMeters * 2.2));
      centeredRef.current = true;
    }
  };

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([30.38, 69.35], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    centeredRef.current = false;
    map.on('click', (event: L.LeafletMouseEvent) => onPickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
    mapRef.current = map;

    // Leaflet needs a size recalculation when its container is resized (e.g. responsive layout).
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      if (!centeredRef.current) frame(map);
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw markers whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!me) return;

    const primary = theme.palette.primary.main;
    const secondary = theme.palette.secondary.main;

    L.circle([me.lat, me.lng], {
      radius: radiusMeters,
      color: primary,
      weight: 1.5,
      fillOpacity: 0.06,
      dashArray: '6 6',
      interactive: false,
    }).addTo(layer);
    L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: primary, fillOpacity: 1 })
      .bindTooltip('You', { direction: 'top', offset: [0, -8] })
      .addTo(layer);

    for (const person of people) {
      const label = `${escape(person.name)} · ${formatDistance(person.distanceMeters)}${
        person.precision === 'approximate' ? ' (approx.)' : ''
      }`;
      if (person.precision === 'approximate') {
        L.circle([person.lat, person.lng], {
          radius: person.radiusMeters ?? 400,
          color: secondary,
          weight: 1,
          fillOpacity: 0.15,
        })
          .bindTooltip(label)
          .addTo(layer);
      } else {
        L.circleMarker([person.lat, person.lng], {
          radius: 7,
          color: '#fff',
          weight: 2,
          fillColor: secondary,
          fillOpacity: 1,
        })
          .bindTooltip(label, { direction: 'top', offset: [0, -7] })
          .addTo(layer);
      }
    }

    map.invalidateSize();
    frame(map);
  }, [me, people, radiusMeters, theme.palette.primary.main, theme.palette.secondary.main]);

  return (
    <Box
      ref={containerRef}
      role="application"
      aria-label="Map of people near you"
      sx={(t) => ({
        height: '100%',
        minHeight: 260,
        borderRadius: 2,
        overflow: 'hidden',
        cursor: onPick ? 'crosshair' : undefined,
        '& .leaflet-container': { cursor: onPick ? 'crosshair' : undefined, fontFamily: 'inherit' },
        // Darker map tiles in dark mode.
        ...t.applyStyles('dark', {
          '& .leaflet-tile': { filter: 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)' },
        }),
      })}
    />
  );
}
