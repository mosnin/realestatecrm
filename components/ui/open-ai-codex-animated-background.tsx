'use client';

/**
 * UnicornStudio-backed animated WebGL background ("OpenAI Codex" scene).
 *
 * Lives in /components/ui because it's a reusable shadcn-style primitive.
 * `'use client'` is required — it reads `window` and mounts a WebGL canvas, so
 * it cannot render on the server. Consumers that care about SSR should import
 * it via `next/dynamic` with `ssr: false` (the marketing hero does).
 *
 * `projectId` defaults to the Codex scene but is a prop so the scene can be
 * swapped without editing this file.
 */

import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import UnicornScene from 'unicornstudio-react';

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

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
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

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <UnicornScene production={true} projectId={projectId} width={width} height={height} />
    </div>
  );
};
