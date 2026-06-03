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

  // Only colorBack changes between modes; the blooms stay as authored.
  const colorBack = isDark ? 'hsl(240, 9%, 4%)' : 'hsl(32, 60%, 98%)';

  return (
    <div className={cn('absolute inset-0', className)} aria-hidden>
      {mounted && (
        <GrainGradient
          style={{ height: '100%', width: '100%' }}
          colorBack={colorBack}
          softness={0.76}
          intensity={0.45}
          noise={0}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1}
          rotation={0}
          speed={1}
          colors={['hsl(14, 100%, 57%)', 'hsl(45, 100%, 51%)', 'hsl(340, 82%, 52%)']}
        />
      )}
    </div>
  );
}
