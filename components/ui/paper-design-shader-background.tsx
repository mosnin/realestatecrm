'use client';

/**
 * GradientBackground — the marketing hero's living surface.
 *
 * The owner-provided @paper-design GrainGradient, wired for this site:
 *  - Theme-responsive: watches the <html> `dark` class (works with the site's
 *    ThemeProvider without coupling to a specific theme library) and swaps the
 *    backdrop color so the gradient melts into the light canvas or true black.
 *  - Reduced-motion: the shader parks (speed 0) for anyone who asked for still.
 *  - Mount-gated WebGL with a static CSS gradient underneath, so first paint
 *    is colorful and SSR/hydration never sees a canvas mismatch.
 *
 * Palette is the owner's spec: vermillion → gold → raspberry.
 */

import { useEffect, useState } from 'react';
import { GrainGradient } from '@paper-design/shaders-react';

const COLORS = ['hsl(14, 100%, 57%)', 'hsl(45, 100%, 51%)', 'hsl(340, 82%, 52%)'];

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains('dark'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function useReducedMotionFlag(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduce;
}

export function GradientBackground() {
  const [mounted, setMounted] = useState(false);
  const dark = useIsDark();
  const reduce = useReducedMotionFlag();
  useEffect(() => setMounted(true), []);

  return (
    <div className="absolute inset-0 -z-10">
      {/* Static fallback — first paint + no-WebGL environments. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(130%_130%_at_85%_0%,hsl(45,100%,51%)_0%,hsl(14,100%,57%)_48%,hsl(340,82%,52%)_100%)]"
      />
      {mounted ? (
        <GrainGradient
          style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
          colorBack={dark ? 'hsl(240, 4%, 4%)' : 'hsl(30, 18%, 96%)'}
          softness={0.76}
          intensity={0.45}
          noise={0}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1}
          rotation={0}
          speed={reduce ? 0 : 1}
          colors={COLORS}
        />
      ) : null}
    </div>
  );
}
