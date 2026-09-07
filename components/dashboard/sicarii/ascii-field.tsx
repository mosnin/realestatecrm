"use client";

import { useEffect, useRef } from "react";

/**
 * The CRM's signature: a field of ASCII characters that flow like something
 * being assembled. Rendered to canvas for performance; honours
 * prefers-reduced-motion (draws a single static frame).
 *
 * `gradient` paints the characters along a flowing blue→purple gradient
 * (used on the marketing site); otherwise it uses the baby-blue brand tone.
 */
const GRADIENT_STOPS: [number, number, number][] = [
  [90, 176, 232], // baby blue   #5AB0E8
  [91, 141, 239], // blue        #5B8DEF
  [124, 119, 240], // indigo     #7C77F0
  [167, 139, 250], // purple     #A78BFA
];

function lerpStop(t: number): [number, number, number] {
  const clamped = ((t % 1) + 1) % 1;
  const seg = clamped * (GRADIENT_STOPS.length - 1);
  const i = Math.min(GRADIENT_STOPS.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = GRADIENT_STOPS[i];
  const b = GRADIENT_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function AsciiField({
  className,
  speed = 0.05,
  cell = 12,
  gradient = false,
}: {
  className?: string;
  speed?: number;
  cell?: number;
  gradient?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ramp = " .·:-=+*≡#%@";
    const cw = cell * 0.62; // monospace cell width
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let t = Math.random() * 100;
    let raf = 0;
    let last = 0;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const field = (x: number, y: number, tt: number) => {
      const cx = cols / 2;
      const cy = rows / 2;
      const v =
        Math.sin(x * 0.18 + tt) +
        Math.sin(y * 0.22 + tt * 0.7) +
        Math.sin((x + y) * 0.09 + tt * 1.1) +
        Math.sin(Math.hypot(x - cx, y - cy) * 0.13 - tt * 1.25);
      return (v + 4) / 8; // ~0..1
    };

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = field(x, y, t);
          const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(v * (ramp.length - 1))));
          const ch = ramp[idx];
          if (ch === " ") continue;
          const a = 0.06 + v * 0.5;
          if (gradient) {
            // Flowing blue→purple gradient: hue follows x position + time, so
            // the colour drifts across the field as it animates.
            const [r, g, b] = lerpStop(x / Math.max(1, cols) + (y / Math.max(1, rows)) * 0.25 + t * 0.03);
            ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          } else {
            ctx.fillStyle =
              v > 0.86 ? `rgba(143,204,242,${a.toFixed(3)})` : `rgba(90,176,232,${a.toFixed(3)})`;
          }
          ctx.fillText(ch, x * cw, y * cell);
        }
      }
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${cell}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textBaseline = "top";
      cols = Math.ceil(r.width / cw) + 1;
      rows = Math.ceil(r.height / cell) + 1;
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Only animate while the canvas is actually on screen. The marketing page
    // mounts many fields at once (hero, the band, CTA, showcase, one per card);
    // running every loop simultaneously is what makes it lag. Pause the offscreen
    // ones (they keep their last static frame) and resume on scroll into view.
    // Also pause when the tab is hidden.
    const startLoop = () => {
      if (raf || reduce) return;
      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop);
        if (ts - last < 33) return; // ~30 fps - alive but easy
        last = ts;
        t += speed;
        draw();
      };
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    let onScreen = false;
    const update = () => {
      if (onScreen && !document.hidden) startLoop();
      else stopLoop();
    };

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? false;
        update();
      },
      { rootMargin: "120px" },
    );
    io.observe(canvas);

    const onVisibility = () => update();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [speed, cell, gradient]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
