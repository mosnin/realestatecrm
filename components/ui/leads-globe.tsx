'use client';

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

const LEAD_MARKERS = [
  { label: 'Hot Lead', lat: 40.7, lng: -74.0 },      // NYC
  { label: 'New Renter', lat: 34.05, lng: -118.24 },  // LA
  { label: 'Pre-approved', lat: 41.88, lng: -87.63 }, // Chicago
  { label: 'Tour Booked', lat: 29.76, lng: -95.37 },  // Houston
  { label: 'Buyer Lead', lat: 33.45, lng: -112.07 },  // Phoenix
  { label: 'Warm Lead', lat: 47.61, lng: -122.33 },   // Seattle
];

export function LeadsGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);

  useEffect(() => {
    let width = 0;
    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    onResize();
    window.addEventListener('resize', onResize);

    if (!canvasRef.current) return;

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [1, 1, 1],
      markerColor: [1, 0.59, 0.31], // #ff964f in RGB normalized
      glowColor: [1, 1, 1],
      markers: LEAD_MARKERS.map((m) => ({
        location: [m.lat, m.lng] as [number, number],
        size: 0.06,
      })),
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phiRef.current += 0.003;
        }
        state.phi = phiRef.current + pointerInteractionMovement.current;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className={`relative aspect-square ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
          canvasRef.current!.style.cursor = 'grabbing';
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
          canvasRef.current!.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
          canvasRef.current!.style.cursor = 'grab';
        }}
        onMouseMove={(e) => {
          if (pointerInteracting.current !== null) {
            const delta = e.clientX - pointerInteracting.current;
            pointerInteractionMovement.current = delta / 200;
          }
        }}
        style={{ cursor: 'grab' }}
      />

      {/* Lead tags floating around the globe */}
      <div className="absolute top-[12%] left-[8%] animate-pulse">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Hot Lead
        </span>
      </div>
      <div className="absolute top-[22%] right-[6%]" style={{ animationDelay: '1s' }}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Pre-approved
        </span>
      </div>
      <div className="absolute top-[42%] left-[2%]" style={{ animationDelay: '2s' }}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          New Renter
        </span>
      </div>
      <div className="absolute bottom-[28%] right-[4%]" style={{ animationDelay: '0.5s' }}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Tour Booked
        </span>
      </div>
      <div className="absolute bottom-[14%] left-[14%]" style={{ animationDelay: '1.5s' }}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          Buyer Lead
        </span>
      </div>
    </div>
  );
}
