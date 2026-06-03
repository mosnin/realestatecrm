'use client';

/**
 * Editorial visuals — abstract, paper-flat decorative marks for the home page.
 *
 * Two exports, one vocabulary: concentric/intersecting geometry on neutral
 * surfaces, hairline strokes, a single earned orange accent. No images, no
 * noise, no shadows. Tokens only — works in light and dark. SSR-safe: every
 * value is derived deterministically, never from Math.random at render.
 *
 * - `ArticleCover`   three distinct-but-related blog-card covers, 16/10.
 * - `MonogramAvatar` a soft token-gradient circle keyed off a seed string.
 */

import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Deterministic 32-bit FNV-1a hash — SSR-stable, no Math.random. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* ArticleCover                                                        */
/* ------------------------------------------------------------------ */

export function ArticleCover({
  variant,
  className,
}: {
  variant: 1 | 2 | 3;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const drift = reduce ? undefined : { x: [0, 6, 0], y: [0, -4, 0] };
  const slow = (d: number) => ({
    duration: 26 + d,
    repeat: Infinity,
    ease: 'easeInOut' as const,
  });

  return (
    <div
      className={cn(
        'relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border/70 bg-card',
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 160 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Variant 1 — concentric arcs drifting off a corner. */}
        {variant === 1 && (
          <>
            <motion.g
              className="text-foreground/[0.08]"
              animate={drift}
              transition={slow(0)}
            >
              {[18, 32, 46, 60, 74].map((r) => (
                <circle
                  key={r}
                  cx="124"
                  cy="20"
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.75"
                />
              ))}
            </motion.g>
            <circle cx="124" cy="20" r="4" className="fill-brand/80" />
          </>
        )}

        {/* Variant 2 — quiet diagonal field crossed by one hairline plane. */}
        {variant === 2 && (
          <>
            <motion.g
              className="text-foreground/[0.07]"
              animate={reduce ? undefined : { x: [0, -8, 0] }}
              transition={slow(4)}
            >
              {Array.from({ length: 11 }).map((_, i) => (
                <line
                  key={i}
                  x1={i * 18 - 20}
                  y1="0"
                  x2={i * 18 - 60}
                  y2="100"
                  stroke="currentColor"
                  strokeWidth="0.75"
                />
              ))}
            </motion.g>
            <line
              x1="0"
              y1="64"
              x2="160"
              y2="40"
              className="stroke-border"
              strokeWidth="1"
            />
            <circle cx="118" cy="46" r="3" className="fill-brand/80" />
          </>
        )}

        {/* Variant 3 — stacked offset rectangles, one slow parallax. */}
        {variant === 3 && (
          <>
            <rect
              x="30"
              y="22"
              width="100"
              height="56"
              rx="6"
              fill="none"
              className="stroke-foreground/[0.10]"
              strokeWidth="0.75"
            />
            <motion.rect
              x="44"
              y="34"
              width="100"
              height="56"
              rx="6"
              fill="none"
              className="stroke-foreground/[0.07]"
              strokeWidth="0.75"
              animate={drift}
              transition={slow(2)}
            />
            <rect
              x="16"
              y="10"
              width="100"
              height="56"
              rx="6"
              className="fill-muted/40"
            />
            <circle cx="116" cy="66" r="3" className="fill-brand/80" />
          </>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MonogramAvatar                                                      */
/* ------------------------------------------------------------------ */

export function MonogramAvatar({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const id = useId();
  const h = hash(seed);
  // Deterministic geometry: gradient angle, focal point, spin, accent.
  const angle = h % 360;
  const fx = 30 + (h % 40);
  const fy = 25 + ((h >> 8) % 40);
  const spin = (h >> 4) % 360;
  const accent = (h & 7) === 0; // ~1 in 8 wears the orange dot

  return (
    <div
      className={cn(
        'relative aspect-square w-10 shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted',
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <defs>
          <linearGradient
            id={`mg-${id}`}
            gradientTransform={`rotate(${angle} 0.5 0.5)`}
          >
            <stop
              offset="0%"
              className="text-foreground/[0.10]"
              stopColor="currentColor"
            />
            <stop
              offset="100%"
              className="text-foreground/0"
              stopColor="currentColor"
            />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill={`url(#mg-${id})`} />
        <g
          className="text-foreground/[0.14]"
          transform={`rotate(${spin} ${fx} ${fy})`}
        >
          <circle
            cx={fx}
            cy={fy}
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
          />
          <circle
            cx={fx}
            cy={fy}
            r="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
          />
        </g>
        {accent && <circle cx={fx} cy={fy} r="1.6" className="fill-brand/80" />}
      </svg>
    </div>
  );
}
