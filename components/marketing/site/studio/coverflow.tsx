'use client';

/**
 * Coverflow, a 3D cover-flow carousel of content cards. Adapted from the
 * source feature-carousel to render arbitrary card nodes (real Studio output
 * mocks) instead of external <img> tiles, so nothing 404s and the cards read
 * as actual posts. Auto-advances; arrows scrub. Reduced motion: no auto-play,
 * no blur, the center card and its neighbors sit still.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from 'framer-motion';

export function Coverflow({ cards, className }: { cards: React.ReactNode[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = React.useState(Math.floor(cards.length / 2));
  const reduce = useReducedMotion();

  const next = React.useCallback(
    () => setCurrentIndex((i) => (i + 1) % cards.length),
    [cards.length],
  );
  const prev = () => setCurrentIndex((i) => (i - 1 + cards.length) % cards.length);

  React.useEffect(() => {
    if (reduce) return;
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [next, reduce]);

  return (
    <div className={cn('relative flex h-[420px] w-full items-center justify-center sm:h-[460px]', className)}>
      <div className="relative flex h-full w-full items-center justify-center [perspective:1100px]">
        {cards.map((card, index) => {
          const total = cards.length;
          let pos = (index - currentIndex + total) % total;
          if (pos > Math.floor(total / 2)) pos -= total;
          const isCenter = pos === 0;
          const isAdjacent = Math.abs(pos) === 1;
          return (
            <div
              key={index}
              className="absolute h-[380px] w-[208px] transition-all duration-500 ease-in-out sm:h-[420px] sm:w-[232px]"
              style={{
                transform: `translateX(${pos * 50}%) scale(${isCenter ? 1 : isAdjacent ? 0.86 : 0.7}) rotateY(${pos * -10}deg)`,
                zIndex: isCenter ? 10 : isAdjacent ? 5 : 1,
                opacity: isCenter ? 1 : isAdjacent ? 0.5 : 0,
                filter: isCenter || reduce ? 'blur(0px)' : 'blur(3px)',
                visibility: Math.abs(pos) > 1 ? 'hidden' : 'visible',
              }}
              aria-hidden={!isCenter}
            >
              {card}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Previous"
        onClick={prev}
        className="absolute left-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/70 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/[0.06] sm:left-6"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={next}
        className="absolute right-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/70 text-foreground backdrop-blur-sm transition-colors hover:bg-foreground/[0.06] sm:right-6"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
