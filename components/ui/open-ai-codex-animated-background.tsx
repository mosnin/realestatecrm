'use client';

/**
 * UnicornStudio-backed animated WebGL background ("OpenAI Codex" scene).
 *
 * Uses the package's Next.js entry (`unicornstudio-react/next`) — it is marked
 * `"use client"`, loads the SDK in a Next-aware way, and is the documented
 * import for the App Router. The default `unicornstudio-react` entry does NOT
 * initialize reliably under Next's bundler (you get a dead/black canvas).
 *
 * Renders an absolutely-positioned, full-size canvas so it can sit behind hero
 * content. `projectId` is a prop (defaults to the Codex scene) so the scene can
 * be swapped without editing this file.
 */

import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { UnicornScene } from 'unicornstudio-react/next';

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

export interface CodexAnimatedBackgroundProps {
  /** UnicornStudio project id. Defaults to the Codex scene. */
  projectId?: string;
  className?: string;
}

export const Component = ({
  projectId = '1grEuiVDSVmyvEMAYhA6',
  className,
}: CodexAnimatedBackgroundProps = {}) => {
  const { width, height } = useWindowSize();

  // Don't mount the scene until we have real dimensions (0×0 renders nothing).
  if (!width || !height) return null;

  return (
    <div className={cn('absolute inset-0 flex items-center justify-center overflow-hidden', className)}>
      <UnicornScene production projectId={projectId} width={width} height={height} />
    </div>
  );
};
