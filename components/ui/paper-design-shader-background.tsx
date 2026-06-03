'use client';

/**
 * GradientBackground — animated grain-gradient shader (paper-design) used as
 * the homepage hero backdrop.
 *
 * Adapted to work in BOTH light and dark mode. The app has no next-themes;
 * dark is driven by the `.dark` class (see globals.css `@custom-variant
 * dark`). So we detect the active scheme from the documentElement class
 * (with a `prefers-color-scheme` fallback) and only swap `colorBack` — the
 * warm color blooms are kept exactly as provided. In light mode the blooms
 * sit on a near-white warm base; in dark mode on a near-black base.
 *
 * Mount-guarded so SSR renders nothing (the shader is decorative, -z-10) and
 * there's no hydration flash of the wrong base color.
 */

import { useEffect, useState } from 'react';
import { GrainGradient } from '@paper-design/shaders-react';
import { cn } from '@/lib/utils';

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const compute = () => {
      if (root.classList.contains('dark')) return setIsDark(true);
      if (root.classList.contains('light')) return setIsDark(false);
      setIsDark(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    };
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', compute);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.('change', compute);
    };
  }, []);
  return isDark;
}

export function GradientBackground({ className }: { className?: string }) {
  const isDark = useIsDark();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Warm-only palette so the field can never bloom to black — a soft Chippi
  // glow on a warm base. Dark mode uses a WARM near-black (not cold/pure
  // black) so the hero stays orange-tinted in both themes.
  const colorBack = isDark ? 'hsl(24, 36%, 7%)' : 'hsl(28, 55%, 98%)';

  return (
    <div className={cn('absolute inset-0', className)} aria-hidden>
      {mounted && (
        <GrainGradient
          style={{ height: '100%', width: '100%' }}
          colorBack={colorBack}
          softness={0.9}
          intensity={0.3}
          noise={0}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1}
          rotation={0}
          speed={0.8}
          colors={['hsl(26, 100%, 73%)', 'hsl(36, 100%, 84%)', 'hsl(20, 100%, 91%)']}
        />
      )}
    </div>
  );
}
