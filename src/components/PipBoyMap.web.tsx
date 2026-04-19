import React, { useEffect, useRef } from 'react';
import { PipBoyMapProps } from './PipBoyMap.types';

const DEFAULT_LAT = 34.1006;
const DEFAULT_LNG = -118.2916;

/**
 * Leaflet map with Pip-Boy green monochrome filter.
 * CartoDB dark tiles + CSS hue-rotate to force green terminal look.
 *
 * Native builds pick up `PipBoyMap.native.tsx` instead, which doesn't pull
 * the Leaflet dependency into the bundle.
 */
export function PipBoyMap({ routeCoords, userLat, userLng }: PipBoyMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const polylineRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    // Only on web (this file is already platform-scoped, but belt+suspenders)
    if (typeof window === 'undefined') return;
    const L = require('leaflet');

    // Inject Leaflet CSS + VT323 font
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('vt323-font')) {
      const link = document.createElement('link');
      link.id = 'vt323-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=VT323&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('pipboy-css')) {
      const style = document.createElement('style');
      style.id = 'pipboy-css';
      style.textContent = `
        @keyframes pipboy-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.97; }
          75% { opacity: 0.99; }
        }
        .pipboy-scanlines {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 255, 65, 0.03) 2px,
            rgba(0, 255, 65, 0.03) 4px
          );
          pointer-events: none;
          z-index: 9999;
        }
        .pipboy-screen {
          animation: pipboy-flicker 4s infinite;
        }
        .pipboy-map-filter {
          filter: grayscale(1) brightness(0.6) sepia(1) hue-rotate(70deg) saturate(8);
        }
        .leaflet-container { z-index: 1 !important; }
        .leaflet-pane { z-index: 1 !important; }
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
        width: 14px; height: 14px;
        border: 2px solid #00ff41;
        background: transparent;
        box-shadow: 0 0 8px #00ff41, 0 0 16px #00ff4140;
        animation: pipboy-flicker 1s infinite;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: '',
    });
    markerRef.current = L.marker(
      [userLat || DEFAULT_LAT, userLng || DEFAULT_LNG],
      { icon: userIcon },
    ).addTo(map);

    polylineRef.current = L.polyline([], {
      color: '#00ff41',
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1,
    }).addTo(map);

    mapRef.current = map;

    const tilePane = map.getPane('tilePane');
    if (tilePane) tilePane.classList.add('pipboy-map-filter');

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      ref={mapContainerRef as any}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
