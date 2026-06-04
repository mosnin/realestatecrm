'use client';

/**
 * AsciiBlob — an animated orange ASCII gradient that drifts around the
 * background. Two soft metaball centers wander on slow sine paths; each cell
 * samples the field and renders a monospace glyph from a light→dense ramp,
 * tinted Chippi orange with field-weighted alpha. Pure canvas, cheap (only
 * cells inside the blob draw), reduced-motion renders a single static frame.
 *
 * Orange-on-transparent, so it reads on both light and dark — the page
 * surface shows through.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

const RAMP = ' .:-=+*ox#%@';
const CELL = 16; // px per glyph

export function AsciiBlob({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, cols = 0, rows = 0, raf = 0, t = 0;

    const resize = () => {
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CELL);
      rows = Math.ceil(H / CELL);
      ctx.font = `${CELL}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'top';
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      const m = Math.min(W, H);
      // two wandering blob centers
      const cx1 = W * (0.42 + 0.26 * Math.sin(t * 0.17));
      const cy1 = H * (0.42 + 0.30 * Math.cos(t * 0.12));
      const cx2 = W * (0.60 + 0.30 * Math.cos(t * 0.10));
      const cy2 = H * (0.55 + 0.26 * Math.sin(t * 0.20));
      const r1 = m * 0.55, r2 = m * 0.46;
      for (let gy = 0; gy < rows; gy++) {
        const y = gy * CELL;
        for (let gx = 0; gx < cols; gx++) {
          const x = gx * CELL;
          const v1 = Math.max(0, 1 - Math.hypot(x - cx1, y - cy1) / r1);
          const v2 = Math.max(0, 1 - Math.hypot(x - cx2, y - cy2) / r2) * 0.85;
          const v = Math.min(1, v1 + v2);
          if (v < 0.07) continue;
          const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
          if (ch === ' ') continue;
          ctx.fillStyle = `rgba(255,150,79,${(0.08 + v * 0.5).toFixed(3)})`;
          ctx.fillText(ch, x, y);
        }
      }
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) render();
    });
    ro.observe(parent);

    if (reduce) {
      render();
    } else {
      const loop = () => {
        render();
        t += 0.016;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  );
}
