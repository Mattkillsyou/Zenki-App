import React, { useEffect, useRef } from 'react';
import { ActivityMapProps } from './ActivityMap.types';

const DEFAULT_LAT = 34.1006;
const DEFAULT_LNG = -118.2916;

/**
 * Clean Leaflet map for non-Matrix themes.
 * Uses CartoDB dark tiles by default; the optional `tileFilter` lets a theme
 * tint the tiles via CSS filter (e.g. amber for Nostromo, blue for Sheikah).
 * Empty `tileFilter` = unmodified tiles.
 *
 * Native builds pick up `ActivityMap.native.tsx` instead.
 */
export function ActivityMap({ routeCoords, userLat, userLng, tileFilter, accentColor }: ActivityMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const polylineRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const tilePaneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = require('leaflet');

    // Inject Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('activity-map-css')) {
      const style = document.createElement('style');
      style.id = 'activity-map-css';
      style.textContent = `
        .activity-map-container .leaflet-container { z-index: 1 !important; background: transparent; }
        .activity-map-container .leaflet-pane { z-index: 1 !important; }
      `;
      document.head.appendChild(style);
    }

    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [userLat || DEFAULT_LAT, userLng || DEFAULT_LNG],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
    }).addTo(map);

    const userIcon = L.divIcon({
      html: `<div style="
        width: 16px; height: 16px;
        border: 2px solid #FFFFFF;
        background: ${accentColor};
        border-radius: 50%;
        box-shadow: 0 0 0 4px ${accentColor}33, 0 2px 8px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });
    markerRef.current = L.marker(
      [userLat || DEFAULT_LAT, userLng || DEFAULT_LNG],
      { icon: userIcon },
    ).addTo(map);

    polylineRef.current = L.polyline([], {
      color: accentColor,
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1,
    }).addTo(map);

    mapRef.current = map;

    const tilePane = map.getPane('tilePane');
    tilePaneRef.current = tilePane || null;
    if (tilePane && tileFilter) tilePane.style.filter = tileFilter;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply / update tile filter when theme changes
  useEffect(() => {
    if (tilePaneRef.current) {
      tilePaneRef.current.style.filter = tileFilter || '';
    }
  }, [tileFilter]);

  // Update marker + polyline color when theme changes
  useEffect(() => {
    if (polylineRef.current) {
      polylineRef.current.setStyle({ color: accentColor });
    }
    if (markerRef.current) {
      const L = require('leaflet');
      markerRef.current.setIcon(L.divIcon({
        html: `<div style="
          width: 16px; height: 16px;
          border: 2px solid #FFFFFF;
          background: ${accentColor};
          border-radius: 50%;
          box-shadow: 0 0 0 4px ${accentColor}33, 0 2px 8px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: '',
      }));
    }
  }, [accentColor]);

  // Update marker position + center on user
  useEffect(() => {
    if (!mapRef.current) return;
    if (userLat && userLng) {
      markerRef.current?.setLatLng([userLat, userLng]);
      mapRef.current.setView([userLat, userLng], mapRef.current.getZoom(), { animate: true });
    }
    if (routeCoords.length > 0) {
      polylineRef.current?.setLatLngs(routeCoords.map((c: any) => [c.lat, c.lng]));
    }
  }, [userLat, userLng, routeCoords]);

  return (
    <div
      className="activity-map-container"
      ref={mapContainerRef as any}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
