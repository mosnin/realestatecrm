'use client';

/**
 * PointerHighlight, draws a hand-pointer + a rectangle around an inline word
 * as it scrolls into view. We use it to mark the moments the copy talks about
 * working WITH Chippi (collaborate, teammate, alongside), so the brand mark
 * (orange) is earned here, not decoration. Reduced motion renders the box
 * already drawn, pointer parked, no travel.
 */

import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

export function PointerHighlight({
  children,
  rectangleClassName,
  pointerClassName,
  containerClassName,
}: {
  children: React.ReactNode;
  rectangleClassName?: string;
  pointerClassName?: string;
  containerClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setDimensions({ width, height });
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <span className={cn('relative inline-block w-fit', containerClassName)} ref={containerRef}>
      {children}
      {dimensions.width > 0 && dimensions.height > 0 && (
        <motion.span
          className="pointer-events-none absolute inset-0 z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          aria-hidden
        >
          <motion.span
            className={cn('absolute inset-0 block border border-brand/60', rectangleClassName)}
            initial={{ width: reduce ? dimensions.width : 0, height: reduce ? dimensions.height : 0 }}
            whileInView={{ width: dimensions.width, height: dimensions.height }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: reduce ? 0 : 0.9, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute block"
            initial={{
              opacity: reduce ? 1 : 0,
              x: reduce ? dimensions.width + 4 : 0,
              y: reduce ? dimensions.height + 4 : 0,
            }}
            whileInView={{ opacity: 1, x: dimensions.width + 4, y: dimensions.height + 4 }}
            viewport={{ once: true, margin: '-40px' }}
            style={{ rotate: -90 }}
            transition={{ opacity: { duration: 0.1 }, duration: reduce ? 0 : 0.9, ease: 'easeInOut' }}
          >
            <Pointer className={cn('h-5 w-5 text-brand', pointerClassName)} />
          </motion.span>
        </motion.span>
      )}
    </span>
  );
}

function Pointer(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" />
    </svg>
  );
}
